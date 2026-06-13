import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getPythonExecutable } from '../pythonResolver';
import { enqueueExecution } from '../queue';

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
      { 
        success: false, 
        error: `Python virtual environment not found at expected location: ${pythonExecutable}` 
      },
      { status: 500 }
    );
  }

  if (!fs.existsSync(scraperScript)) {
    return NextResponse.json(
      { 
        success: false, 
        error: `Scraper script not found at expected location: ${scraperScript}` 
      },
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

    // The script prints the JSON response to stdout
    try {
      const parsedData = JSON.parse(result.stdout);
      return NextResponse.json(parsedData);
    } catch (parseError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to parse scraper output as JSON', 
          rawOutput: result.stdout,
          stderr: result.stderr 
        },
        { status: 500 }
      );
    }
  } catch (executionError: any) {
    const errorDetails = executionError.error || executionError;
    const stderr = executionError.stderr || '';
    const stdout = executionError.stdout || '';

    // If script returned an error output in stdout that is valid JSON, we can return it
    try {
      if (stdout) {
        const parsedData = JSON.parse(stdout);
        return NextResponse.json(parsedData, { status: 500 });
      }
    } catch (_) {}

    return NextResponse.json(
      { 
        success: false, 
        error: errorDetails.message || 'Execution error during scraping',
        stderr,
        stdout
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url;

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Missing target url in request body' },
        { status: 400 }
      );
    }

    // Call GET logic/helper by forwarding URL or reusing logic
    // Create a new request with search params for GET
    const targetUrl = new URL(request.url);
    targetUrl.searchParams.set('url', url);
    const getRequest = new NextRequest(targetUrl.toString(), {
      method: 'GET',
      headers: request.headers,
    });
    
    return GET(getRequest);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || 'Invalid JSON body' },
      { status: 400 }
    );
  }
}
