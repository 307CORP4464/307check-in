// src/types/appointments.ts

export interface AppointmentInput {
  appointment_date: string;
  scheduled_time: string;
  sales_order: string;
  delivery: string;
  carrier: string;
  notes: string;
  source?: 'excel' | 'manual' | 'upload'; // Add this if you need it
}

export interface Appointment extends AppointmentInput {
  id: number;
  created_at: string;
  updated_at?: string;
  // any other fields that come from the database
}

export const TIME_SLOTS = [
  'Work In', 'Paid - No Appt', 'Paid - Charge Customer', 'LTL',
  '08:00','09:00', '09:30', '10:00', '10:30', '11:00', '12:30', '13:00', '13:30', '14:00', '14:30','15:00', '15:30'
] as const;


export type TimeSlot = typeof TIME_SLOTS[number];

