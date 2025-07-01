import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '../../utils/logger';

export interface CardRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  cardIndex: number; // 1, 2, or 3
}

export interface RegionConfig {
  regions: CardRegion[];
  screenResolution: { width: number; height: number };
  lastUpdated: string;
  version: string;
}

/**
 * Service for managing manual card region configurations
 * Allows users to define and save custom card detection areas
 */
export class RegionConfigService {
  private configPath: string;
  private currentConfig: RegionConfig | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'card-regions.json');
    logger.info('RegionConfigService initialized', { configPath: this.configPath });
  }

  /**
   * Load saved region configuration
   */
  async loadConfig(): Promise<RegionConfig | null> {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.currentConfig = JSON.parse(data);
      logger.info('Region config loaded', { 
        regionCount: this.currentConfig?.regions.length,
        resolution: this.currentConfig?.screenResolution 
      });
      return this.currentConfig;
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Error loading region config', { error });
      }
      return null;
    }
  }

  /**
   * Save region configuration
   */
  async saveConfig(regions: CardRegion[], screenResolution: { width: number; height: number }): Promise<void> {
    const config: RegionConfig = {
      regions: regions.sort((a, b) => a.cardIndex - b.cardIndex),
      screenResolution,
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    };

    try {
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      this.currentConfig = config;
      logger.info('Region config saved', { 
        regionCount: regions.length,
        resolution: screenResolution 
      });
    } catch (error) {
      logger.error('Error saving region config', { error });
      throw error;
    }
  }

  /**
   * Get current regions if available and compatible with current screen resolution
   */
  async getCurrentRegions(currentResolution: { width: number; height: number }): Promise<CardRegion[] | null> {
    if (!this.currentConfig) {
      await this.loadConfig();
    }

    if (!this.currentConfig) {
      return null;
    }

    // Check if resolution matches (allow small differences for taskbar, etc.)
    const resolutionMatch = 
      Math.abs(this.currentConfig.screenResolution.width - currentResolution.width) <= 50 &&
      Math.abs(this.currentConfig.screenResolution.height - currentResolution.height) <= 50;

    if (!resolutionMatch) {
      logger.warn('Screen resolution changed, regions may need reconfiguration', {
        saved: this.currentConfig.screenResolution,
        current: currentResolution
      });
      return null;
    }

    return this.currentConfig.regions;
  }

  /**
   * Check if regions are configured and valid
   */
  async hasValidRegions(currentResolution: { width: number; height: number }): Promise<boolean> {
    const regions = await this.getCurrentRegions(currentResolution);
    return regions !== null && regions.length === 3;
  }

  /**
   * Clear saved regions
   */
  async clearConfig(): Promise<void> {
    try {
      await fs.unlink(this.configPath);
      this.currentConfig = null;
      logger.info('Region config cleared');
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Error clearing region config', { error });
        throw error;
      }
    }
  }

  /**
   * Get config file path for debugging
   */
  getConfigPath(): string {
    return this.configPath;
  }
} 