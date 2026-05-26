import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getPythonExecutable } from '../../../pythonResolver';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');

  if (!q) {
    return NextResponse.json(
      { success: false, error: 'Missing target query parameter q' },
      { status: 400 }
    );
  }

  const targetUrl = `https://www.leercapitulo.co/search-autocomplete?term=${encodeURIComponent(q)}`;

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
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(pythonExecutable, [scraperScript, targetUrl], (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    try {
      const parsedData = JSON.parse(result.stdout);
      return NextResponse.json(parsedData);
    } catch (parseError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to parse scraper search output as JSON', 
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
        error: executionError.error?.message || 'Execution error during scraping search',
        stderr: executionError.stderr || '',
        stdout
      },
      { status: 500 }
    );
  }
}
