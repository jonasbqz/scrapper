import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { getErrorMessage, runScraper } from '../../../runScraper';

type SearchResult = {
  title?: string;
  slug?: string;
  url?: string;
};

async function trackSearch(results: SearchResult[]) {
  if (!results || results.length === 0) return;
  
  // Track the first result (closest match)
  const bestMatch = results[0];
  const { title, slug, url } = bestMatch;
  if (!slug || !url) return;
  const displayTitle = title || slug;

  const statsPath = path.join(process.cwd(), 'search_stats.json');
  const queuePath = path.join(process.cwd(), 'priority_queue.json');

  try {
    let stats: Record<string, { title: string; url: string; count: number }> = {};
    try {
      const data = await fsPromises.readFile(statsPath, 'utf8');
      stats = JSON.parse(data);
    } catch {
      // stats file doesn't exist
    }

    if (!stats[slug]) {
      stats[slug] = { title: displayTitle, url, count: 0 };
    }
    stats[slug].count += 1;
    await fsPromises.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf8');

    // If count reaches exactly 10, add to priority queue and trigger background scrape
    if (stats[slug].count === 10) {
      let queue: Array<{ title: string; slug: string; url: string; addedAt: string }> = [];
      try {
        const qData = await fsPromises.readFile(queuePath, 'utf8');
        queue = JSON.parse(qData);
      } catch {
        // queue file doesn't exist
      }

      if (!queue.some(item => item.slug === slug)) {
        queue.push({
          title: displayTitle,
          slug,
          url,
          addedAt: new Date().toISOString()
        });
        await fsPromises.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf8');
        
        console.log(`[Priority] Manga ${displayTitle} (${slug}) reached 10 searches. Triggering background scrape.`);
        void runScraper(url, `priority scrape for ${slug}`).then((result) => {
          if (result.error || result.data?.success === false) {
            console.error(`[Priority] Background scrape failed for ${slug}:`, result.error || result.data?.error);
            return;
          }

          console.log(`[Priority] Background scrape completed for ${slug}`);
        });
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

  try {
    const result = await runScraper(targetUrl, 'scraping search');

    if (!result.data) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error || 'Failed to parse scraper search output as JSON', 
          rawOutput: result.stdout,
          stderr: result.stderr 
        },
        { status: result.status }
      );
    }

    if (result.data.success && Array.isArray(result.data.results)) {
      void trackSearch(result.data.results as SearchResult[]);
    }
    
    return NextResponse.json(result.data, { status: result.status });
  } catch (executionError: unknown) {
    return NextResponse.json(
      { 
        success: false, 
        error: getErrorMessage(executionError, 'Execution error during scraping search'),
      },
      { status: 500 }
    );
  }
}
