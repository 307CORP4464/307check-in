import { NextResponse } from 'next/server';
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function POST(request: Request) {
  try {
    const { to, message } = await request.json();

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    return NextResponse.json({ success: true, sid: result.sid });
  } catch (error) {
    console.error('Error sending SMS:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}


    const message = `
Hello ${driverName || 'Driver'}!

You've been assigned to ${dockNumber === 'Ramp' ? 'the Ramp' : `Dock ${dockNumber}`}.

Reference #: ${referenceNumber || 'N/A'}
Appointment: ${appointmentTime || 'N/A'}

Please proceed to your assigned dock.
    `.trim();

    const result = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: phoneNumber,
    });

    return NextResponse.json({
      success: true,
      messageId: result.sid,
    });
  } catch (error: any) {
    console.error('SMS Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
