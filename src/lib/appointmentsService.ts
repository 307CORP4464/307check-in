import { createBrowserClient } from '@supabase/ssr';
import { Appointment, AppointmentInput } from '@/types/appointments';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Check for duplicate appointments
export const checkDuplicateAppointment = async (
  salesOrder: string,
  delivery: string,
  date: string,
  excludeId?: number
): Promise<Appointment | null> => {
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('appointment_date', date);

  if (salesOrder) {
    query = query.eq('sales_order', salesOrder);
  }
  if (delivery) {
    query = query.eq('delivery', delivery);
  }

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query.single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error checking duplicates:', error);
  }
  
  return data || null;
};

// Get load status from daily logs
export const getLoadStatusFromLog = async (
  salesOrder: string,
  delivery: string
): Promise<string | null> => {
  try {
    let query = supabase
      .from('daily_logs')
      .select('load_status')
      .order('created_at', { ascending: false })
      .limit(1);

    if (salesOrder) {
      query = query.eq('sales_order', salesOrder);
    }
    if (delivery) {
      query = query.eq('delivery_number', delivery);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error fetching load status:', error);
      }
      return null;
    }

    return data?.load_status || null;
  } catch (error) {
    console.error('Error in getLoadStatusFromLog:', error);
    return null;
  }
};

export const createAppointment = async (data: AppointmentInput & { source: string }) => {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert([data])
    .select()
    .single();

  if (error) throw error;
  return appointment;
};

export const updateAppointment = async (id: number, data: AppointmentInput) => {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return appointment;
};

export const deleteAppointment = async (id: number) => {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const getAppointmentsByDate = async (date: string): Promise<Appointment[]> => {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('appointment_date', date)
    .order('scheduled_time', { ascending: true });

  if (error) throw error;
  return data || [];
};

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
    .lt('scheduled_date', sevenDaysAgo.toISOString().split('T')[0]);
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
  const today = new Date().toISOString().split('T')[0];
  
  // Try sales order first
  let { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('sales_order', reference)
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .limit(1);
  
  if (data && data.length > 0) return data[0];
  
  // Try delivery
  ({ data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('delivery', reference)
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
    .limit(1));
  
  return data && data.length > 0 ? data[0] : null;
}

export async function createAppointment(appointmentData: any) {
  const { data, error } = await supabase
    .from('appointments')
    .insert([{ ...appointmentData, source: appointmentData.source || 'manual' }])
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

