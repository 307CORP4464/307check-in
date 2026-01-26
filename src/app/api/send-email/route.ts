// app/api/send-email/route.ts
import { NextResponse } from 'next/server';
import emailService from '@/lib/emailService';

export async function POST(request: Request) {
  try {
    const { type, toEmail, data } = await request.json();

    console.log('Email API called with type:', type); // Add logging

    switch (type) {
      case 'checkin':  // ✅ Changed from 'driver-checkin'
        await emailService.sendCheckInConfirmation(
          toEmail,  // ✅ Use toEmail from request
          data.driverName,
          data.checkInTime,
          data.referenceNumber,
          data.loadType
        );
        break;

      case 'dock_assignment':  // ✅ Changed from 'dock-assignment'
        await emailService.sendDockAssignment(
          toEmail,  // ✅ Use toEmail from request
          data.driverName,
          data.dockNumber,
          data.referenceNumber,
          data.appointmentTime
        );
        break;

      case 'status_change':  // ✅ Changed from 'status-change'
        await emailService.sendStatusChange(
          toEmail,  // ✅ Use toEmail from request
          data.driverName,
          data.referenceNumber,
          data.oldStatus,
          data.newStatus,
          data.notes
        );
        break;

      default:
        console.error('Invalid email type received:', type);
        return NextResponse.json(
          { error: `Invalid email type: ${type}` },
          { status: 400 }
        );
    }

    console.log('Email sent successfully for type:', type);
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

