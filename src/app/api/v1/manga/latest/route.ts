import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getPythonExecutable } from '../../../pythonResolver';

const LATEST_CACHE_TTL_MS = 10 * 60 * 1000;
let latestCache: { data: unknown; expiresAt: number } | null = null;
let pendingLatest: Promise<unknown> | null = null;

function runLatestScraper(pythonExecutable: string, scraperScript: string, targetUrl: string) {
  return new Promise<unknown>((resolve, reject) => {
    execFile(
      pythonExecutable,
      [scraperScript, targetUrl],
      { timeout: 30000, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject({
            error: parseError,
            stdout,
            stderr,
            parse: true,
          });
        }
      }
    );
  });
}

export async function GET(request: NextRequest) {
  const targetUrl = 'https://www.leercapitulo.co';

  if (latestCache && latestCache.expiresAt > Date.now()) {
    return NextResponse.json(latestCache.data, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=1800',
        'X-Scraper-Cache': 'HIT',
      },
    });
  }

  // Paths to Python executable and the scraper script
  const pythonExecutable = getPythonExecutable();
  const scraperScript = path.join(process.cwd(), 'scraper.py');

  // Verify paths exist
  const isPath = pythonExecutable.includes('/') || pythonExecutable.includes('\\');
  if (isPath && !fs.existsSync(pythonExecutable)) {
    return NextResponse.json(
      { success: false, error: `Python virtual env not found at: ${pythonExecutable}` },
      { status: 500 }
    );
  }

  if (!fs.existsSync(scraperScript)) {
    return NextResponse.json(
      { success: false, error: `Scraper script not found at: ${scraperScript}` },
      { status: 500 }
    );
  }

  try {
    pendingLatest = pendingLatest ?? runLatestScraper(pythonExecutable, scraperScript, targetUrl);
    const parsedData = await pendingLatest;
    latestCache = {
      data: parsedData,
      expiresAt: Date.now() + LATEST_CACHE_TTL_MS,
    };

    return NextResponse.json(parsedData, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=1800',
        'X-Scraper-Cache': 'MISS',
      },
    });
  } catch (executionError: any) {
    if (latestCache) {
      return NextResponse.json(latestCache.data, {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=300, stale-while-revalidate=1800',
          'X-Scraper-Cache': 'STALE',
        },
      });
    }

    const stdout = executionError.stdout || '';
    try {
      if (stdout) {
        return NextResponse.json(JSON.parse(stdout), { status: 500 });
      }
    } catch (_) {}

    return NextResponse.json(
      { 
        success: false, 
        error: executionError.error?.message || 'Execution error during scraping latest',
        stderr: executionError.stderr || '',
        stdout
      },
      { status: 500 }
    );
  } finally {
    pendingLatest = null;
  }
}
