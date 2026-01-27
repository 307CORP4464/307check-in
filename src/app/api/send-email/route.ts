// app/api/send-email/route.ts
import { NextResponse } from 'next/server';
import emailService from '@/lib/emailService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, toEmail, data } = body;

    console.log('=== EMAIL API CALLED ===');
    console.log('Type:', type);
    console.log('To Email:', toEmail);
    console.log('Data:', JSON.stringify(data, null, 2));

    if (!type || !toEmail || !data) {
      console.error('Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: type, toEmail, or data' },
        { status: 400 }
      );
    }

    switch (type) {
      case 'checkin':
        console.log('Sending check-in confirmation to:', toEmail);
        await emailService.sendCheckInConfirmation(
          toEmail,
          data.driverName,
          data.checkInTime,
          data.referenceNumber,
        );
        console.log('✓ Check-in email sent successfully');
        break;

      case 'dock_assignment':
        console.log('Sending dock assignment to:', toEmail);
        await emailService.sendDockAssignment(
          toEmail,
          data.driverName,
          data.dockNumber,
          data.referenceNumber,
          data.loadType || 'inbound', // Required: 'inbound' or 'outbound'
          data.checkInTime, // Required
          data.appointmentTime, // Optional
          data.appointmentStatus // Optional: 'On Time', 'Early', 'Late', 'No Appointment'
        );
        console.log('✓ Dock assignment email sent successfully');
        break;

      case 'status_change':
        console.log('Sending status change to:', toEmail);
        await emailService.sendStatusChange(
          toEmail,
          data.driverName,
          data.referenceNumber,
          data.oldStatus,
          data.newStatus,
          data.notes
        );
        console.log('✓ Status change email sent successfully');
        break;

      default:
        console.error('Invalid email type:', type);
        return NextResponse.json(
          { error: `Invalid email type: ${type}. Expected: checkin, dock_assignment, or status_change` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('=== EMAIL API ERROR ===');
    console.error('Error object:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');

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
