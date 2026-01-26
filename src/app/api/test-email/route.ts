// src/app/api/test-email/route.ts
import { NextResponse } from 'next/server';
import emailService from '@/lib/emailService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    await emailService.sendEmail({
      to: body.to || 'test@example.com',
      subject: 'Test Email',
      html: '<h1>Test Email</h1><p>This is a test email.</p>',
      text: 'Test Email - This is a test email.',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: 'Failed to send test email' },
      { status: 500 }
    );
  }
}
