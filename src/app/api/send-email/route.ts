// src/app/api/send-email/route.ts
import { NextResponse } from 'next/server';
import emailService from '@/lib/emailService';

export async function POST(request: Request) {
  try {
    const { type, data } = await request.json();

    switch (type) {
      case 'driver-checkin':
        await emailService.sendCheckInConfirmation(
          data.driverEmail,
          data.driverName,
          data.checkInTime,
          data.referenceNumber,
          data.loadType
        );
        break;

      case 'dock-assignment':
        await emailService.sendDockAssignment(
          data.driverEmail,
          data.driverName,
          data.dockNumber,
          data.referenceNumber,
          data.appointmentTime
        );
        break;

      case 'status-change':
        await emailService.sendStatusChange(
          data.driverEmail,
          data.driverName,
          data.referenceNumber,
          data.oldStatus,
          data.newStatus,
          data.notes
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid email type' },
          { status: 400 }
        );
    }

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
