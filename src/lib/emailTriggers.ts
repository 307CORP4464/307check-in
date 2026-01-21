// lib/emailTriggers.ts
import { emailService } from './emailService';

interface TriggerData {
  driverEmail: string;
  driverName: string;
  referenceNumber: string;
  loadType?: string;
  dockNumber?: string;
  appointmentTime?: string;
  oldStatus?: string;
  newStatus?: string;
  notes?: string;
}

export async function triggerCheckInEmail(data: TriggerData) {
  try {
    const checkInTime = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await fetch('/api/send-email', {
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
  } catch (error) {
    console.error('Failed to trigger check-in email:', error);
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
