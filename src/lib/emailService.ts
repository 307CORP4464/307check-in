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

  // PUBLIC METHODS
  async sendCheckInConfirmation(
    toEmail: string,
    driverName: string,
    checkInTime: string,
    referenceNumber: string
  ): Promise<void> {
    try {
      const template = this.getCheckInConfirmationTemplate(
        driverName,
        checkInTime,
        referenceNumber
      );

      const mailOptions: EmailOptions = {
        to: toEmail,
        subject: template.subject,
        html: template.html,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Check-in confirmation email sent to ${toEmail}`);
    } catch (error) {
      console.error('Error sending check-in confirmation email:', error);
      throw new Error('Failed to send check-in confirmation email');
    }
  }

  async sendDockAssignment(
    toEmail: string,
    driverName: string,
    dockNumber: string,
    referenceNumber: string,
    loadType: 'inbound' | 'outbound',
    checkInTime: string,
    appointmentTime?: string,
    appointmentStatus?: string
  ): Promise<void> {
    try {
      const template = this.getDockAssignmentTemplate(
        driverName,
        dockNumber,
        referenceNumber,
        loadType,
        checkInTime,
        appointmentTime,
        appointmentStatus
      );

      const mailOptions: EmailOptions = {
        to: toEmail,
        subject: template.subject,
        html: template.html,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Dock assignment email sent to ${toEmail}`);
    } catch (error) {
      console.error('Error sending dock assignment email:', error);
      throw new Error('Failed to send dock assignment email');
    }
  }

  async sendCheckInDenial(
  toEmail: string,
  driverName: string,
  carrierName: string,
  referenceNumber: string,
  denialReason: string
): Promise<void> {
  try {
    const template = this.getCheckInDenialTemplate(
      driverName,
      carrierName,
      referenceNumber,
      denialReason
    );

    const mailOptions: EmailOptions = {
      to: toEmail,
      subject: template.subject,
      html: template.html,
    };

    await this.transporter.sendMail(mailOptions);
    console.log(`Check-in denial email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending check-in denial email:', error);
    throw new Error('Failed to send check-in denial email');
  }
}

async sendStatusChange(
  toEmail: string,
  driverName: string,
  referenceNumber: string,
  oldStatus: string,
  newStatus: string,
  notes?: string,
  endTime?: string
): Promise<void> {
  try {
    const template = this.getStatusChangeTemplate(
      driverName,
      referenceNumber,
      oldStatus,
      newStatus,
      notes,
      endTime
    );

    const mailOptions: EmailOptions = {
      to: toEmail,
      subject: template.subject,
      html: template.html,
    };

    await this.transporter.sendMail(mailOptions);
    console.log(`Status change email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending status change email:', error);
    throw new Error('Failed to send status change email');
  }
}


  // PRIVATE TEMPLATE METHODS
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

  private getCheckInDenialTemplate(
  driverName: string,
  carrierName: string,
  referenceNumber: string,
  denialReason: string
): EmailTemplate {
  return {
    subject: `Check-In Request Denied - ${referenceNumber}`,
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
                  <td style="background-color: #f44336; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⚠️ Check-In Request Denied</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                    <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Unfortunately, your check-in request has been denied.</p>
                    
                    <!-- Info Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid #f44336; margin: 20px 0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}</p>
                          <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Carrier:</strong> ${carrierName}</p>
                          <p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Time:</strong> ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Reason Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff3cd; border: 2px solid #ffc107; margin: 20px 0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px; font-size: 14px; color: #333333; font-weight: bold;">Reason for Denial:</p>
                          <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.6;">${denialReason}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="font-size: 16px; color: #333333; margin: 30px 0 20px;">Please contact the facility for further assistance or clarification.</p>
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
private getStatusChangeTemplate(
  driverName: string,
  referenceNumber: string,
  oldStatus: string,
  newStatus: string,
  notes?: string,
  endTime?: string
): EmailTemplate {
  // Map status values to user-friendly text
  const statusDisplay: Record<string, string> = {
    'checked_in': 'Checked In',
    'at_dock': 'At Dock',
    'loading': 'Loading',
    'unloading': 'Unloading',
    'checked_out': 'Completed',
    'unloaded': 'Unloaded',
    'rejected': 'Rejected',
    'turned_away': 'Turned Away',
    'driver_left': 'Driver Left',
    'denied': 'Denied',
  };

  // Status-specific colors
  const statusColors: Record<string, string> = {
    'checked_out': '#4CAF50',
    'unloaded': '#4CAF50',
    'rejected': '#f44336',
    'turned_away': '#ff9800',
    'driver_left': '#9e9e9e',
  };

  const statusColor = statusColors[newStatus] || '#2196F3';
  const newStatusText = statusDisplay[newStatus] || newStatus;
  const oldStatusText = statusDisplay[oldStatus] || oldStatus;

  return {
    subject: `Load Status Update - ${referenceNumber}`,
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
                  <td style="background-color: ${statusColor}; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📋 Status Update</h1>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                    <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your load status has been updated.</p>
                    
                    <!-- Info Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid ${statusColor}; margin: 20px 0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}</p>
                          <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Previous Status:</strong> ${oldStatusText}</p>
                          <p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">New Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${newStatusText}</span></p>
                          ${endTime ? `<p style="margin: 10px 0 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Completion Time:</strong> ${endTime}</p>` : ''}
                        </td>
                      </tr>
                    </table>
                    
                    ${notes ? `
                    <!-- Notes Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff3cd; border: 2px solid #ffc107; margin: 20px 0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px; font-size: 14px; color: #333333; font-weight: bold;">Additional Notes:</p>
                          <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.6;">${notes}</p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                    <p style="font-size: 16px; color: #333333; margin: 30px 0 20px;">Thank you for your service!</p>
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
        <h3 style="color: #2196F3; margin: 0 0 15px; font-size: 20px;">📦 Unloading Instructions:</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>1.</strong> Do NOT cut your seal.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>2.</strong> Slide your tandems to the back.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>3.</strong> Back into the assigned dock.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>4.</strong> The light will turn red when you are being unloaded.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>5.</strong> When you are done the light will turn green.</p>
            </td>
            </tr>
             <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>6.</strong> If you need your paperwork signed please bring a copy to the office when you are unloaded.</p>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private getOutboundInstructions(): string {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #2196F3; margin: 0 0 15px; font-size: 20px;">🚚 Loading Instructions:</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>1.</strong> Place 2 load bard or straps in your trailer.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>2.</strong> Leave your doors closed. We will open inside the building.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>3.</strong> Slide your tandems to the back.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>4.</strong> Back into the assigned dock once open. </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>5.</strong> The light will change to red when you are being loaded. </p>
            </td>
            </tr>
          <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>6.</strong> You will also receive an email with your updated status. </p>
            </td>
          </tr>
           <tr>
            <td style="padding: 8px 0;">
              <p style="margin: 0; font-size: 15px; color: #333333;"><strong>7.</strong> When you are done the light will go back to green. You will also receive an email with your updated status. </p>
            </td>
          </tr>
        </table>
      </div>
    `;
  }
}


// Export singleton instance
export default EmailService;
