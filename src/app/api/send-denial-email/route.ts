import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, driverName, carrierName, referenceNumber, notes, checkInId } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Driver email is required' },
        { status: 400 }
      );
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: 'Your Company <noreply@yourdomain.com>', // Update with your domain
      to: [to],
      subject: 'Check-in Request Denied',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #dc2626; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
              .info-row { margin: 10px 0; }
              .label { font-weight: bold; }
              .reason-box { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Check-in Request Denied</h1>
              </div>
              <div class="content">
                <p>Hello ${driverName},</p>
                <p>Your check-in request has been denied. Please see the details below:</p>
                
                <div class="info-row">
                  <span class="label">Reference Number:</span> ${referenceNumber}
                </div>
                <div class="info-row">
                  <span class="label">Carrier:</span> ${carrierName}
                </div>
                <div class="info-row">
                  <span class="label">Check-in ID:</span> ${checkInId}
                </div>
                
                <div class="reason-box">
                  <div class="label">Reason for Denial:</div>
                  <p style="margin: 10px 0 0 0;">${notes}</p>
                </div>
                
                <p>If you have any questions or believe this is an error, please contact our office.</p>
                <p>Thank you,<br>Your Company Name</p>
              </div>
              <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Email API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

