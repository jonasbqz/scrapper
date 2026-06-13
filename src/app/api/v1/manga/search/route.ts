import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs, { promises as fsPromises } from 'fs';
import { getPythonExecutable } from '../../../pythonResolver';
import { enqueueExecution } from '../../../queue';

async function trackSearch(results: any[], pythonExecutable: string) {
  if (!results || results.length === 0) return;
  
  // Track the first result (closest match)
  const bestMatch = results[0];
  const { title, slug, url } = bestMatch;
  if (!slug || !url) return;

  const statsPath = path.join(process.cwd(), 'search_stats.json');
  const queuePath = path.join(process.cwd(), 'priority_queue.json');

  try {
    let stats: Record<string, { title: string; url: string; count: number }> = {};
    try {
      const data = await fsPromises.readFile(statsPath, 'utf8');
      stats = JSON.parse(data);
    } catch (e) {
      // stats file doesn't exist
    }

    if (!stats[slug]) {
      stats[slug] = { title, url, count: 0 };
    }
    stats[slug].count += 1;
    await fsPromises.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf8');

    // If count reaches exactly 10, add to priority queue and trigger background scrape
    if (stats[slug].count === 10) {
      let queue: Array<{ title: string; slug: string; url: string; addedAt: string }> = [];
      try {
        const qData = await fsPromises.readFile(queuePath, 'utf8');
        queue = JSON.parse(qData);
      } catch (e) {
        // queue file doesn't exist
      }

      if (!queue.some(item => item.slug === slug)) {
        queue.push({
          title,
          slug,
          url,
          addedAt: new Date().toISOString()
        });
        await fsPromises.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf8');
        
        console.log(`[Priority] Manga ${title} (${slug}) reached 10 searches. Triggering background scrape.`);
        const scraperScript = path.join(process.cwd(), 'scraper.py');
        enqueueExecution(() => new Promise<void>((resolve) => {
          execFile(pythonExecutable, [scraperScript, url], (err) => {
            if (err) {
              console.error(`[Priority] Background scrape failed for ${slug}:`, err);
            } else {
              console.log(`[Priority] Background scrape completed for ${slug}`);
            }
            resolve();
          });
        }));
      }
    }
  } catch (error) {
    console.error('Error tracking search:', error);
  }
}

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
    const result = await enqueueExecution(() => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(pythonExecutable, [scraperScript, targetUrl], (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });
    }));

    try {
      const parsedData = JSON.parse(result.stdout);
      
      // Log search hits in background
      if (parsedData.success && parsedData.results) {
        trackSearch(parsedData.results, pythonExecutable);
      }
      
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
