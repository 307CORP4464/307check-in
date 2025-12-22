export interface CheckIn {
  id: string;
  pickup_number: string;
  carrier_name: string;
  trailer_number: string;
  destination_city: string;
  destination_state: string;
  driver_name: string;
  driver_phone: string;
  status: CheckInStatus;
  dock_number?: string;
  appointment_time?: string;
  check_in_time: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type CheckInStatus = 
  | 'pending' 
  | 'assigned' 
  | 'loading' 
  | 'completed' 
  | 'departed';

export interface CheckInFormData {
  pickup_number: string;
  carrier_name: string;
  trailer_number: string;
  destination_city: string;
  destination_state: string;
  driver_name: string;
  driver_phone: string;
}

export interface ScheduledAppointment {
  id: string;
  pickup_number: string;
  scheduled_time: string;
  carrier_name?: string;
  notes?: string;
}
