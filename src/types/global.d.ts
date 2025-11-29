export {};

declare global {
  // Global interval handle for process-level cleanup of in-memory rate limit store
  var rateLimitCleanupInterval: ReturnType<typeof setInterval> | undefined;
}
