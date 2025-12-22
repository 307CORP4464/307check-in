import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkInFormSchema } from '@/lib/validations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate the input
    const validatedData = checkInFormSchema.parse(body);

    // Check if pickup number already checked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: existingCheckIn } = await supabase
      .from('check_ins')
      .select('id')
      .eq('pickup_number', validatedData.pickup_number)
      .gte('check_in_time', today.toISOString())
      .single();

    if (existingCheckIn) {
      return NextResponse.json(
        { error: 'This pickup number has already checked in today' },
        { status: 400 }
      );
    }

    // Optional: Check if pickup number exists in scheduled appointments
    const { data: appointment } = await supabase
      .from('scheduled_appointments')
      .select('*')
      .eq('pickup_number', validatedData.pickup_number)
      .single();

    // Insert the check-in
    const { data, error } = await supabase
      .from('check_ins')
      .insert([{
        ...validatedData,
        status: 'pending',
        appointment_time: appointment?.scheduled_time || null,
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      data,
      message: 'Check-in successful' 
    });

  } catch (error) {
    console.error('Check-in error:', error);
    
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid form data', details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process check-in' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .gte('check_in_time', today.toISOString())
      .order('check_in_time', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching check-ins:', error);
    return NextResponse.json(
      { error: 'Failed to fetch check-ins' },
      { status: 500 }
    );
  }
}
