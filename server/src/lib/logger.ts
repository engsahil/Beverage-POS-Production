type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, meta));
    }
  },

  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, meta));
    }
  },
};
