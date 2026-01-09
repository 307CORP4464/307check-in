import { supabase } from './supabase';
import { Appointment, AppointmentInput } from '@/types/appointments';

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('date', date)
    .order('time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  // Handle empty strings - convert to null or throw error
  const salesOrder = input.salesOrder?.trim() || null;
  const delivery = input.delivery?.trim() || null;

  // Validate that at least one reference number exists
  if (!salesOrder && !delivery) {
    throw new Error('Either Sales Order or Delivery must be provided');
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      date: input.date,
      time: input.time,
      salesOrder: salesOrder,
      delivery: delivery,
      carrier: input.carrier?.trim() || null,
      notes: input.notes?.trim() || null,
      source: input.source || 'manual'
    }])
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    throw new Error(error.message || 'Failed to create appointment');
  }
  
  return data;
}

export async function updateAppointment(
  id: number,
  input: Partial<AppointmentInput>
): Promise<Appointment> {
  const { data, error} = await supabase
    .from('appointments')
    .update({
      date: input.date,
      time: input.time,
      salesOrder: input.salesOrder?.trim() || null,
      delivery: input.delivery?.trim() || null,
      carrier: input.carrier?.trim() || null,
      notes: input.notes?.trim() || null
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAppointment(id: number): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function checkDuplicateAppointment(
  date: string,
  time: string,
  salesOrder?: string,
  delivery?: string
): Promise<boolean> {
  const query = supabase
    .from('appointments')
    .select('id')
    .eq('date', date)
    .eq('time', time);

  if (salesOrder) {
    query.eq('salesOrder', salesOrder);
  }
  if (delivery) {
    query.eq('delivery', delivery);
  }

  const { data, error } = await query;
  
  if (error) throw error;
  return (data?.length || 0) > 0;
}
