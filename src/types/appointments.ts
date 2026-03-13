export const TIME_SLOTS = [
  '08:00', '09:00', '09:30', '10:00', '10:30', '11:00',
  '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', 'Work In'
] as const;

export type TimeSlot = typeof TIME_SLOTS[number];

// ✅ Complete Fixed Types Filed

export type AppointmentSource = 'excel' | 'manual';

export interface AppointmentInput {
  id: string;
  appointment_date: string;
  appointment_time: string;
  customer?: string;
  sales_order?: string;
  delivery?: string;
  carrier?: string;
  mode?: string;
  requested_ship_date?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  source?: string;
  notes?: string;
}

export interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  customer?: string;
  sales_order?: string;
  delivery?: string;
  carrier?: string;
  mode?: string;
  requested_ship_date?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string;
}
