import { NextRequest, NextResponse } from 'next/server';
import EmailService from '@/lib/emailService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, toEmail, data } = body;

    // Validate required fields
    if (!type || !toEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: type and toEmail' },
        { status: 400 }
      );
    }

    // Initialize email service
    const emailService = new EmailService();

    // Route to appropriate email method based on type
    switch (type) {
      case 'checkin':
        if (!data.driverName || !data.checkInTime || !data.referenceNumber) {
          return NextResponse.json(
            { error: 'Missing required check-in data' },
            { status: 400 }
          );
        }
        await emailService.sendCheckInConfirmation(
          toEmail,
          data.driverName,
          data.checkInTime,
          data.referenceNumber
        );
        break;

      case 'dock_assignment':
        if (!data.driverName || !data.dockNumber || !data.referenceNumber || !data.loadType || !data.checkInTime) {
          return NextResponse.json(
            { error: 'Missing required dock assignment data' },
            { status: 400 }
          );
        }
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

      case 'check_in_denial':
        if (!data.driverName || !data.carrierName || !data.referenceNumber || !data.denialReason) {
          return NextResponse.json(
            { error: 'Missing required denial data' },
            { status: 400 }
          );
        }
        await emailService.sendCheckInDenial(
          toEmail,
          data.driverName,
          data.carrierName,
          data.referenceNumber,
          data.denialReason
        );
        break;

      case 'status_change':
        if (!data.driverName || !data.referenceNumber || !data.newStatus) {
          return NextResponse.json(
            { error: 'Missing required status change data' },
            { status: 400 }
          );
        }
        // You'll need to add this method to EmailService if not already present
        // await emailService.sendStatusChange(...);
        return NextResponse.json(
          { error: 'Status change emails not yet implemented' },
          { status: 501 }
        );

      default:
        return NextResponse.json(
          { error: `Unknown email type: ${type}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ 
      success: true,
      message: `${type} email sent successfully to ${toEmail}`
    });

  } catch (error) {
    console.error('Email API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { 
        error: 'Failed to send email',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

