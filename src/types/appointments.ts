export const TIME_SLOTS = [
  '08:00', '09:00', '09:30', '10:00', '10:30', '11:00',
  '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', 'Work In'
] as const;

export type TimeSlot = typeof TIME_SLOTS[number];

// ✅ Complete Fixed Types Filed

export type AppointmentSource = 'excel' | 'manual';

export interface AppointmentInput {
  appointment_date: string;
  appointment_time: string;
  sales_order: string;
  delivery?: string;
  notes?: string;
  source?: AppointmentSource;  
}

export interface Appointment {
  id: number;
  appointment_date: string;
  appointment_time: string;
  sales_order?: string | null;
  delivery?: string | null;
  notes?: string | null;
  source: 'excel' | 'manual';
  created_at: string; 
  updated_at?: string;
}
