/**
 * Graceful Shutdown Handler for Queue System
 * 
 * Handles SIGTERM and SIGINT signals to ensure:
 * - Active jobs complete
 * - Redis connections close cleanly
 * - No data loss
 * 
 * Usage:
 *   import './lib/queues/shutdown-handler';
 */

import { shutdownQueue } from './ingestQueue';
import { flushLangfuse } from '../observability/langfuse-client';
import { logger } from '../observability/logger';

let shutdownInProgress = false;

async function handleShutdown(signal: string) {
  if (shutdownInProgress) {
    logger.warn('Shutdown already in progress, forcing exit...');
    process.exit(1);
  }

  shutdownInProgress = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Set timeout for forced shutdown (30 seconds)
    const forceShutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30_000);

    // Flush Langfuse traces
    await flushLangfuse();
    logger.info('Langfuse traces flushed');

    // Shutdown queue system
    await shutdownQueue();
    logger.info('Queue system shut down');

    clearTimeout(forceShutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  handleShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  handleShutdown('UNHANDLED_REJECTION');
});

logger.info('Queue shutdown handlers registered');
