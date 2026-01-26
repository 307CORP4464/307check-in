// app/api/send-email/route.ts
import { NextResponse } from 'next/server';
import emailService from '@/lib/emailService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, toEmail, data } = body;

    console.log('Email API called:', { type, toEmail, hasData: !!data });

    // Validate required fields
    if (!type || !toEmail || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: type, toEmail, or data' },
        { status: 400 }
      );
    }

    switch (type) {
      case 'checkin':  // ✅ Match what emailTriggers.ts sends
        console.log('Sending check-in confirmation...');
        await emailService.sendCheckInConfirmation(
          toEmail,
          data.driverName,
          data.checkInTime,
          data.referenceNumber,
          data.loadType
        );
        break;

      case 'dock_assignment':  // ✅ Match what emailTriggers.ts sends
        console.log('Sending dock assignment...');
        await emailService.sendDockAssignment(
          toEmail,
          data.driverName,
          data.dockNumber,
          data.referenceNumber,
          data.appointmentTime
        );
        break;

      case 'status_change':  // ✅ Match what emailTriggers.ts sends
        console.log('Sending status change...');
        await emailService.sendStatusChange(
          toEmail,
          data.driverName,
          data.referenceNumber,
          data.oldStatus,
          data.newStatus,
          data.notes
        );
        break;

      default:
        console.error('Invalid email type:', type);
        return NextResponse.json(
          { error: `Invalid email type: ${type}` },
          { status: 400 }
        );
    }

    console.log('Email sent successfully');
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
