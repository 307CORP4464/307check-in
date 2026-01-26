import nodemailer from 'nodemailer';

interface EmailTemplate {
  subject: string;
  html: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  private getCheckInConfirmationTemplate(
    driverName: string,
    checkInTime: string,
    referenceNumber: string,
    loadType: string
  ): EmailTemplate {
    const loadTypeDisplay = loadType === 'inbound' ? 'Inbound Delivery' : 'Outbound Pickup';
    
    return {
      subject: `Check-In Confirmed - ${referenceNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: #4CAF50; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✓ Check-In Confirmed</h1>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your check-in has been successfully confirmed at <strong>307 Logistics</strong>.</p>
                      
                      <!-- Info Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid #4CAF50; margin: 20px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}</p>
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Load Type:</strong> ${loadTypeDisplay}</p>
                            <p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Check-In Time:</strong> ${checkInTime}</p>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="font-size: 16px; color: #333333; margin: 30px 0 20px;">You will receive another email shortly with your dock assignment.</p>
                      <p style="font-size: 16px; color: #333333; margin: 0;">Thank you for choosing 307 Logistics!</p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #333333; padding: 20px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 12px;">307 Logistics - Automated Notification</p>
                      <p style="color: #999999; margin: 5px 0 0; font-size: 11px;">This is an automated message, please do not reply.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
  }

  private getDockAssignmentTemplate(
    driverName: string,
    dockNumber: string,
    referenceNumber: string,
    appointmentTime?: string
  ): EmailTemplate {
    const dockDisplay = dockNumber === 'Ramp' ? 'RAMP' : `DOCK ${dockNumber}`;
    const appointmentInfo = appointmentTime 
      ? `<p style="margin: 5px 0 0; font-size: 14px; color: #666666;">Appointment: ${appointmentTime}</p>`
      : '';
    
    return {
      subject: `Dock Assignment - ${dockDisplay}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: #2196F3; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🚛 Dock Assignment</h1>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your dock has been assigned. Please proceed to:</p>
                      
                      <!-- Dock Assignment Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff3cd; border: 3px solid #ffc107; margin: 20px 0;">
                        <tr>
                          <td style="padding: 30px; text-align: center;">
                            <h2 style="color: #2196F3; margin: 0 0 15px; font-size: 42px; font-weight: bold;">${dockDisplay}</h2>
                            <p style="margin: 5px 0 0; font-size: 16px; color: #333333;">Reference: <strong>${referenceNumber}</strong></p>
                            ${appointmentInfo}
                          </td>
                        </tr>
                      </table>
                      
                      <p style="font-size: 16px; color: #333333; margin: 30px 0 0; text-align: center;"><strong>Please proceed to your assigned dock immediately.</strong></p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #333333; padding: 20px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 12px;">307 Logistics - Automated Notification</p>
                      <p style="color: #999999; margin: 5px 0 0; font-size: 11px;">This is an automated message, please do not reply.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
  }

  private getStatusChangeTemplate(
    driverName: string,
    referenceNumber: string,
    oldStatus: string,
    newStatus: string,
    notes?: string
  ): EmailTemplate {
    const statusColors: Record<string, string> = {
      checked_out: '#4CAF50',
      rejected: '#F44336',
      turned_away: '#FF9800',
      driver_left: '#9E9E9E',
      unloaded: '#4CAF50',
    };

    const statusLabels: Record<string, string> = {
      checked_out: 'Completed',
      rejected: 'Rejected',
      turned_away: 'Turned Away',
      driver_left: 'Driver Left',
      unloaded: 'Unloaded',
    };

    const color = statusColors[newStatus] || '#2196F3';
    const statusLabel = statusLabels[newStatus] || newStatus;
    
    return {
      subject: `Status Update - ${referenceNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: ${color}; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📋 Load Status Update</h1>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your load status has been updated.</p>
                      
                      <!-- Status Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid ${color}; margin: 20px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}</p>
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">New Status:</strong> <span style="color: ${color}; font-weight: bold;">${statusLabel}</span></p>
                            ${notes ? `<p style="margin: 10px 0 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Notes:</strong> ${notes}</p>` : ''}
                          </td>
                        </tr>
                      </table>
                      
                      <p style="font-size: 16px; color: #333333; margin: 30px 0 0;">Thank you for choosing 307 Logistics!</p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #333333; padding: 20px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 12px;">307 Logistics - Automated Notification</p>
                      <p style="color: #999999; margin: 5px 0 0; font-size: 11px;">This is an automated message, please do not reply.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
  }

  async sendCheckInConfirmation(
    to: string,
    driverName: string,
    checkInTime: string,
    referenceNumber: string,
    loadType: string
  ): Promise<void> {
    const template = this.getCheckInConfirmationTemplate(
      driverName,
      checkInTime,
      referenceNumber,
      loadType
    );

    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
    });
  }

  async sendDockAssignment(
    to: string,
    driverName: string,
    dockNumber: string,
    referenceNumber: string,
    appointmentTime?: string
  ): Promise<void> {
    const template = this.getDockAssignmentTemplate(
      driverName,
      dockNumber,
      referenceNumber,
      appointmentTime
    );

    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
    });
  }

  async sendStatusChange(
    to: string,
    driverName: string,
    referenceNumber: string,
    oldStatus: string,
    newStatus: string,
    notes?: string
  ): Promise<void> {
    const template = this.getStatusChangeTemplate(
      driverName,
      referenceNumber,
      oldStatus,
      newStatus,
      notes
    );

    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `${process.env.EMAIL_FROM_NAME || '307 Logistics'} <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      console.log(`Email sent successfully to ${options.to}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('Email server connection verified');
      return true;
    } catch (error) {
      console.error('Email server connection failed:', error);
      return false;
    }
  }
}
// At the end of your EmailService class (around line 344)
}

// Export singleton instance
const emailService = new EmailService();
export default emailService;

// Also export the class for testing purposes
export { EmailService };

// Export the sendEmail function
export async function sendEmail(options: EmailOptions) {
  return emailService.sendEmail(options);
}

