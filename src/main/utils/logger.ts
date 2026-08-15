import logger from 'electron-log/main';
import { app } from 'electron';
import path from 'node:path';

export function setupLogger() {
  logger.initialize({ preload: true });
  logger.transports.file.level = 'info';
  logger.transports.console.level = 'silly';
  logger.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'main.log');
  logger.eventLogger.stopLogging();
  return logger;
}

export const log = logger;
