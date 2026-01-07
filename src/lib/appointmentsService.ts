import { supabase } from './supabase';
import { Appointment, AppointmentInput } from '@/types/appointments';

const TIME_ORDER = {
  '0800': 1, '0900': 2, '0930': 3, '1000': 4,
  '1030': 5, '1100': 6, '1230': 7, '1300': 8,
  '1330': 9, '1400': 10, '1430': 11, '1500': 12,
  '1530': 13, 'Work In': 14
};

export async function cleanOldAppointments() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  await supabase
    .from('appointments')
    .delete()
    .lt('scheduled_date', sevenDaysAgo.toISOString().split('T')>[0]</a>);
}

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  await cleanOldAppointments();
  
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('scheduled_date', date)
    .order('sales_order', { ascending: true });
  
  if (error) {
    console.error('Error fetching appointments:', error);
    throw error;
  }
  
  // Sort by time slot order
  return (data || []).sort((a, b) => {
    const orderA = TIME_ORDER[a.scheduled_time as keyof typeof TIME_ORDER] || 99;
    const orderB = TIME_ORDER[b.scheduled_time as keyof typeof TIME_ORDER] || 99;
    return orderA - orderB;
  });
}

export async function findAppointmentByReference(reference: string): Promise<Appointment | null> {
  const today = new Date().toISOString().split('T')<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>;
  
  // Try sales order first
  let { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('sales_order', reference)
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .limit(1);
  
  if (data && data.length > 0) return data<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>;
  
  // Try delivery
  ({ data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('delivery', reference)
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .limit(1));
  
  return data && data.length > 0 ? data<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a> : null;
}

export async function createAppointment(appointment: AppointmentInput): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert([{ ...appointment, source: appointment.source || 'manual' }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateAppointment(id: number, appointment: AppointmentInput): Promise<Appointment> {
  // Check if it's manual
  const { data: existing } = await supabase
    .from('appointments')
    .select('source')
    .eq('id', id)
    .single();
  
  if (!existing || existing.source !== 'manual') {
    throw new Error('Cannot update Excel-imported appointments');
  }
  
  const { data, error } = await supabase
    .from('appointments')
    .update(appointment)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteAppointment(id: number): Promise<void> {
  // Check if it's manual
  const { data: existing } = await supabase
    .from('appointments')
    .select('source')
    .eq('id', id)
    .single();
  
  if (!existing || existing.source !== 'manual') {
    throw new Error('Cannot delete Excel-imported appointments');
  }
  
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

export async function bulkCreateAppointments(appointments: AppointmentInput[]): Promise<number> {
  const { data, error } = await supabase
    .from('appointments')
    .insert(appointments)
    .select();
  
  if (error) throw error;
  return data?.length || 0;
}
export function formatAppointmentTime(timeSlot: string): string {
  if (timeSlot === 'Work In') return 'Work In';
  return `${timeSlot.substring(0, 2)}:${timeSlot.substring(2)}`;
}

