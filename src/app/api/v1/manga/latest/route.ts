import { NextResponse } from 'next/server';
import { getErrorMessage, runScraper } from '../../../runScraper';

export async function GET() {
  const targetUrl = 'https://www.leercapitulo.co';

  try {
    const result = await runScraper(targetUrl, 'scraping latest');

    if (!result.data) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to parse scraper latest output as JSON',
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
        error: getErrorMessage(executionError, 'Execution error during scraping latest'),
      },
      { status: 500 }
    );
  }
}
