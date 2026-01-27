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
  ): EmailTemplate {
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
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Check-In Confirmed</h1>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your check-in has been successfully submitted.</p>
                      
                      <!-- Info Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid #4CAF50; margin: 20px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}</p>
                            <p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Check-In Time:</strong> ${checkInTime}</p>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="font-size: 16px; color: #333333; margin: 30px 0 20px;">You will receive another email shortly with your dock assignment and instructions.</p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #333333; padding: 20px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 12px;">307 Corporation - Automated Notification</p>
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
    loadType: 'inbound' | 'outbound',
    checkInTime: string,
    appointmentTime?: string,
    appointmentStatus?: string
  ): EmailTemplate {
    const dockDisplay = dockNumber === 'Ramp' ? 'RAMP' : `DOCK ${dockNumber}`;
    
    // Status badge styling
    const statusColors: Record<string, { bg: string; text: string }> = {
      'On Time': { bg: '#4CAF50', text: '#ffffff' },
      'Early': { bg: '#2196F3', text: '#ffffff' },
      'Late': { bg: '#FF9800', text: '#ffffff' },
      'No Appointment': { bg: '#9E9E9E', text: '#ffffff' },
    };
    
    const statusStyle = statusColors[appointmentStatus || 'No Appointment'];
    
    // Instructions based on load type
    const instructions = loadType === 'inbound' 
      ? this.getInboundInstructions()
      : this.getOutboundInstructions();
    
    return {
      subject: `Dock Assignment - ${loadType === 'inbound' ? 'Unloading' : 'Loading'}`,
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
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🚛 Dock Assignment - ${loadType === 'inbound' ? 'UNLOADING' : 'LOADING'}</h1>
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
                            ${appointmentStatus ? `
                            <div style="display: inline-block; margin-top: 10px; padding: 6px 12px; background-color: ${statusStyle.bg}; border-radius: 4px;">
                              <span style="color: ${statusStyle.text}; font-weight: bold; font-size: 14px;">${appointmentStatus}</span>
                            </div>
                            ` : ''}
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Time Information Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid #2196F3; margin: 20px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Check-In Time:</strong> ${checkInTime}</p>
                            ${appointmentTime ? `<p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Appointment Time:</strong> ${appointmentTime}</p>` : '<p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Appointment:</strong> Walk-In</p>'}
                          </td>
                        </tr>
                      </table>
                      
                      <p style="font-size: 18px; color: #333333; margin: 30px 0 15px; text-align: center; font-weight: bold;">Please proceed to your assigned dock immediately.</p>
                      
                      <!-- Instructions -->
                      ${instructions}
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #333333; padding: 20px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 12px;">307 Corporation - Automated Notification</p>
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

  private getInboundInstructions(): string {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #2196F3; margin: 0 0 15px; font-size: 20px;"> Unloading Instructions:</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>1.</strong>Do NOT cut your seal.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>2.</strong> Slide your tandems to the back.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>3.</strong> Back in with your doors shut. We will open your doors inside the building!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>4.</strong> <span style="color: #F44336; font-weight: bold;">Red light</span> means you are being unloaded.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>5.</strong> The light will go back to <span style="color: #4CAF50; font-weight: bold;">green</span> when you are done.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>6.</strong> You will also receive an email with a status update.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>7.</strong> Please come into the office and show this email with your dock number to get your paperwork signed if needed.</p>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private getOutboundInstructions(): string {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #2196F3; margin: 0 0 15px; font-size: 20px;">📦 Loading Instructions:</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>1.</strong> Ensure your trailer is empty and swept clean.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>2.</strong> Slide your tandems to the back.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>3.</strong> Back in with your doors shut. We will open your doors inside the building!</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>4.</strong> <span style="color: #F44336; font-weight: bold;">Red light</span> means you are being loaded.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>5.</strong> The light will go back to <span style="color: #4CAF50; font-weight: bold;">green</span> when loading is complete.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>6.</strong> You will receive an email notification when your load is ready.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>7.</strong> Come into the office with this email showing your dock number to receive your bill of lading and paperwork.</p>
            </td>
          </tr>
        </table>
      </div>
    `;
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
      loaded: '#4CAF50',
    };

    const statusLabels: Record<string, string> = {
      checked_out: 'Completed',
      rejected: 'Rejected',
      turned_away: 'Turned Away',
      driver_left: 'Driver Left',
      unloaded: 'Unloaded',
      loaded: 'Loaded',
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
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Status Update</h1>
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
                      
                      ${newStatus === 'unloaded' || newStatus === 'loaded' ? `
                      <p style="font-size: 16px; color: #333333; margin: 30px 0 0; text-align: center; font-weight: bold;">Please proceed to the office to collect your paperwork.</p>
                      ` : ''}
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #333333; padding: 20px; text-align: center;">
                      <p style="color: #ffffff; margin: 0; font-size: 12px;">307 Corporation - Automated Notification</p>
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

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@307logistics.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async sendCheckInConfirmation(
    to: string,
    driverName: string,
    checkInTime: string,
    referenceNumber: string
  ): Promise<void> {
    const template = this.getCheckInConfirmationTemplate(
      driverName,
      checkInTime,
      referenceNumber
    );
    await this.sendEmail({ to, ...template });
  }

  async sendDockAssignment(
    to: string,
    driverName: string,
    dockNumber: string,
    referenceNumber: string,
    loadType: 'inbound' | 'outbound',
    checkInTime: string,
    appointmentTime?: string,
    appointmentStatus?: string
  ): Promise<void> {
    const template = this.getDockAssignmentTemplate(
      driverName,
      dockNumber,
      referenceNumber,
      loadType,
      checkInTime,
      appointmentTime,
      appointmentStatus
    );
    await this.sendEmail({ to, ...template });
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
    await this.sendEmail({ to, ...template });
  }
}

export default EmailService;
