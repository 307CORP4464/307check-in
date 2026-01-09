// src/types/appointments.ts

export interface AppointmentInput {
  date: string;
  time: string;
  salesOrder: string;
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
  '0800','0900', '0930', '1000', '1030', '1100', '1230', '1300', '1330', '1400', '1430','1500', '1530', 'Work In'
] as const;


export type TimeSlot = typeof TIME_SLOTS[number];

