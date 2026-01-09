import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appointments } = body;

    if (!appointments || !Array.isArray(appointments)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const appointmentData of appointments) {
      try {
        // Add the source property required by createAppointment
        await createAppointment({ 
          ...appointmentData as AppointmentInput,
          source: 'upload' 
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to create appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}
