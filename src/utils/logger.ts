import winston from 'winston';
import path from 'path';
import { app } from 'electron';

/**
 * Logger configuration for HearthGem
 * Implements different log levels and formats for development and production
 * @module Logger
 */

const logDir = path.join(app.getPath('userData'), 'logs');

// Define log levels
const levels = {
  error: 0,    // System errors, crashes
  warn: 1,     // Potential issues, invalid states
  info: 2,     // Important state changes, user actions
  debug: 3,    // Detailed operation info
  verbose: 4   // Very detailed debugging info
};

// Define custom format
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    customFormat
  ),
  transports: [
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log')
    }),
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    })
  ]
});

// Add log method types
export type LoggerType = {
  error: (message: string, metadata?: any) => void;
  warn: (message: string, metadata?: any) => void;
  info: (message: string, metadata?: any) => void;
  debug: (message: string, metadata?: any) => void;
  verbose: (message: string, metadata?: any) => void;
};

// Export logger instance
export default logger as LoggerType;