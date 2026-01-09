export const TIME_SLOTS = [
  '0800', '0900', '0930', '1000', '1030', '1100',
  '1230', '1300', '1330', '1400', '1430',
  '1500', '1530', 'Work In'
] as const;

export type TimeSlot = typeof TIME_SLOTS[number];

// ✅ Complete Fixed Types File

export type AppointmentSource = 'manual' | 'excel' | 'upload';

export interface Appointment {
  id: number;
  scheduled_date: string;
  scheduled_time: string;
  sales_order: string | null;
  delivery: string | null;
  carrier?: string | null;
  notes?: string | null;
  source: AppointmentSource;  // ✅ Use the shared type
  created_at: string;
  updated_at: string;
}

export interface AppointmentInput {
  date: string;
  time: string;
  salesOrder?: string;
  delivery?: string;
  carrier?: string;
  notes?: string;
  source?: AppointmentSource;  // ✅ Use the shared type
}
