import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getPythonExecutable } from './pythonResolver';

type QueueItem = {
  resolve: () => void;
  reject: (error: ScraperBusyError) => void;
};

export class ScraperBusyError extends Error {
  status = 503;

  constructor(message = 'Scraper is busy. Please retry in a moment.') {
    super(message);
    this.name = 'ScraperBusyError';
  }
}

export type RunScraperResult = {
  data?: Record<string, unknown>;
  error?: string;
  stderr: string;
  stdout: string;
  status: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 20 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_MAX_QUEUE = 12;

let activeScrapers = 0;
const scraperQueue: QueueItem[] = [];

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const maxConcurrent = readPositiveInt(process.env.SCRAPER_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT);
const maxQueue = readPositiveInt(process.env.SCRAPER_MAX_QUEUE, DEFAULT_MAX_QUEUE);
const timeoutMs = readPositiveInt(process.env.SCRAPER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

function acquireScraperSlot(): Promise<void> {
  if (activeScrapers < maxConcurrent) {
    activeScrapers += 1;
    return Promise.resolve();
  }

  if (scraperQueue.length >= maxQueue) {
    return Promise.reject(new ScraperBusyError());
  }

  return new Promise((resolve, reject) => {
    scraperQueue.push({ resolve, reject });
  });
}

function releaseScraperSlot() {
  const next = scraperQueue.shift();
  if (next) {
    next.resolve();
    return;
  }

  activeScrapers = Math.max(0, activeScrapers - 1);
}

function validateRuntime() {
  const pythonExecutable = getPythonExecutable();
  const scraperScript = path.join(process.cwd(), 'scraper.py');
  const isPath = pythonExecutable.includes('/') || pythonExecutable.includes('\\');

  if (isPath && !fs.existsSync(pythonExecutable)) {
    throw new Error(`Python virtual env not found at: ${pythonExecutable}`);
  }

  if (!fs.existsSync(scraperScript)) {
    throw new Error(`Scraper script not found at: ${scraperScript}`);
  }

  return { pythonExecutable, scraperScript };
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function parseScraperOutput(stdout: string, stderr: string, fallbackError: string, status: number): RunScraperResult {
  try {
    return {
      data: JSON.parse(stdout),
      stderr,
      stdout,
      status,
    };
  } catch {
    return {
      error: fallbackError,
      stderr,
      stdout,
      status,
    };
  }
}

export async function runScraper(targetUrl: string, label = 'scraping'): Promise<RunScraperResult> {
  await acquireScraperSlot();

  try {
    const { pythonExecutable, scraperScript } = validateRuntime();

    return await new Promise<RunScraperResult>((resolve) => {
      execFile(
        pythonExecutable,
        [scraperScript, targetUrl],
        {
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: DEFAULT_MAX_BUFFER,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            const message = error.killed
              ? `Scraper timed out during ${label}`
              : error.message || `Execution error during ${label}`;

            resolve(parseScraperOutput(stdout, stderr, message, error.killed ? 504 : 500));
            return;
          }

          resolve(parseScraperOutput(stdout, stderr, `Failed to parse scraper ${label} output as JSON`, 200));
        }
      );
    });
  } catch (error: unknown) {
    const status = error instanceof ScraperBusyError ? error.status : 500;
    return {
      error: getErrorMessage(error, `Execution error during ${label}`),
      stderr: '',
      stdout: '',
      status,
    };
  } finally {
    releaseScraperSlot();
  }
}
