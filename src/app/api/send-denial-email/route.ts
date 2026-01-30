import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, driverName, carrierName, referenceNumber, notes, checkInId } = body;

    console.log('Email API called with:', { to, driverName, carrierName, referenceNumber, checkInId });

    // Validate email
    if (!to) {
      console.error('No email address provided');
      return NextResponse.json(
        { error: 'Driver email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      console.error('Invalid email format:', to);
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      );
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    console.log('Attempting to send email via Resend...');

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: 'Check-in System <onboarding@resend.dev>', // Use this for testing, update with your domain
      to: [to],
      subject: 'Check-in Request Denied',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                padding: 20px; 
              }
              .header { 
                background-color: #dc2626; 
                color: white; 
                padding: 20px; 
                border-radius: 5px 5px 0 0; 
                text-align: center;
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
              }
              .content { 
                background-color: #f9fafb; 
                padding: 20px; 
                border: 1px solid #e5e7eb;
                border-radius: 0 0 5px 5px;
              }
              .info-row { 
                margin: 10px 0;
                padding: 8px;
                background: white;
                border-radius: 4px;
              }
              .label { 
                font-weight: bold;
                color: #374151;
              }
              .reason-box { 
                background-color: #fee2e2; 
                border-left: 4px solid #dc2626; 
                padding: 15px; 
                margin: 20px 0;
                border-radius: 4px;
              }
              .footer { 
                text-align: center; 
                margin-top: 20px; 
                color: #6b7280; 
                font-size: 12px; 
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Check-in Request Denied</h1>
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
                  <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${notes}</p>
                </div>
                
                <p>If you have any questions or believe this is an error, please contact our office.</p>
                <p style="margin-top: 20px;">Thank you,<br><strong>Your Company Name</strong></p>
              </div>
              <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </body>
        </html>
      `,
      // Also send plain text version
      text: `
Check-in Request Denied

Hello ${driverName},

Your check-in request has been denied.

Reference Number: ${referenceNumber}
Carrier: ${carrierName}
Check-in ID: ${checkInId}

Reason for Denial:
${notes}

If you have any questions or believe this is an error, please contact our office.

Thank you,
Your Company Name
      `.trim(),
    });

    if (error) {
      console.error('Resend API error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to send email' },
        { status: 500 }
      );
    }

    console.log('Email sent successfully:', data);
    return NextResponse.json({ success: true, data });
    
  } catch (error: any) {
    console.error('Email API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

