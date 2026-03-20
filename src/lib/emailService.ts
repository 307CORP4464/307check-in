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
      const template = this.getCheckInConfirmationTemplate(driverName, checkInTime, referenceNumber);
      await this.transporter.sendMail({ to: toEmail, subject: template.subject, html: template.html });
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
    appointmentStatus?: string,
    grossWeight?: string,
    isDoubleBooked?: boolean
  ): Promise<void> {
    try {
      const template = this.getDockAssignmentTemplate(
        driverName, dockNumber, referenceNumber, loadType,
        checkInTime, appointmentTime, appointmentStatus, grossWeight, isDoubleBooked
      );
      await this.transporter.sendMail({ to: toEmail, subject: template.subject, html: template.html });
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
      const template = this.getCheckInDenialTemplate(driverName, carrierName, referenceNumber, denialReason);
      await this.transporter.sendMail({ to: toEmail, subject: template.subject, html: template.html });
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
    endTime?: string,
    rejectionReasons?: string[],
    resolutionAction?: 'correct_and_return' | 'new_trailer'
  ): Promise<void> {
    try {
      const template = this.getStatusChangeTemplate(
        driverName, referenceNumber, oldStatus, newStatus,
        notes, endTime, undefined, rejectionReasons, resolutionAction
      );
      await this.transporter.sendMail({ to: toEmail, subject: template.subject, html: template.html });
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
                  <tr>
                    <td style="background-color: #4CAF50; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Check-In Confirmed</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your check-in has been successfully submitted.</p>
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
                  <tr>
                    <td style="background-color: #f44336; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⚠️ Check-In Request Denied</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Unfortunately, your check-in request has been denied.</p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid #f44336; margin: 20px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}</p>
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Carrier:</strong> ${carrierName}</p>
                            <p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Time:</strong> ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                          </td>
                        </tr>
                      </table>
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
    endTime?: string,
    dockNumber?: string,
    rejectionReasons?: string[],
    resolutionAction?: 'correct_and_return' | 'new_trailer'
  ): EmailTemplate {
    const formatStatus = (status: string): string => {
      switch (status) {
        case 'checked_out': return 'Almost Finished – Waiting to Be Sealed';
        case 'at_dock': return 'At Dock';
        case 'rejected': return 'Rejected';
        case 'turned_away': return 'Turned Away';
        case 'driver_left': return 'Driver Left';
        default: return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
    };

    const isCheckedOut = newStatus === 'checked_out';
    const isRejected = newStatus === 'rejected';

    const headerColor = isCheckedOut ? '#FF9800' :
      isRejected || newStatus === 'turned_away' ? '#f44336' :
      newStatus === 'driver_left' ? '#9E9E9E' : '#4CAF50';

    const headerIcon = isCheckedOut ? '🟡' :
      isRejected || newStatus === 'turned_away' ? '⚠️' :
      newStatus === 'driver_left' ? '🚚' : '✅';

    const dockDisplay = dockNumber
      ? (dockNumber === 'Ramp' ? 'RAMP' : `Dock ${dockNumber}`)
      : null;

    // Build rejection reasons list HTML
    const rejectionReasonsHtml = rejectionReasons && rejectionReasons.length > 0
      ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff5f5; border: 2px solid #f44336; border-radius: 6px; margin: 20px 0;">
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 14px; font-size: 16px; font-weight: bold; color: #c62828;">
                ⚠️ Your trailer has been rejected for the following reason(s):
              </p>
              <table cellpadding="0" cellspacing="0" width="100%">
                ${rejectionReasons.map((reason, i) => `
                  <tr>
                    <td style="padding: 5px 0;">
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="vertical-align: top; padding-right: 10px; color: #f44336; font-weight: bold; font-size: 14px; white-space: nowrap;">${i + 1}.</td>
                          <td style="font-size: 14px; color: #333333; line-height: 1.5;">${reason}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                `).join('')}
              </table>
            </td>
          </tr>
        </table>
      `
      : '';

    // Build resolution / next steps HTML
    const resolutionHtml = resolutionAction
      ? (() => {
          const isCorrect = resolutionAction === 'correct_and_return';
          const resolutionColor = isCorrect ? '#e65100' : '#b71c1c';
          const resolutionBg = isCorrect ? '#fff8e1' : '#ffebee';
          const resolutionBorder = isCorrect ? '#FF9800' : '#f44336';
          const resolutionIcon = isCorrect ? '🔧' : '🚫';
          const resolutionTitle = isCorrect ? 'What You Need to Do:' : 'Important Notice:';
          const resolutionText = isCorrect
            ? 'The trailer issues listed above must be corrected before re-entry. Once the trailer has been cleaned and/or repaired to meet our requirements, you may check back in.'
            : 'This trailer will <strong>not</strong> be loaded under any circumstances. A new, clean trailer that meets our requirements must be provided in order to proceed with this load.';

          return `
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${resolutionBg}; border: 2px solid ${resolutionBorder}; border-radius: 6px; margin: 20px 0;">
              <tr>
                <td style="padding: 24px;">
                  <p style="margin: 0 0 10px; font-size: 16px; font-weight: bold; color: ${resolutionColor};">
                    ${resolutionIcon} ${resolutionTitle}
                  </p>
                  <p style="margin: 0; font-size: 14px; color: #333333; line-height: 1.6;">
                    ${resolutionText}
                  </p>
                </td>
              </tr>
            </table>
          `;
        })()
      : '';

    return {
      subject: isRejected
        ? `Trailer Rejected – Action Required - Ref #${referenceNumber}`
        : isCheckedOut
        ? `Action Required: Almost Finished – Ref #${referenceNumber}`
        : `Status Update: ${formatStatus(newStatus)} - ${referenceNumber}`,
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
                    <td style="background-color: ${headerColor}; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 26px;">
                        ${headerIcon} ${isRejected ? 'Trailer Rejected' : isCheckedOut ? 'Almost Finished – Waiting to Be Sealed' : formatStatus(newStatus)}
                      </h1>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>

                      ${isRejected
                        ? `<p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Your trailer inspection at our facility has not passed. Please review the details below.</p>`
                        : isCheckedOut
                        ? `<p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Your load is <strong>almost finished</strong> and is currently waiting to be sealed.</p>`
                        : `<p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Your load status has been updated.</p>`
                      }

                      <!-- Info Box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid ${headerColor}; margin: 20px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;">
                              <strong style="color: #333333;">Reference Number:</strong> ${referenceNumber}
                            </p>
                            ${dockDisplay ? `
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;">
                              <strong style="color: #333333;">Dock:</strong> ${dockDisplay}
                            </p>
                            ` : ''}
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;">
                              <strong style="color: #333333;">Status:</strong> ${formatStatus(newStatus)}
                            </p>
                            ${endTime ? `
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;">
                              <strong style="color: #333333;">Time:</strong> ${endTime}
                            </p>
                            ` : ''}
                          </td>
                        </tr>
                      </table>

                      ${rejectionReasonsHtml}
                      ${resolutionHtml}

                      ${notes ? `
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-left: 4px solid #9E9E9E; margin: 20px 0;">
                        <tr>
                          <td style="padding: 16px 20px;">
                            <p style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #555555; text-transform: uppercase; letter-spacing: 0.5px;">Additional Notes</p>
                            <p style="margin: 0; font-size: 14px; color: #444444; line-height: 1.6;">${notes}</p>
                          </td>
                        </tr>
                      </table>
                      ` : ''}

                      ${isCheckedOut ? `
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff8e1; border: 2px solid #FF9800; border-radius: 6px; margin: 24px 0;">
                        <tr>
                          <td style="padding: 24px;">
                            <p style="margin: 0 0 14px; font-size: 16px; color: #e65100;">
                              <strong>📋 Next Steps – Please Read Carefully:</strong>
                            </p>
                            <table cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding: 6px 0; font-size: 15px; color: #333333;">
                                  🟢 &nbsp;<strong>Step 1:</strong> Watch for the <strong>dock light to change to GREEN</strong>.
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 6px 0; font-size: 15px; color: #333333;">
                                  🏢 &nbsp;<strong>Step 2:</strong> Once the light turns green, <strong>come to the office for your paperwork</strong>.
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      ` : ''}

                      ${isRejected ? `
                      <p style="font-size: 14px; color: #777777; margin: 24px 0 0; text-align: center;">
                        If you have questions, please see us in the office.
                      </p>
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

  private getDockAssignmentTemplate(
    driverName: string,
    dockNumber: string,
    referenceNumber: string,
    loadType: 'inbound' | 'outbound',
    checkInTime: string,
    appointmentTime?: string,
    appointmentStatus?: string,
    grossWeight?: string,
    isDoubleBooked?: boolean
  ): EmailTemplate {
    const dockDisplay = dockNumber === 'Ramp' ? 'RAMP' : `DOCK ${dockNumber}`;

    const statusColors: Record<string, { bg: string; text: string }> = {
      'On Time': { bg: '#4CAF50', text: '#ffffff' },
      'Early': { bg: '#2196F3', text: '#ffffff' },
      'Late': { bg: '#FF9800', text: '#ffffff' },
      'No Appointment': { bg: '#9E9E9E', text: '#ffffff' },
    };

    const statusStyle = statusColors[appointmentStatus || 'No Appointment'];
    const instructions = loadType === 'inbound' ? this.getInboundInstructions() : this.getOutboundInstructions();

    return {
      subject: `Dock Assignment - ${referenceNumber}`,
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
                  <tr>
                    <td style="background-color: #2196F3; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🚛 Dock Assignment - ${loadType === 'inbound' ? 'UNLOADING' : 'LOADING'}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="font-size: 16px; color: #333333; margin: 0 0 20px;">Hello ${driverName},</p>
                      <p style="font-size: 16px; color: #333333; margin: 0 0 30px;">Your dock has been assigned. Please proceed to:</p>
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
                      ${isDoubleBooked ? `
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff3e0; border: 2px solid #FF9800; border-radius: 6px; margin: 16px 0;">
                        <tr>
                          <td style="padding: 20px;">
                            <p style="margin: 0 0 10px; font-size: 16px; font-weight: bold; color: #e65100;">⚠️ Important – Please Wait Before Pulling In</p>
                            <p style="margin: 0; font-size: 14px; color: #5d4037; line-height: 1.6;">This dock is currently occupied by another truck. <strong>Do not pull into the dock until the first truck has fully pulled out.</strong> Once the dock is clear, proceed with your normal instructions below.</p>
                          </td>
                        </tr>
                      </table>
                      ` : ''}
                      <tr>
                        <td style="padding: 12px 16px; background-color: #fff8e1; border-top: 1px solid #ffe082;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td>
                                <p style="margin: 0 0 6px 0; font-size: 15px; font-weight: bold; color: #e65100;">⚖️ Gross Weight: ${Number(grossWeight).toLocaleString()} lbs</p>
                                <p style="margin: 0; font-size: 13px; color: #5d4037; line-height: 1.5;"><strong>If you have any concerns or disputes regarding this weight, please see us in the office before proceeding to your assigned dock. By continuing to the dock you are accepting this weight.</strong></p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 40px 30px;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong style="color: #333333;">Check-In Time:</strong> ${checkInTime}</p>
                            ${appointmentTime ? `<p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Appointment Time:</strong> ${appointmentTime}</p>` : '<p style="margin: 0; font-size: 14px; color: #666666;"><strong style="color: #333333;">Appointment:</strong> No Appointment</p>'}
                          </td>
                        </tr>
                      </table>
                      <p style="font-size: 18px; color: #333333; margin: 30px 0 15px; text-align: center; font-weight: bold;">Please proceed to your assigned dock immediately.</p>
                      ${instructions}
                    </td>
                  </tr>
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
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>1.</strong> Do NOT cut your seal.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>2.</strong> Slide your tandems to the back.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>3.</strong> Back into the assigned dock.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>4.</strong> The light will turn red when you are being unloaded.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>5.</strong> When you are done the light will turn green.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>6.</strong> If you need your paperwork signed please bring a copy to the office when you are unloaded.</p></td></tr>
        </table>
      </div>
    `;
  }

  private getOutboundInstructions(): string {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #2196F3; margin: 0 0 15px; font-size: 20px;">🚚 Loading Instructions:</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>1.</strong> Place 2 load bars or straps in your trailer.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>2.</strong> Leave your doors closed. We will open inside the building.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>3.</strong> Slide your tandems to the back.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>4.</strong> Back into the assigned dock once open.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>5.</strong> The light will change to red when you are being loaded.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>6.</strong> You will also receive an email with your updated status.</p></td></tr>
          <tr><td style="padding: 8px 0;"><p style="margin: 0; font-size: 15px; color: #333333;"><strong>7.</strong> When you are done the light will go back to green. You will also receive an email with your updated status.</p></td></tr>
        </table>
      </div>
    `;
  }
}

export default EmailService;
