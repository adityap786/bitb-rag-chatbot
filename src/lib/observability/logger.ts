type LogLevel = "info" | "warn" | "error" | "debug";

type LogPayload = Record<string, unknown> | undefined;

type Logger = {
  log: (message: string, data?: LogPayload) => void;
  info: (message: string, data?: LogPayload) => void;
  warn: (message: string, data?: LogPayload) => void;
  error: (message: string, data?: LogPayload) => void;
  debug: (message: string, data?: LogPayload) => void;
};

function emit(level: LogLevel, message: string, data?: LogPayload) {
  const entry = data ? `${message} ${JSON.stringify(data)}` : message;
  switch (level) {
    case "warn":
      console.warn(entry);
      break;
    case "error":
      console.error(entry);
      break;
    case "debug":
      console.debug(entry);
      break;
    default:
      console.log(entry);
  }
}

export const logger: Logger = {
  log: (message, data) => emit("info", message, data),
  info: (message, data) => emit("info", message, data),
  warn: (message, data) => emit("warn", message, data),
  error: (message, data) => emit("error", message, data),
  debug: (message, data) => emit("debug", message, data),
};
