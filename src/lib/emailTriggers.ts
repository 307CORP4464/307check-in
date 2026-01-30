// lib/emailTriggers.ts
interface TriggerData {
  driverEmail: string;
  driverName: string;
  carrierName: string;
  trailerNumber: string;
  referenceNumber: string;
  destinationCity: string;
  destinationState: string;
  loadType?: string;
  dockNumber?: string;
  appointmentTime?: string;
  oldStatus?: string;
  newStatus?: string;
  notes?: string;
  checkInTime: string;
}

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to trigger status change email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function triggerCheckInEmail(data: TriggerData): Promise<{ success: boolean; error?: string }> {
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

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.details || 'Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to trigger check-in email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error sending email' 
    };
  }
}
export async function triggerCheckInDenialEmail(data: {
  driverEmail: string;
  driverName: string;
  carrierName: string;
  referenceNumber: string;
  denialReason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'check_in_denial',
        toEmail: data.driverEmail,
        data: {
          driverName: data.driverName,
          carrierName: data.carrierName,
          referenceNumber: data.referenceNumber,
          denialReason: data.denialReason,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.details || 'Failed to send denial email');
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to trigger check-in denial email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error sending denial email' 
    };
  }
}

export async function triggerDockAssignmentEmail(data: TriggerData): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/send-email', {
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

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to trigger dock assignment email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function triggerStatusChangeEmail(data: {
  driverEmail: string;
  driverName: string;
  referenceNumber: string;
  oldStatus: string;
  newStatus: string;
  notes?: string;
  endTime?: string;
  // Make other fields optional for this trigger
  carrierName?: string;
  trailerNumber?: string;
  destinationCity?: string;
  destinationState?: string;
  checkInTime?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/send-email', {
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
          endTime: data.endTime,
        },
      }),
    });


    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to trigger status change email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
