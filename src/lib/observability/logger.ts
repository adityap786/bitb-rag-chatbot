export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.info(`[observability] ${message}`, meta ?? {});
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[observability] ${message}`, meta ?? {});
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(`[observability] ${message}`, meta ?? {});
  },
  debug(message: string, meta?: Record<string, unknown>) {
    console.debug(`[observability] ${message}`, meta ?? {});
  },
};
