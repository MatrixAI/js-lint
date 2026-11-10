import { LogLevel } from '@matrixai/logger';

function verboseToLogLevel(c: number = 0): LogLevel {
  let logLevel = LogLevel.INFO;
  if (c === 1) {
    logLevel = LogLevel.DEBUG;
  } else if (c >= 2) {
    logLevel = LogLevel.NOTSET;
  }
  return logLevel;
}

export { verboseToLogLevel };
