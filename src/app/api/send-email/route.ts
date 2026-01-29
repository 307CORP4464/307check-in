// app/api/send-email/route.ts or pages/api/send-email.ts
import { NextRequest, NextResponse } from 'next/server';
import EmailService from '@/lib/emailService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, toEmail, data } = body;

    if (!toEmail) {
      return NextResponse.json(
        { success: false, error: 'Email address is required' },
        { status: 400 }
      );
    }

    const emailService = new EmailService();

    switch (type) {
      case 'checkin':
        await emailService.sendCheckInConfirmation(
          toEmail,
          data.driverName,
          data.checkInTime,
          data.referenceNumber
        );
        break;

      case 'dock_assignment':
        await emailService.sendDockAssignment(
          toEmail,
          data.driverName,
          data.dockNumber,
          data.referenceNumber,
          data.loadType || 'inbound',
          data.checkInTime,
          data.appointmentTime,
          data.appointmentStatus
        );
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid email type' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email sending error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
