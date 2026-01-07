import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appointments } = body;

    if (!appointments || !Array.isArray(appointments)) {
      return NextResponse.json(
        { error: 'Invalid appointments data' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const appointmentData of appointments) {
      try {
        await createAppointment(appointmentData as AppointmentInput);
        results.success++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(
          `Failed to create appointment for ${appointmentData.customer_name}: ${errorMessage}`
        );
      }
    }

    return NextResponse.json({
      message: `Upload complete: ${results.success} succeeded, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error('Error uploading appointments:', error);
    return NextResponse.json(
      { error: 'Failed to upload appointments' },
      { status: 500 }
    );
  }
}

