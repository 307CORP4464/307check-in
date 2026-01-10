import { supabase } from './supabase';
import { Appointment, AppointmentInput } from '@/types/appointments';

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  console.log('Fetching appointments for date:', date); // Debug log
  
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('scheduled_date', date)
    .order('scheduled_time', { ascending: true });

  if (error) {
    console.error('Error fetching appointments:', error);
    throw error;
  }
  
  console.log('Fetched appointments:', data); // Debug log
  return data || [];
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  const salesOrder = input.salesOrder?.trim() || null;
  const delivery = input.delivery?.trim() || null;

  if (!salesOrder && !delivery) {
    throw new Error('Either Sales Order or Delivery must be provided');
  }

  console.log('Creating appointment with data:', {
    scheduled_date: input.date,
    scheduled_time: input.time,
    sales_order: salesOrder,
    delivery: delivery,
    notes: input.notes?.trim() || null,
    source: input.source || 'manual'
  });

  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      scheduled_date: input.date,
      scheduled_time: input.time,
      sales_order: salesOrder,
      delivery: delivery,
      notes: input.notes?.trim() || null,
      source: input.source || 'manual'
    }])
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    throw new Error(error.message || 'Failed to create appointment');
  }
  
  console.log('Created appointment:', data); // Debug log
  return data;
}

export async function updateAppointment(
  id: number,
  input: Partial<AppointmentInput>
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .update({
      scheduled_date: input.date,
      scheduled_time: input.time,
      sales_order: input.salesOrder?.trim() || null,
      delivery: input.delivery?.trim() || null,
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
  scheduled_date: string,
  scheduled_time: string,
  salesOrder?: string,
  delivery?: string
): Promise<boolean> {
  const query = supabase
    .from('appointments')
    .select('id')
    .eq('scheduled_date', scheduled_date)
    .eq('scheduled_time', scheduled_time);

  if (salesOrder) {
    query.eq('sales_order', salesOrder);
  }
  if (delivery) {
    query.eq('delivery', delivery);
  }

  const { data, error } = await query;
  
  if (error) throw error;
  return (data?.length || 0) > 0;
}
