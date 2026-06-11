import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fsPromises } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const queuePath = path.join(process.cwd(), 'priority_queue.json');
  try {
    const data = await fsPromises.readFile(queuePath, 'utf8');
    const queue = JSON.parse(data);
    return NextResponse.json({ success: true, queue });
  } catch (e) {
    return NextResponse.json({ success: true, queue: [] });
  }
}

export async function DELETE(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const queuePath = path.join(process.cwd(), 'priority_queue.json');

  try {
    let queue: any[] = [];
    try {
      const data = await fsPromises.readFile(queuePath, 'utf8');
      queue = JSON.parse(data);
    } catch (e) {
      // Empty queue
    }

    if (slug) {
      queue = queue.filter(item => item.slug !== slug);
    } else {
      queue = []; // Clear all
    }

    await fsPromises.writeFile(queuePath, JSON.stringify(queue, null, 2), 'utf8');
    return NextResponse.json({ success: true, message: slug ? `Removed ${slug} from priority queue` : 'Cleared priority queue' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
