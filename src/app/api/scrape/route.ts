import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, runScraper } from '../runScraper';

async function scrapeUrl(url: string) {
  const result = await runScraper(url, 'scraping');

  if (!result.data) {
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Failed to parse scraper output as JSON',
        rawOutput: result.stdout,
        stderr: result.stderr,
      },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { success: false, error: 'Missing target url parameter' },
      { status: 400 }
    );
  }

  try {
    return await scrapeUrl(url);
  } catch (executionError: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(executionError, 'Execution error during scraping'),
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

    return await scrapeUrl(url);
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(e, 'Invalid JSON body') },
      { status: 400 }
    );
  }
}
