import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, runScraper } from '../../../runScraper';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { success: false, error: 'Missing target url parameter' },
      { status: 400 }
    );
  }

  try {
    const result = await runScraper(url, 'scraping chapters');

    if (!result.data) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to parse scraper chapters output as JSON',
          rawOutput: result.stdout,
          stderr: result.stderr,
        },
        { status: result.status }
      );
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (executionError: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(executionError, 'Execution error during scraping chapters'),
      },
      { status: 500 }
    );
  }
}
