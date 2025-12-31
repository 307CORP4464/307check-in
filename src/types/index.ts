export interface CheckIn {
  id: string;
  reference_number: string;
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
  | 'checked in' 
  | 'completed' 

export interface CheckInFormData {
  reference_number: string;
  carrier_name: string;
  trailer_number: string;
  destination_city: string;
  destination_state: string;
  driver_name: string;
  driver_phone: string;
}
