/**
 * Interface definitions for the screen capture service
 */

export interface ICaptureRegionArgs {
  /** inclusive, device-pixel coords */
  x: number; 
  y: number; 
  width: number; 
  height: number;
}

/** raw PNG bytes */
export type CaptureRegionResult = Uint8Array;

/**
 * Interface for the screen capture service
 */
export interface IScreenCaptureService {
  /**
   * Captures a specific region of the screen
   * @param args Region coordinates and dimensions
   * @returns Promise resolving to raw PNG bytes
   */
  captureRegion(args: ICaptureRegionArgs): Promise<CaptureRegionResult>;
} 