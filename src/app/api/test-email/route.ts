// src/app/api/test-email/route.ts
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/emailService';

export async function POST(request: Request) {
  try {
    const { testEmail } = await request.json();
    
    await sendEmail({
      to: testEmail,
      subject: 'Test Email from WMS',
      text: 'If you receive this, email is configured correctly!',
      html: '<p>If you receive this, email is configured correctly!</p>'
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
