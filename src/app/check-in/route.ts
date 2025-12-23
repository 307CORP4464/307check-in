import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  return NextResponse.json(
    { error: 'API temporarily disabled' },
    { status: 503 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'API temporarily disabled' },
    { status: 503 }
  );
}
