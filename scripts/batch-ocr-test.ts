/* ----------------------------------------------------------
 * Batch OCR test-bench for Hearthstone card images (parameter sweep)
 * ----------------------------------------------------------
 * Usage examples:
 *   npx ts-node scripts/batch-ocr-test.ts --files img1.png img2.png
 *   npm run test-ocr -- --files path\to\img.png --expected "Fireball"
 * --------------------------------------------------------- */

import path from 'path';
import minimist from 'minimist';
import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';

type Pipeline = 'full' | 'banner';

interface SweepParams {
  scale: number;          // scale-up factor
  threshold: number | null; // null = no threshold
  blur: boolean;          // apply slight blur before threshold
  gamma?: number;         // gamma correction factor (1 = none)
}

interface OcrResult {
  file: string;
  pipeline: Pipeline;
  params: SweepParams;
  ocr: string;
  conf: number;
}

// ---------- CLI -------------------------------------------------------------
const argv = minimist(process.argv.slice(2));
const files = argv.files ? (Array.isArray(argv.files) ? argv.files : [argv.files]) : [];
const expected = argv.expected ? (Array.isArray(argv.expected) ? argv.expected : [argv.expected]) : [];

if (files.length === 0) {
  console.error('✖  No images provided. Use --files path1 path2');
  process.exit(1);
}

// ---------- Parameter sweep configuration ----------------------------------
const scales = [2, 3, 4, 5, 6]; // up-scale factors
const thresholds: Array<number | null> = [null, 100, 110, 120, 128, 140, 150, 160, 180, 200];
const blurs = [false, true];
const gammas = [1, 1.2, 1.4]; // gamma correction factors (1 = none)

const sweepParams: SweepParams[] = [];
scales.forEach(scale => {
  thresholds.forEach(th => {
    blurs.forEach(blur => {
      gammas.forEach(gamma => {
        sweepParams.push({ scale, threshold: th, blur, gamma });
      });
    });
  });
});

// ---------- Helpers ---------------------------------------------------------
async function preprocess(imgPath: string, pipeline: Pipeline, p: SweepParams): Promise<Buffer> {
  let img = sharp(imgPath).ensureAlpha();

  const meta = await img.metadata();

  // Crop name banner if pipeline === 'banner'
  if (pipeline === 'banner' && meta.height && meta.width) {
    const y = Math.round(meta.height * 0.12);
    const height = Math.round(meta.height * 0.17);
    img = img.extract({ left: 0, top: y, width: meta.width, height });
  }

  // Scale up
  if (p.scale > 1 && meta.width) {
    img = img.resize({ width: meta.width * p.scale });
  }

  if (p.blur) {
    img = img.blur(1);
  }

  img = img.grayscale();

  if (p.gamma && p.gamma !== 1) {
    img = img.gamma(p.gamma);
  }

  img = img.sharpen();

  if (p.threshold !== null) {
    img = img.threshold(p.threshold);
  }

  return img.png().toBuffer();
}

async function runOcr(buf: Buffer) {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\'\",.- ',
    tessedit_pageseg_mode: PSM.SINGLE_LINE
  });
  const { data } = await worker.recognize(buf);
  await worker.terminate();
  return { text: data.text.trim(), confidence: data.confidence };
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length >= b.length ? a : b;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i].toLowerCase() === longer[i].toLowerCase()) matches++;
  }
  return matches / longer.length;
}

// ---------- Main ------------------------------------------------------------
(async () => {
  const results: OcrResult[] = [];

  console.log('Sweeping', sweepParams.length, 'parameter sets across', files.length, 'images...');

  for (const f of files) {
    for (const pipeline of ['full', 'banner'] as Pipeline[]) {
      for (const params of sweepParams) {
        try {
          const buf = await preprocess(f, pipeline, params);
          const { text, confidence } = await runOcr(buf);
          results.push({
            file: path.basename(f),
            pipeline,
            params,
            ocr: text,
            conf: confidence
          });
        } catch (err) {
          console.error('Error', err);
        }
      }
    }
  }

  // Pick best per file using confidence * text length heuristic
  const bestByFile = new Map<string, OcrResult>();
  for (const r of results) {
    const key = r.file;
    const score = r.conf * r.ocr.length;
    const current = bestByFile.get(key);
    const currentScore = current ? current.conf * current.ocr.length : -1;
    if (score > currentScore) {
      bestByFile.set(key, r);
    }
  }

  console.log('\n===== BEST RESULTS =====');
  bestByFile.forEach((r, file) => {
    const exp = expected[files.map(String).indexOf(files.find(f => path.basename(f) === file)!)] || '';
    const sim = similarity(exp, r.ocr).toFixed(3);
    console.log(`${file}  =>  "${r.ocr}"  (conf ${r.conf.toFixed(1)}  length ${r.ocr.length})  pipeline=${r.pipeline}  scale=${r.params.scale} threshold=${r.params.threshold ?? 'none'} blur=${r.params.blur}  similarity=${sim}`);
    console.log(`        gamma=${r.params.gamma ?? 1}`);
  });
})(); 