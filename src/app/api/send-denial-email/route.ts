import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, driverName, carrierName, referenceNumber, reason, notes } = body;

    // Configure your email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // e.g., smtp.gmail.com
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Check-in Denied</h2>
        
        <p>Dear ${driverName},</p>
        
        <p>Your check-in request has been <strong>denied</strong> for the following reason:</p>
        
        <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold;">Reason: ${reason}</p>
          ${notes ? `<p style="margin: 10px 0 0 0;">Details: ${notes}</p>` : ''}
        </div>
        
        <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 5px 0;"><strong>Reference Number:</strong> ${referenceNumber}</p>
          <p style="margin: 5px 0;"><strong>Carrier:</strong> ${carrierName}</p>
        </div>
        
        <p>Please contact the facility for further instructions or to reschedule your appointment.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <p style="color: #6b7280; font-size: 12px;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to,
      subject: `Check-in Denied - Reference: ${referenceNumber}`,
      html: emailContent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}

