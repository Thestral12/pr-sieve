export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export const consoleLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

export function redactForLog(text: string): string {
  return text
    .replace(/TYPESAFE_API_KEY\s*[=:]\s*\S+/g, "TYPESAFE_API_KEY=[REDACTED]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]");
}
