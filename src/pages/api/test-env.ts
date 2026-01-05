
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasSid: !!process.env.TWILIO_ACCOUNT_SID,
    hasToken: !!process.env.TWILIO_AUTH_TOKEN,
    hasPhone: !!process.env.TWILIO_PHONE_NUMBER,
    // Don't expose actual values!
    sidPreview: process.env.TWILIO_ACCOUNT_SID?.substring(0, 5) + '...',
  });
}
