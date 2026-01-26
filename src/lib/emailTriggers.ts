// lib/emailTriggers.ts
import { EmailService } from './emailService';

interface TriggerData {
  driverEmail: string;
  driverName: string;
  carrierName: string;
  trailerNumber: string;
  referenceNumber: string;
  destinationCity: String;
  destinationState: String;
  loadType?: string;
  dockNumber?: string;
  appointmentTime?: string;
  oldStatus?: string;
  newStatus?: string;
  notes?: string;
  checkInTime: string;
}

// lib/emailTriggers.ts
export async function triggerCheckInEmail(data: TriggerData) {
  try {
    const checkInTime = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'checkin',
        toEmail: data.driverEmail,
        data: {
          driverName: data.driverName,
          checkInTime,
          referenceNumber: data.referenceNumber,
          loadType: data.loadType || 'inbound',
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to trigger check-in email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}


export async function triggerDockAssignmentEmail(data: TriggerData) {
  try {
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dock_assignment',
        toEmail: data.driverEmail,
        data: {
          driverName: data.driverName,
          dockNumber: data.dockNumber,
          referenceNumber: data.referenceNumber,
          appointmentTime: data.appointmentTime,
        },
      }),
    });
  } catch (error) {
    console.error('Failed to trigger dock assignment email:', error);
  }
}

export async function triggerStatusChangeEmail(data: TriggerData) {
  try {
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'status_change',
        toEmail: data.driverEmail,
        data: {
          driverName: data.driverName,
          referenceNumber: data.referenceNumber,
          oldStatus: data.oldStatus,
          newStatus: data.newStatus,
          notes: data.notes,
        },
      }),
    });
  } catch (error) {
    console.error('Failed to trigger status change email:', error);
  }
}
