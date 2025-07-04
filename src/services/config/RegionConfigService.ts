import fs from 'fs';
import path from 'path';
import { getLogger } from '../../utils/logger';

// Create logger instance for this module
const logger = getLogger('src/services/config/RegionConfigService');

/**
 * Interface for card region configuration
 */
export interface CardRegion {
  cardIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Interface for screen configuration
 */
export interface ScreenConfig {
  width: number;
  height: number;
  regions: CardRegion[];
}

/**
 * RegionConfigService
 * Manages configuration for card regions
 */
export class RegionConfigService {
  private static readonly CONFIG_DIR = 'data/config';
  private static readonly CONFIG_FILE = 'regions.json';
  
  /**
   * Creates a new RegionConfigService instance
   */
  constructor() {
    this.ensureConfigDirectory();
  }
  
  /**
   * Ensure the configuration directory exists
   */
  private ensureConfigDirectory(): void {
    const configDir = path.join(process.cwd(), RegionConfigService.CONFIG_DIR);
    
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
        logger.info('Created config directory', { path: configDir });
      } catch (error) {
        logger.error('Failed to create config directory', { path: configDir, error });
      }
    }
  }
  
  /**
   * Get the path to the configuration file
   */
  private getConfigPath(): string {
    return path.join(process.cwd(), RegionConfigService.CONFIG_DIR, RegionConfigService.CONFIG_FILE);
  }
  
  /**
   * Save region configuration
   * @param regions Card regions to save
   * @param screenSize Screen size
   */
  async saveConfig(regions: CardRegion[], screenSize: { width: number; height: number }): Promise<void> {
    try {
      const config: ScreenConfig = {
        width: screenSize.width,
        height: screenSize.height,
        regions
      };
      
      const configPath = this.getConfigPath();
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
      
      logger.info('Saved region configuration', { 
        path: configPath, 
        screenSize, 
        regionCount: regions.length 
      });
    } catch (error) {
      logger.error('Failed to save region configuration', { error });
      throw error;
    }
  }
  
  /**
   * Load region configuration
   * @returns Promise resolving to loaded configuration
   */
  async loadConfig(): Promise<ScreenConfig | null> {
    try {
      const configPath = this.getConfigPath();
      
      if (!fs.existsSync(configPath)) {
        logger.info('No region configuration found', { path: configPath });
        return null;
      }
      
      const configData = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(configData) as ScreenConfig;
      
      logger.info('Loaded region configuration', { 
        path: configPath, 
        screenSize: { width: config.width, height: config.height },
        regionCount: config.regions.length 
      });
      
      return config;
    } catch (error) {
      logger.error('Failed to load region configuration', { error });
      return null;
    }
  }
  
  /**
   * Clear region configuration
   */
  async clearConfig(): Promise<void> {
    try {
      const configPath = this.getConfigPath();
      
      if (fs.existsSync(configPath)) {
        await fs.promises.unlink(configPath);
        logger.info('Cleared region configuration', { path: configPath });
      } else {
        logger.info('No region configuration to clear', { path: configPath });
      }
    } catch (error) {
      logger.error('Failed to clear region configuration', { error });
      throw error;
    }
  }
  
  /**
   * Check if valid regions exist for the current screen size
   * @param screenSize Current screen size
   */
  async hasValidRegions(screenSize: { width: number; height: number }): Promise<boolean> {
    try {
      const config = await this.loadConfig();
      
      if (!config) {
        return false;
      }
      
      // Check if screen size matches
      if (config.width !== screenSize.width || config.height !== screenSize.height) {
        logger.info('Region configuration exists but screen size does not match', { 
          configSize: { width: config.width, height: config.height },
          currentSize: screenSize
        });
        return false;
      }
      
      // Check if we have exactly 3 regions
      if (config.regions.length !== 3) {
        logger.info('Region configuration exists but does not have exactly 3 regions', { 
          regionCount: config.regions.length 
        });
        return false;
      }
      
      // Check if all regions are valid
      const allValid = config.regions.every(region => 
        region.x >= 0 && region.y >= 0 &&
        region.width > 0 && region.height > 0 &&
        region.x + region.width <= screenSize.width &&
        region.y + region.height <= screenSize.height
      );
      
      if (!allValid) {
        logger.info('Region configuration exists but contains invalid regions');
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking for valid regions', { error });
      return false;
    }
  }
  
  /**
   * Get regions for the current screen size
   * @param screenSize Current screen size
   */
  async getCurrentRegions(screenSize: { width: number; height: number }): Promise<CardRegion[] | null> {
    try {
      const config = await this.loadConfig();
      
      if (!config) {
        return null;
      }
      
      // Check if screen size matches
      if (config.width !== screenSize.width || config.height !== screenSize.height) {
        logger.info('Region configuration exists but screen size does not match', { 
          configSize: { width: config.width, height: config.height },
          currentSize: screenSize
        });
        return null;
      }
      
      return config.regions;
    } catch (error) {
      logger.error('Error getting current regions', { error });
      return null;
    }
  }
}

export default RegionConfigService;
