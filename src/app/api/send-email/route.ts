import { NextRequest, NextResponse } from 'next/server';
import { emailService } from '@/lib/EmailService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, toEmail, data } = body;

    console.log('Email request received:', { type, toEmail });

    switch (type) {
      case 'checkin':
        console.log('Sending check-in confirmation to:', toEmail);
        await emailService.sendCheckInConfirmation(
          toEmail,
          data.driverName,
          data.checkInTime,
          data.referenceNumber
        );
        break;

      case 'dock-assignment':
        console.log('Sending dock assignment to:', toEmail);
        await emailService.sendDockAssignment(
          toEmail,
          data.driverName,
          data.dockNumber,
          data.referenceNumber,
          data.loadType,
          data.checkInTime,
          data.appointmentTime,
          data.appointmentStatus
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

    return NextResponse.json(
      { success: true, message: 'Email sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}




