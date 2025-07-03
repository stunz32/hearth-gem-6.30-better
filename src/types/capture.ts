/**
 * Interface definitions for the screen capture service
 */

export interface ICaptureRegionArgs {
  /** inclusive, device-pixel coords */
  x: number; 
  y: number; 
  width: number; 
  height: number;
  name?: string;
}

/** 
 * Capture region type used by the existing code
 */
export interface CaptureRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  relative?: boolean;
}

/** 
 * Raw PNG bytes result 
 */
export type RawPngBuffer = Uint8Array;

/** 
 * Capture result for compatibility with existing code
 */
export interface CaptureResult {
  dataUrl: string;
  region?: CaptureRegion;
  timestamp?: number;
  success?: boolean;
  error?: string;
}

/**
 * Combined capture result type for compatibility
 */
export interface CaptureRegionResult extends RawPngBuffer {
  dataUrl?: string;
  region?: CaptureRegion;
  timestamp?: number;
  success?: boolean;
  error?: string;
}

/**
 * Interface for the screen capture service
 */
export interface IScreenCaptureService {
  /**
   * Captures a specific region of the screen
   * @param args Region coordinates and dimensions
   * @returns Promise resolving to raw PNG bytes with compatibility properties
   */
  captureRegion(args: ICaptureRegionArgs | CaptureRegion): Promise<CaptureRegionResult>;
} 