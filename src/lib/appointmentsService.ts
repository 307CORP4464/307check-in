import { supabase } from './supabase';
import { Appointment, AppointmentInput } from '@/types/appointments';

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  console.log('🔍 Fetching appointments for date:', date);
  
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('appointment_date', date)  // ✅ FIXED
    .order('appointment_time', { ascending: true });  // ✅ FIXED

  if (error) {
    console.error('❌ Error fetching appointments:', error);
    throw error;
  }
  
  console.log('✅ Fetched appointments:', data?.length || 0);
  console.log('📦 Data:', data);
  return data || [];
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  const sales_order = input.sales_order?.trim() || null;
  const delivery = input.delivery?.trim() || null;

  if (!sales_order && !delivery) {
    throw new Error('Either Sales Order or Delivery must be provided');
  }

  console.log('📝 Creating appointment:', {
    appointment_date: input.appointment_date,
    appointment_time: input.appointment_time,
    sales_order: sales_order,
    delivery: delivery,
    notes: input.notes?.trim() || null,
    source: input.source || 'manual'
  });

  const { data, error } = await supabase
    .from('appointments')
    .insert([{
      appointment_date: input.appointment_date,
      appointment_time: input.appointment_time,
      sales_order: sales_order,
      delivery: delivery,
      notes: input.notes?.trim() || null,
      source: input.source || 'manual'
    }])
    .select()
    .single();

  if (error) {
    console.error('❌ Supabase insert error:', error);
    throw new Error(error.message || 'Failed to create appointment');
  }
  
  console.log('✅ Created appointment:', data);
  return data;
}

export async function updateAppointment(
  id: number,
  input: Partial<AppointmentInput>
): Promise<Appointment> {
  console.log('🔄 Updating appointment:', id, input);
  
  const { data, error } = await supabase
    .from('appointments')
    .update({
      appointment_date: input.appointment_date,
      appointment_time: input.appointment_time,
      sales_order: input.sales_order?.trim() || null,
      delivery: input.delivery?.trim() || null,
      notes: input.notes?.trim() || null
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('❌ Update error:', error);
    throw error;
  }
  
  console.log('✅ Updated appointment:', data);
  return data;
}

export async function deleteAppointment(id: number): Promise<void> {
  console.log('🗑️ Deleting appointment:', id);
  
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('❌ Delete error:', error);
    throw error;
  }
  
  console.log('✅ Deleted appointment:', id);
}

export async function checkDuplicateAppointment(
  appointment_date: string,
  appointment_time: string,
  sales_order?: string,
  delivery?: string
): Promise<boolean> {
  const query = supabase
    .from('appointments')
    .select('id')
    .eq('appointment_date', appointment_date)
    .eq('appointment_time', appointment_time);

  if (sales_order) {
    query.eq('sales_order', sales_order);
  }
  if (delivery) {
    query.eq('delivery', delivery);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('❌ Duplicate check error:', error);
    throw error;
  }
  
  return (data?.length || 0) > 0;
}
