import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Factory function to create Winston loggers with module-specific labels
 * @param moduleLabel - String identifying the calling file or module (e.g., 'services/userService')
 * @returns Configured Winston logger instance
 */
export const getLogger = (moduleLabel: string): winston.Logger => {
  // Get global log level from environment (fallback: "info")
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  // Create custom format: [YYYY-MM-DD HH:mm:ss] ‹LEVEL› (moduleLabel) message
  const customFormat = winston.format.printf(({ timestamp, level, message, moduleLabel: label }) => {
    return `[${timestamp}] ‹${level.toUpperCase()}› (${label}) ${message}`;
  });

  // Console transport with pretty-printed format and timestamp
  const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize({ level: true }),
      customFormat
    )
  });

  // Base transports array
  const transports: winston.transport[] = [consoleTransport];

  // Optional file transport only if LOG_TO_FILE=true in env
  if (process.env.LOG_TO_FILE === 'true') {
    // Ensure logs directory exists
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const fileTransport = new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    });

    transports.push(fileTransport);
  }

  // Create and return logger with module label in defaultMeta
  return winston.createLogger({
    level: logLevel,
    levels: winston.config.npm.levels, // error, warn, info, debug
    defaultMeta: { moduleLabel },
    transports,
    // Prevent Winston from exiting on error
    exitOnError: false
  });
};