import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import * as chokidar from 'chokidar';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('services/logReader/LogWatcher');

/**
 * LogWatcher
 * Monitors Hearthstone log files for game events
 * @module LogWatcher
 */
export class LogWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private logDirectory: string;
  private logFiles: Map<string, number> = new Map();
  private seenCardIds: Set<string> = new Set(); // Track unique card IDs within a draft
  
  // Constants
  private static readonly INITIAL_READ_BYTES = 16 * 1024; // 16 KB
  
  /**
   * Creates a new LogWatcher instance
   * @param logDirectory Path to Hearthstone logs directory
   */
  constructor(logDirectory?: string) {
    super();
    
    // Use provided directory, environment variable, or attempt auto-detection
    this.logDirectory = logDirectory || 
      process.env.HEARTHGEM_LOG_DIR || 
      this.autoDetectLogDirectory();
    
    logger.info('LogWatcher initialized', { logDirectory: this.logDirectory });
  }

  /**
   * Start watching log files for changes
   */
  public start(): void {
    logger.info('Starting log file watcher');
    
    try {
      // Emit event that log directory was found
      this.emit('logDirectoryFound', { directory: this.logDirectory });
      
      // Create watcher for log directory
      this.watcher = chokidar.watch(this.logDirectory, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      });

      // Handle file add/change events
      this.watcher
        .on('add', this.handleFileAdd.bind(this))
        .on('change', this.handleFileChange.bind(this));
      
      logger.info('Log watcher started successfully');
    } catch (error) {
      logger.error('Failed to start log watcher', { error });
      throw new Error(`Failed to start log watcher: ${error}`);
    }
  }

  /**
   * Stop watching log files
   */
  public stop(): void {
    logger.info('Stopping log watcher');
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.logFiles.clear();
    }
  }

  /**
   * Handle new log file detection
   * @param filePath Path to the new log file
   * @private
   */
  private handleFileAdd(filePath: string): void {
    const fileName = path.basename(filePath);
    logger.debug('New log file detected', { fileName });
    
    // Track only specific log files we care about
    if (this.shouldTrackFile(fileName)) {
      const stats = fs.statSync(filePath);
      this.logFiles.set(filePath, stats.size);
      logger.info('Started tracking log file', { fileName, size: stats.size });
      
      // Immediately read the tail of the file so we process existing draft state
      const startPos = Math.max(0, stats.size - LogWatcher.INITIAL_READ_BYTES);
      if (stats.size > 0) {
        this.readNewContent(filePath, startPos, stats.size);
      }

      // Emit log file activity event
      this.emit('logFileActivity', { file: fileName, action: 'added', size: stats.size });
    }
  }

  /**
   * Handle log file changes
   * @param filePath Path to the changed log file
   * @private
   */
  private handleFileChange(filePath: string): void {
    const fileName = path.basename(filePath);
    
    // Only process files we're tracking
    if (!this.shouldTrackFile(fileName) || !this.logFiles.has(filePath)) {
      return;
    }

    try {
      const stats = fs.statSync(filePath);
      const previousSize = this.logFiles.get(filePath) || 0;
      const newSize = stats.size;
      
      // If file size increased, read the new content
      if (newSize > previousSize) {
        logger.debug('Log file changed', { fileName, previousSize, newSize });
        this.readNewContent(filePath, previousSize, newSize);
        this.logFiles.set(filePath, newSize);
        
        // Emit log file activity event
        this.emit('logFileActivity', { file: fileName, action: 'changed', previousSize, newSize });
      } else if (newSize < previousSize) {
        // File was truncated or replaced
        logger.info('Log file was truncated or replaced', { fileName });
        this.logFiles.set(filePath, newSize);
      }
    } catch (error) {
      logger.error('Error processing log file change', { fileName, error });
    }
  }

  /**
   * Read new content from a log file
   * @param filePath Path to the log file
   * @param startPosition Starting byte position
   * @param endPosition Ending byte position
   * @private
   */
  private readNewContent(filePath: string, startPosition: number, endPosition: number): void {
    try {
      const fileStream = fs.createReadStream(filePath, {
        start: startPosition,
        end: endPosition - 1
      });

      let newContent = '';
      
      fileStream.on('data', (chunk) => {
        newContent += chunk.toString();
      });

      fileStream.on('end', () => {
        const fileName = path.basename(filePath);
        this.processLogContent(fileName, newContent);
      });

      fileStream.on('error', (error) => {
        logger.error('Error reading log file', { filePath, error });
      });
    } catch (error) {
      logger.error('Failed to read new log content', { filePath, error });
    }
  }

  /**
   * Process new log content and emit appropriate events
   * @param fileName Name of the log file
   * @param content New log content
   * @private
   */
  private processLogContent(fileName: string, content: string): void {
    logger.debug('Processing log content', { fileName, contentLength: content.length });
    
    // Split content into lines and process each line
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    lines.forEach(line => {
      // Emit raw log line event
      this.emit('logLine', { fileName, line });
      
      // Process specific log files
      switch (fileName) {
        case 'Arena.log':
          this.processArenaLog(line);
          break;
        case 'Power.log':
          this.processPowerLog(line);
          break;
        case 'LoadingScreen.log':
          this.processLoadingScreenLog(line);
          break;
      }
    });
  }

  /**
   * Process Arena.log lines
   * @param line Log line from Arena.log
   * @private
   */
  private processArenaLog(line: string): void {
    // Check for draft related events
    if (line.includes('Draft.OnChosen')) {
      const match = line.match(/Draft\.OnChosen\(\): id=(\d+)/);
      if (match && match[1]) {
        const cardId = match[1];
        logger.info('Card chosen in draft', { cardId });
        this.emit('draftCardChosen', { cardId });
      }
    } else if (line.includes('Draft.OnBegin') || line.includes('SetDraftMode - DRAFTING')) {
      logger.info('Draft session started');
      // Reset seen card IDs when starting a new draft
      this.seenCardIds.clear();
      this.emit('draftStarted');
    } else if (line.includes('Draft.OnComplete')) {
      logger.info('Draft session completed');
      this.emit('draftCompleted');
    } else if (line.includes('Hero Card =')) {
      // Parse hero card information
      const match = line.match(/Hero Card = (\w+)/);
      if (match && match[1]) {
        const heroId = match[1];
        logger.info('Hero card detected in draft', { heroId });
        this.emit('heroSelected', heroId);
      }
    } else if (line.includes('Draft deck contains card')) {
      // Parse cards in the draft deck
      const match = line.match(/Draft deck contains card (\w+)/);
      if (match && match[1]) {
        const cardId = match[1];
        
        // Only emit if we haven't seen this card in this draft session
        if (!this.seenCardIds.has(cardId)) {
          logger.info('New card detected in draft deck', { cardId });
          this.seenCardIds.add(cardId);
        this.emit('draftCardDetected', cardId);
        } else {
          logger.debug('Duplicate card detected, skipping', { cardId });
        }
      }
    }
  }

  /**
   * Process Power.log lines
   * @param line Log line from Power.log
   * @private
   */
  private processPowerLog(line: string): void {
    // Check for card offering events
    if (line.includes('SHOW_ENTITY') && line.includes('ZONE=HAND')) {
      const cardIdMatch = line.match(/cardId=(\w+)/);
      if (cardIdMatch && cardIdMatch[1]) {
        const cardId = cardIdMatch[1];
        logger.debug('Card shown', { cardId });
        this.emit('cardShown', { cardId });
      }
    }
  }

  /**
   * Process LoadingScreen.log lines
   * @param line Log line from LoadingScreen.log
   * @private
   */
  private processLoadingScreenLog(line: string): void {
    // Check for game mode changes
    if (line.includes('Gameplay.Start')) {
      if (line.includes('GameType=GT_ARENA')) {
        logger.info('Entered Arena game mode');
        this.emit('arenaGameStarted');
      }
    }
  }

  /**
   * Determine if we should track a specific log file
   * @param fileName Name of the log file
   * @returns Boolean indicating if file should be tracked
   * @private
   */
  private shouldTrackFile(fileName: string): boolean {
    const trackedFiles = ['Arena.log', 'Power.log', 'LoadingScreen.log'];
    return trackedFiles.includes(fileName);
  }

  /**
   * Attempt to locate the Hearthstone Logs directory by scanning mounted drives.
   * Looks for timestamped subdirectories like "Hearthstone_2025_06_30_17_01_05" and finds the newest one.
   * @returns Resolved path to the newest timestamped log directory or default path if detection fails
   * @private
   */
  private autoDetectLogDirectory(): string {
    const defaultPath = path.join(
      process.env.LOCALAPPDATA || '',
      'Blizzard',
      'Hearthstone',
      'Logs'
    );

    // Build candidate base paths for drives A: .. Z:
    const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const baseCandidates: string[] = [
      defaultPath,
      ...driveLetters.map((d) => `${d}:\\Hearthstone\\Logs`)
    ];

    let newestLogDir: string | null = null;
    let newestTimestamp = 0;

    // Check each base directory for timestamped subdirectories
    for (const baseDir of baseCandidates) {
      if (!fs.existsSync(baseDir)) {
        continue;
      }

      try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        
        // Look for timestamped directories like "Hearthstone_2025_06_30_17_01_05"
        const timestampedDirs = entries
          .filter(entry => entry.isDirectory())
          .filter(entry => entry.name.match(/^Hearthstone_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/))
          .map(entry => {
            const fullPath = path.join(baseDir, entry.name);
            // Check if this directory contains log files
            const hasLogs = fs.existsSync(path.join(fullPath, 'Arena.log')) || 
                           fs.existsSync(path.join(fullPath, 'Power.log')) ||
                           fs.existsSync(path.join(fullPath, 'LoadingScreen.log'));
            
            if (hasLogs) {
              // Extract timestamp from directory name for comparison
              const match = entry.name.match(/^Hearthstone_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/);
              if (match) {
                const [, year, month, day, hour, minute, second] = match;
                const timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
                return { path: fullPath, timestamp, name: entry.name };
              }
            }
            return null;
          })
          .filter(Boolean);

        // Find the newest timestamped directory
        for (const dir of timestampedDirs) {
          if (dir && dir.timestamp > newestTimestamp) {
            newestTimestamp = dir.timestamp;
            newestLogDir = dir.path;
            logger.info('Found timestamped log directory', { 
              path: dir.path, 
              name: dir.name,
              timestamp: new Date(dir.timestamp).toISOString()
            });
          }
        }

        // Also check if the base directory itself contains logs (fallback)
        if (!newestLogDir) {
          const hasDirectLogs = fs.existsSync(path.join(baseDir, 'Arena.log')) || 
                               fs.existsSync(path.join(baseDir, 'Power.log'));
          if (hasDirectLogs) {
            const stats = fs.statSync(baseDir);
            if (stats.mtimeMs > newestTimestamp) {
              newestTimestamp = stats.mtimeMs;
              newestLogDir = baseDir;
              logger.info('Found direct log directory', { path: baseDir });
            }
          }
        }
      } catch (error) {
        logger.debug('Error scanning directory for logs', { baseDir, error });
      }
    }

    if (newestLogDir) {
      logger.info('Auto-detected newest Hearthstone log directory', { 
        path: newestLogDir,
        timestamp: new Date(newestTimestamp).toISOString()
      });
      return newestLogDir;
    }

    logger.warn('Auto-detect could not find any Hearthstone log directories, falling back to default', { defaultPath });
    return defaultPath;
  }
}

export default LogWatcher;