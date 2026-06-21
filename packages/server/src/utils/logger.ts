/**
 * Lightweight structured logger.
 * Outputs JSON to stdout/stderr, matching the existing log format.
 *
 * Levels: error > warn > info > debug
 * In production, debug is suppressed.
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const isDev = process.env.NODE_ENV !== 'production';
const minLevel: LogLevel = isDev ? 'debug' : 'info';

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...meta,
  });
}

export const logger = {
  error(message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY.error <= LEVEL_PRIORITY[minLevel]) {
      console.error(formatLog('error', message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY.warn <= LEVEL_PRIORITY[minLevel]) {
      console.warn(formatLog('warn', message, meta));
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY.info <= LEVEL_PRIORITY[minLevel]) {
      console.log(formatLog('info', message, meta));
    }
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY.debug <= LEVEL_PRIORITY[minLevel]) {
      console.log(formatLog('debug', message, meta));
    }
  },
};
