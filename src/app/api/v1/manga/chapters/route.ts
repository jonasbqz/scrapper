import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getPythonExecutable } from '../../../pythonResolver';
import { enqueueExecution } from '../../../queue';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { success: false, error: 'Missing target url parameter' },
      { status: 400 }
    );
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
    const result = await enqueueExecution(() => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(pythonExecutable, [scraperScript, url], (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });
    }));

    try {
      const parsedData = JSON.parse(result.stdout);
      return NextResponse.json(parsedData);
    } catch (parseError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to parse scraper chapters output as JSON', 
          rawOutput: result.stdout,
          stderr: result.stderr 
        },
        { status: 500 }
      );
    }
  } catch (executionError: any) {
    const stdout = executionError.stdout || '';
    try {
      if (stdout) {
        return NextResponse.json(JSON.parse(stdout), { status: 500 });
      }
    } catch (_) {}

    return NextResponse.json(
      { 
        success: false, 
        error: executionError.error?.message || 'Execution error during scraping chapters',
        stderr: executionError.stderr || '',
        stdout
      },
      { status: 500 }
    );
  }
}
