/**
 * Structured logging for trial system
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  action?: string;
  [key: string]: any;
}

class TrialLogger {
  private static isDev = process.env.NODE_ENV !== 'production';
  private static isTest = process.env.NODE_ENV === 'test';

  /**
   * Format log output
   */
  private static formatLog(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): object {
    const timestamp = new Date().toISOString();

    return {
      timestamp,
      level,
      message,
      ...(context && { context }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: TrialLogger.isDev ? error.stack : undefined,
        },
      }),
    };
  }

  static debug(message: string, context?: LogContext): void {
    if (!TrialLogger.isDev && !TrialLogger.isTest) return;

    const log = TrialLogger.formatLog('debug', message, context);
    console.log('[DEBUG]', JSON.stringify(log));
  }

  static info(message: string, context?: LogContext): void {
    const log = TrialLogger.formatLog('info', message, context);
    console.log('[INFO]', JSON.stringify(log));
  }

  static warn(message: string, context?: LogContext): void {
    const log = TrialLogger.formatLog('warn', message, context);
    console.warn('[WARN]', JSON.stringify(log));
  }

  static error(message: string, arg2?: Error | LogContext, context?: LogContext): void {
    // Allow calling as either:
    //   error(msg, Error, context)
    //   error(msg, context)
    let err: Error | undefined;
    let ctx: LogContext | undefined;

    if (arg2 instanceof Error) {
      err = arg2;
      ctx = context;
    } else {
      ctx = arg2 as LogContext | undefined;
    }

    const log = TrialLogger.formatLog('error', message, ctx, err);
    console.error('[ERROR]', JSON.stringify(log));
  }

  /**
   * Log trial-specific events
   */
  static logTrialEvent(
    event: 'created' | 'expired' | 'upgraded' | 'cancelled' | 'extended',
    tenantId: string,
    context?: LogContext
  ): void {
    this.info(`Trial ${event}`, {
      action: `trial_${event}`,
      tenantId,
      ...context,
    });
  }

  /**
   * Log API request
   */
  static logRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    context?: LogContext
  ): void {
    this.info(`${method} ${path}`, {
      action: 'api_request',
      method,
      path,
      statusCode,
      durationMs,
      ...context,
    });
  }

  /**
   * Log authentication event
   */
  static logAuth(event: 'success' | 'failure', tenantId?: string, context?: LogContext): void {
    this.info(`Auth ${event}`, {
      action: `auth_${event}`,
      ...(tenantId && { tenantId }),
      ...context,
    });
  }

  /**
   * Log data modification
   */
  static logModification(
    entity: string,
    operation: 'create' | 'update' | 'delete',
    entityId: string,
    tenantId?: string,
    context?: LogContext
  ): void {
    this.info(`${entity} ${operation}`, {
      action: `${entity}_${operation}`,
      entityId,
      ...(tenantId && { tenantId }),
      ...context,
    });
  }

  /**
   * Return the logger class (singleton-like access for static methods)
   */
  static getInstance(): typeof TrialLogger {
    return TrialLogger;
  }
}

export { TrialLogger };
export default TrialLogger;
