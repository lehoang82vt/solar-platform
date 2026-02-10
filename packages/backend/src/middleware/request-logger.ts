/**
 * SEC-04: Request/response logger with JSON structured logs and PII scrubbing.
 */
import { Request, Response, NextFunction } from 'express';
import { scrubObject, scrubString } from '../utils/scrubber';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function writeJsonLog(entry: LogEntry): void {
  try {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ level: 'error', message: 'log serialize failed', timestamp: new Date().toISOString() }) + '\n');
  }
}

/** Fields to include from request (scrubbed). */
function requestFields(req: Request): Record<string, unknown> {
  const headers: Record<string, string> = {};
  const auth = req.headers.authorization;
  if (auth) headers.authorization = scrubString(auth); // Bearer JWT scrubbed
  const ua = req.headers['user-agent'];
  if (ua) headers['user-agent'] = String(ua).slice(0, 200);
  const scrubbedHeaders = scrubObject(headers) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    headers: scrubbedHeaders,
  };
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    out.body = scrubObject(req.body);
  }
  return out;
}

/**
 * Middleware: log request at start (method, url, path, headers, body scrubbed)
 * and on finish log response status and duration.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const entry: LogEntry = {
    level: 'info',
    message: 'request',
    timestamp: new Date().toISOString(),
    ...requestFields(req),
  };
  writeJsonLog(entry);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const finishEntry: LogEntry = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      message: 'response',
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
    };
    writeJsonLog(finishEntry);
  });
  next();
}
