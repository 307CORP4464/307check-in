import { supabase } from './supabase';
import { Appointment, AppointmentInput } from '@/types/appointments';

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('scheduled_date', date)
    .order('scheduled_time', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  const salesOrder = input.salesOrder?.trim() || null;
  const delivery = input.delivery?.trim() || null;

  if (!salesOrder && !delivery) {
    throw new Error('Either Sales Order or Delivery must be provided');
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      scheduled_date: input.date,
      scheduled_time: input.time,
      sales_order: salesOrder,           // ✅ Fixed
      delivery: delivery,
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
      scheduled_date: input.date,
      scheduled_time: input.time,
      sales_order: input.salesOrder?.trim() || null,  // ✅ Fixed
      delivery: input.delivery?.trim() || null
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
  scheduled_date: string,
  scheduled_time: string,
  salesOrder?: string,
  delivery?: string
): Promise<boolean> {
  const query = supabase
    .from('appointments')
    .select('id')
    .eq('scheduled_date', scheduled_date)    // ✅ Fixed
    .eq('scheduled_time', scheduled_time);   // ✅ Fixed

  if (salesOrder) {
    query.eq('sales_order', salesOrder);     // ✅ Fixed
  }
  if (delivery) {
    query.eq('delivery', delivery);
  }

  const { data, error } = await query;
  
  if (error) throw error;
  return (data?.length || 0) > 0;
}
