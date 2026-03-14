'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';
import StatusChangeModal from './StatusChangeModal';
import EditCheckInModal from './EditCheckInModal';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string, includeDate: boolean = false): string => {
  try {
    if (!isoString || isoString === '' || isoString === 'null' || isoString === 'undefined') {
      console.error('Empty or invalid date string:', isoString);
      return 'No Check-in Time';
    }

    const date = new Date(isoString);
    
    if (isNaN(date.getTime()) || date.getTime() < 0) {
      console.error('Invalid date:', isoString);
      return 'Invalid Date';
    }

    if (date.getFullYear() < 2000) {
      console.error('Date too old, likely invalid:', isoString, date);
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    if (includeDate) {
      options.year = 'numeric';
      options.month = '2-digit';
      options.day = '2-digit';
    }
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(date);
  } catch (e) {
    console.error('Time formatting error:', e, isoString);
    return 'Error';
  }
};

const formatPhoneNumber = (phone: string | undefined): string => {
  if (!phone) return 'N/A';
  
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)})-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  return phone;
};

const formatAppointmentTime = (appointmentTime: string | null | undefined): string => {
  if (!appointmentTime) return 'N/A';
  
  if (appointmentTime === 'work_in') return 'Work In';
  
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const hours = appointmentTime.substring(0, 2);
    const minutes = appointmentTime.substring(2, 4);
    return `${hours}:${minutes}`;
  }
  
  return appointmentTime;
};

const formatAppointmentDateTime = (appointmentDate: string | null | undefined, appointmentTime: string | null | undefined): string => {
  // Handle Work In cases - show date if available
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
      return 'Work In';
    }
    
    try {
      let date: Date;
      if (appointmentDate.includes('/')) {
        const [month, day, year] = appointmentDate.split('/').map(Number);
        date = new Date(year, month - 1, day);
      } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = appointmentDate.split('-').map(Number);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(appointmentDate);
      }
      
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}, Work In`;
      }
    } catch (error) {
      console.error('Error formatting work in date:', error);
    }
    
    // Fallback if date is invalid
    return 'Work In';
  }
  
  // If no time at all, return N/A
  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return 'N/A';
  }
  
  try {
    let formattedDate = '';
    
    // Format the date if available
    if (appointmentDate && appointmentDate !== 'null' && appointmentDate !== 'undefined') {
      let date: Date;
      
      // Check if date is in MM/DD/YYYY format
      if (appointmentDate.includes('/')) {
        const [month, day, year] = appointmentDate.split('/').map(Number);
        date = new Date(year, month - 1, day);
      } 
      // Check if date is in YYYY-MM-DD format (ISO date only, no time)
      else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = appointmentDate.split('-').map(Number);
        // Create date in local timezone, not UTC
        date = new Date(year, month - 1, day);
      }
      // Otherwise try ISO format with time
      else {
        date = new Date(appointmentDate);
      }
      
      // Validate the date
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        
        formattedDate = `${month}/${day}/${year}`;
      }
    }
    
    // Format the time
    const formattedTime = formatAppointmentTime(appointmentTime);
    
    // If no date, just return time
    if (!formattedDate) {
      return formattedTime !== 'N/A' ? formattedTime : 'N/A';
    }
    
    // Combine date and time
    if (formattedDate && formattedTime && formattedTime !== 'N/A') {
      return `${formattedDate}, ${formattedTime}`;
    } else if (formattedDate) {
      return formattedDate;
    } else if (formattedTime && formattedTime !== 'N/A') {
      return formattedTime;
    }
    
    return 'N/A';
  } catch (error) {
    console.error('Error formatting appointment date/time:', error, { appointmentDate, appointmentTime });
    const formattedTime = formatAppointmentTime(appointmentTime);
    return formattedTime !== 'N/A' ? formattedTime : 'N/A';
  }
};

const getDateComponentsInIndianapolis = (isoString: string): { year: number, month: number, day: number, hour: number, minute: number } => {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '0'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0')
  };
};

const getAppointmentStatus = (
  checkInTime: string,
  appointmentTime: string | null | undefined,
  appointmentDate: string | null | undefined
): { color: 'green' | 'orange' | 'red' | 'yellow' | 'none'; message: string | null } => {

  // No appointment at all → red
  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return { color: 'red', message: null };
  }

  // LTL, Charge, or Paid → orange
  if (
    appointmentTime === 'LTL' ||
    appointmentTime === 'Charge Customer no appointment' ||
    appointmentTime === 'Paid no appointment'
  ) {
    return { color: 'orange', message: null };
  }

  // Work-in → yellow
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { color: 'yellow', message: null };
  }

  // Normalize: "08:00" → "0800"
  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) {
    return { color: 'red', message: null }; // Unrecognized format → red
  }

  try {
    const checkInComponents = getDateComponentsInIndianapolis(checkInTime);
    let checkInHour = checkInComponents.hour;
    if (checkInHour === 24) checkInHour = 0;

    const aptHour = parseInt(normalizedTime.substring(0, 2));
    const aptMinute = parseInt(normalizedTime.substring(2, 4));

    const checkInTotalMinutes = checkInHour * 60 + checkInComponents.minute;
    const aptTotalMinutes = aptHour * 60 + aptMinute;
    const diffMinutes = checkInTotalMinutes - aptTotalMinutes;

    // Checked in before or at appointment time → green
    if (diffMinutes <= 0) {
      return { color: 'green', message: null };
    }
    // Checked in after appointment time → yellow
    else {
      return { color: 'yellow', message: null };
    }

  } catch (error) {
    console.error('Error in getAppointmentStatus:', error);
    return { color: 'red', message: null };
  }
};

const parseReferenceNumbers = (referenceNumber: string | undefined): string[] => {
  if (!referenceNumber) return [];
  
  // Split by common delimiters: comma, semicolon, space, pipe
  return referenceNumber
    .split(/[,;\s|]+/)
    .map(ref => ref.trim())
    .filter(ref => ref.length > 0);
};

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  carrier_name?: string;
  trailer_number?: string;
  trailer_length?: string;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  appointment_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  notes?: string;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  carrier?: string | null;
  mode?: string | null;
  requested_ship_date?: string | null;
  customer?: string;
}

interface Appointment {
  id: string;
  sales_order?: string;
  delivery?: string;
  appointment_time?: string;
  appointment_date?: string;
  carrier_name?: string;
  load_type?: string;
  status?: string;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  carrier?: string | null;
  mode?: string | null;
  requested_ship_date?: string | null;
}

const calculateDetention = (
  checkInTime: string,
  checkOutTime: string | null | undefined,
  appointmentTime: string | null | undefined,
  appointmentDate: string | null | undefined
): { hasDetention: boolean; detentionDuration: string | null } => {

  // Must have a check-out time
  if (!checkOutTime) return { hasDetention: false, detentionDuration: null };

  // Work-in = no detention
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { hasDetention: false, detentionDuration: null };
  }

  // Check-in must be on time (green status)
  const status = getAppointmentStatus(checkInTime, appointmentTime, appointmentDate);
  if (status.color !== 'green') {
    return { hasDetention: false, detentionDuration: null };
  }

  // Normalize appointment time → "0800"
  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) {
    return { hasDetention: false, detentionDuration: null };
  }

  if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
    return { hasDetention: false, detentionDuration: null };
  }

  try {
    // Parse appointment date
    let aptYear: number, aptMonth: number, aptDay: number;

    if (appointmentDate.includes('/')) {
      [aptMonth, aptDay, aptYear] = appointmentDate.split('/').map(Number);
    } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      const datePart = appointmentDate.substring(0, 10);
      [aptYear, aptMonth, aptDay] = datePart.split('-').map(Number);
    } else {
      return { hasDetention: false, detentionDuration: null };
    }

    const appointmentHour = parseInt(normalizedTime.substring(0, 2));
    const appointmentMinute = parseInt(normalizedTime.substring(2, 4));

    // Build the appointment time as a JS Date in Indianapolis timezone
    // We use UTC offset manually to avoid DST issues
    const aptLocalString = `${aptYear}-${String(aptMonth).padStart(2, '0')}-${String(aptDay).padStart(2, '0')}T${String(appointmentHour).padStart(2, '0')}:${String(appointmentMinute).padStart(2, '0')}:00`;
    const appointmentUTC = zonedTimeToUtc(aptLocalString, TIMEZONE);

    // Detention starts 2 hours after appointment time
    const detentionStartUTC = new Date(appointmentUTC.getTime() + 2 * 60 * 60 * 1000);

    // Parse check-out (already UTC ISO string from Supabase)
    const checkOutUTC = new Date(checkOutTime);

    if (isNaN(detentionStartUTC.getTime()) || isNaN(checkOutUTC.getTime())) {
      console.error('Invalid dates in calculateDetention', { detentionStartUTC, checkOutUTC });
      return { hasDetention: false, detentionDuration: null };
    }

    // How many minutes past the 2-hour mark?
    const diffMs = checkOutUTC.getTime() - detentionStartUTC.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    console.log('Detention debug:', {
      appointmentUTC: appointmentUTC.toISOString(),
      detentionStartUTC: detentionStartUTC.toISOString(),
      checkOutUTC: checkOutUTC.toISOString(),
      diffMinutes
    });

    // Only show detention if check-out is AFTER the 2-hour mark
    if (diffMinutes <= 0) {
      return { hasDetention: false, detentionDuration: null };
    }

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    const detentionDuration =
      hours > 0 && minutes > 0
        ? `${hours}h ${minutes}m`
        : hours > 0
        ? `${hours}h`
        : `${minutes}m`;

    return { hasDetention: true, detentionDuration };

  } catch (error) {
    console.error('Error calculating detention:', error);
    return { hasDetention: false, detentionDuration: null };
  }
};


export default function DailyLog() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showInProgressOnly, setShowInProgressOnly] = useState(false);
  const [appointments, setAppointments] = useState<Map<string, Appointment>>(new Map());


  
  const getCurrentDateInIndianapolis = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };
  
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateInIndianapolis());
  const [selectedForStatusChange, setSelectedForStatusChange] = useState<CheckIn | null>(null);
  const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);

type AppointmentInfo = {
  time: string | null;
  date: string | null;
  customer: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  carrier: string | null;
  mode: string | null;
  requested_ship_date: string | null;
};

  
const fetchCheckInsForDate = async () => {
  try {
    setLoading(true);

    const startOfDayIndy = zonedTimeToUtc(`${selectedDate} 00:00:00`, TIMEZONE);
    const endOfDayIndy = zonedTimeToUtc(`${selectedDate} 23:59:59`, TIMEZONE);

    // Step 1: Fetch check-ins for the selected date
    const { data: checkInsData, error: checkInsError } = await supabase
      .from('check_ins')
      .select('*')
      .gte('check_in_time', startOfDayIndy.toISOString())
      .lte('check_in_time', endOfDayIndy.toISOString())
      .neq('status', 'pending')
      .order('check_in_time', { ascending: false });

    if (checkInsError) throw checkInsError;

    // Step 2: Get ALL individual reference numbers
    const allReferenceNumbers = Array.from(new Set(
      (checkInsData || [])
        .flatMap(ci => parseReferenceNumbers(ci.reference_number))
        .filter(ref => ref.trim() !== '')
    ));

    console.log('All parsed reference numbers:', allReferenceNumbers);

    // ✅ Updated map type to include all fields we need
    let appointmentsMap = new Map<string, {
      time: string | null;
      date: string | null;
      customer: string | null;
      ship_to_city: string | null;
      ship_to_state: string | null;
      carrier: string | null;
      mode: string | null;
      requested_ship_date: string | null;
    }>();

    // Step 3: Fetch appointments in batches
    if (allReferenceNumbers.length > 0) {
      const BATCH_SIZE = 20;

      for (let i = 0; i < allReferenceNumbers.length; i += BATCH_SIZE) {
        const batch = allReferenceNumbers.slice(i, i + BATCH_SIZE);

        const orFilter = batch
          .flatMap(ref => [
            `sales_order.ilike.%${ref}%`,
            `delivery.ilike.%${ref}%`
          ])
          .join(',');

        console.log('Querying with filter:', orFilter);

        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from('appointments')
          .select(
            'sales_order, delivery, appointment_time, appointment_date, customer, requested_ship_date, carrier, mode, ship_to_city, ship_to_state'
          )
          .or(orFilter);

        console.log('Appointments returned:', appointmentsData);

        if (appointmentsError) {
          console.error('Appointments error:', appointmentsError);
          continue;
        }

        if (appointmentsData) {
          appointmentsData.forEach(apt => {
            // ✅ Now storing ALL fields — this was the root cause of N/A
            const appointmentInfo = {
              time: apt.appointment_time ?? null,
              date: apt.appointment_date ?? null,
              customer: apt.customer ?? null,
              ship_to_city: apt.ship_to_city ?? null,
              ship_to_state: apt.ship_to_state ?? null,
              carrier: apt.carrier ?? null,
              mode: apt.mode ?? null,
              requested_ship_date: apt.requested_ship_date ?? null,
            };

            // Map by sales_order refs
            if (apt.sales_order) {
              parseReferenceNumbers(apt.sales_order).forEach(ref => {
                appointmentsMap.set(ref.trim(), appointmentInfo);
              });
              appointmentsMap.set(apt.sales_order.trim(), appointmentInfo);
            }

            // Map by delivery refs
            if (apt.delivery) {
              parseReferenceNumbers(apt.delivery).forEach(ref => {
                appointmentsMap.set(ref.trim(), appointmentInfo);
              });
              appointmentsMap.set(apt.delivery.trim(), appointmentInfo);
            }
          });
        }
      }
    }

    console.log('Final appointments map:', Object.fromEntries(appointmentsMap));

    // Step 4: Enrich check-ins with ALL appointment data
const enrichedCheckIns = (checkInsData || []).map(checkIn => {
  const refs = parseReferenceNumbers(checkIn.reference_number);

  // ✅ Clean simple type — no more complex conditional type
  let appointmentInfo: AppointmentInfo | undefined = undefined;

  for (const ref of refs) {
    const trimmedRef = ref.trim();
    if (appointmentsMap.has(trimmedRef)) {
      appointmentInfo = appointmentsMap.get(trimmedRef);
      console.log(`Match found for ref "${trimmedRef}":`, appointmentInfo);
      break;
    }
  }

  if (!appointmentInfo) {
    console.log(`No appointment match for check-in ${checkIn.id}, refs:`, refs);
  }

  return {
    ...checkIn,
    appointment_time: appointmentInfo?.time ?? checkIn.appointment_time ?? null,
    appointment_date: appointmentInfo?.date ?? checkIn.appointment_date ?? null,
    customer: appointmentInfo?.customer ?? checkIn.customer ?? null,
    ship_to_city: appointmentInfo?.ship_to_city ?? checkIn.ship_to_city ?? null,
    ship_to_state: appointmentInfo?.ship_to_state ?? checkIn.ship_to_state ?? null,
    carrier: appointmentInfo?.carrier ?? checkIn.carrier ?? null,
    mode: appointmentInfo?.mode ?? checkIn.mode ?? null,
    requested_ship_date: appointmentInfo?.requested_ship_date ?? checkIn.requested_ship_date ?? null,
  };
});

console.log('Enriched check-ins sample:', enrichedCheckIns[0]);
setCheckIns(enrichedCheckIns);


  } catch (err) {
    console.error('fetchCheckInsForDate error:', err);
    setError(err instanceof Error ? err.message : 'An error occurred');
  } finally {
    setLoading(false);
  }
};


  
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      } else {
        router.push('/login');
      }
    };
    getUser();
  }, [supabase, router]);

  useEffect(() => {
    fetchCheckInsForDate();
  }, [selectedDate]);

  const filteredCheckIns = checkIns.filter((checkIn) => {
    if (!searchTerm.trim()) return true;
    
    const searchLower = searchTerm.toLowerCase().trim();
    const refNumber = checkIn.reference_number?.toLowerCase() || '';
    
    return refNumber.includes(searchLower);
  });

  const displayedCheckIns = showInProgressOnly
  ? filteredCheckIns.filter(checkIn => !checkIn.end_time)
  : filteredCheckIns;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleStatusChange = (checkIn: CheckIn) => {
    setSelectedForStatusChange(checkIn);
  };

  const handleStatusChangeSuccess = () => {
    fetchCheckInsForDate();
    setSelectedForStatusChange(null);
  };

  const handleEdit = (checkIn: CheckIn) => {
    setSelectedForEdit(checkIn);
  };

  const handleEditSuccess = () => {
    fetchCheckInsForDate();
    setSelectedForEdit(null);
  };

  const getStatusBadgeColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'completed' || statusLower === 'checked_out') return 'bg-gray-500 text-white';
    if (statusLower === 'unloaded'  || statusLower === 'checked_out') return 'bg-green-500 text-white';
    if (statusLower === 'rejected') return 'bg-red-500 text-white';
    if (statusLower === 'turned_away') return 'bg-orange-500 text-white';
    if (statusLower === 'driver_left') return 'bg-indigo-500 text-white';
    if (statusLower === 'pending') return 'bg-yellow-500 text-white';
    if (statusLower === 'checked_in') return 'bg-purple-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const getStatusLabel = (status: string): string => {
    if (status === 'checked_in') return 'Checked In';
    if (status === 'checked_out') return 'Checked Out';
    if (status === 'driver_left') return 'Driver Left';
    if (status === 'turned_away') return 'Turned Away';
    if (status === 'unloaded') return 'Unloaded';
    if (status === 'rejected') return 'Rejected';
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }


return (
  <div className="min-h-screen bg-gray-50">
    {/* Header */}
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Log</h1>
          </div>
          <div className="flex gap-3">
            <Link 
              href="/appointments" 
              className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              Appointments
            </Link>  

            <Link
              href="/dock-status"
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              Dock Status
            </Link>    

            <Link
              href="/dashboard"
              className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium"
            >
              Dashboard
            </Link>
            
            <Link
              href="/logs"
              className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium"
            >
              Daily Logs
            </Link>
            
            <Link
              href="/tracking"
              className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors font-medium"
            >
              Tracking
            </Link>
            
            <Link
              href="/check-in"
              className="bg-yellow-500 text-white px-6 py-2 rounded-lg hover:bg-yellow-600 transition-colors font-medium"
            >
              Check-In Form
            </Link>
          </div>
        </div>
      </div>
    </div>

          {/* Main Content */}
    <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Date Selector, Search & Counters */}
      <div className="mb-6 flex gap-4 items-end max-w-7xl mx-auto">
        <div>
          <label htmlFor="date-select" className="block text-sm font-medium text-gray-700 mb-2">
            Select Date
          </label>
          <input
            id="date-select"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div className="flex-1">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
            Search by Reference Number
          </label>
          <input
            id="search"
            type="text"
            placeholder="Enter reference number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Counters */}
        <div className="flex gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">
              Total Checked In
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {filteredCheckIns.length}
            </div>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <div className="text-xs font-medium text-green-600 uppercase tracking-wider mb-1">
              Total Complete
            </div>
            <div className="text-2xl font-bold text-green-900">
              {filteredCheckIns.filter(checkIn => checkIn.end_time).length}
            </div>
          </div>

          {/* In Progress Filter Button */}
          <button
            onClick={() => setShowInProgressOnly(!showInProgressOnly)}
            className={`rounded-lg px-4 py-2 transition-colors border text-left ${
              showInProgressOnly
                ? 'bg-yellow-400 border-yellow-500 ring-2 ring-yellow-300'
                : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
            }`}
          >
            <div className="text-xs font-medium text-yellow-700 uppercase tracking-wider mb-1">
              In Progress
            </div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-yellow-900">
                {filteredCheckIns.filter(checkIn => !checkIn.end_time).length}
              </div>
              {showInProgressOnly && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-700" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>


      {/* Table - Full Width */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Driver Info
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trailer Info
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Load Info
              </th>
               <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transport
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reference #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dock
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Check-In Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Appointment Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                End Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Detention
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notes
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          
<tbody className="bg-white divide-y divide-gray-200">
  {displayedCheckIns.map((checkIn) => (
    <tr key={checkIn.id} className="hover:bg-gray-50">
      {/* Type */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          checkIn.load_type === 'inbound' 
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-orange-100 text-orange-800'
        }`}>
          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
        </span>
      </td>

      {/* Driver Info */}
      <td className="px-4 py-4 text-sm">
        <div className="text-gray-900">{checkIn.carrier_name || 'N/A'}</div>
        <div className="text-gray-700">{checkIn.driver_name || 'N/A'}</div>
        <div className="text-gray-500">{formatPhoneNumber(checkIn.driver_phone)}</div>
      </td>

      {/* Trailer Info */}
      <td className="px-4 py-4 text-sm text-gray-900">
        <div>{checkIn.trailer_number || 'N/A'}</div>
        <div className="text-gray-500">{checkIn.trailer_length ? `${checkIn.trailer_length}'` : ''}</div>
      </td>

      {/* Load Info */}
<td className="px-4 py-3 text-sm">
  <div className="flex flex-col">
    <span className="font-semibold text-gray-900">
      {checkIn.customer || 'N/A'}
    </span>
      <span className="font-semibold text-gray-900">
      {checkIn.requested_ship_date || 'N/A'}
    </span>
    {/* Destination city and state below customer */}
    <span className="text-gray-500 text-xs mt-0.5">
      {checkIn.ship_to_city && checkIn.ship_to_state
        ? `${checkIn.ship_to_city}, ${checkIn.ship_to_state}`
        : checkIn.ship_to_city || checkIn.ship_to_state || 'N/A'}
    </span>
  </div>
</td>

            {/* Transport */}
<td className="px-4 py-3 text-sm">
  <div className="flex flex-col">
    <span className="font-semibold text-gray-900">
      {checkIn.carrier || 'N/A'}
    </span>
     <span className="font-semibold text-gray-900">
      {checkIn.mode || 'N/A'}
    </span>
  </div>
</td>

      {/* Reference # */}
      <td className="font-bold text-gray-900"> {checkIn.reference_number || 'N/A'}</td>

      {/* Dock */}
      <td className="px-4 py-4 text-sm text-gray-900">
        {checkIn.dock_number || 'N/A'}
      </td>

      {/* ✅ CHECK-IN TIME - When form was submitted */}
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {formatTimeInIndianapolis(checkIn.check_in_time, true)}
      </td>

 {/* Appointment Time */}
<td className="border px-4 py-3">
  {(() => {
    const status = getAppointmentStatus(
      checkIn.check_in_time,
      checkIn.appointment_time,
      checkIn.appointment_date
    );
    
    const bgColor = 
      status.color === 'green' ? 'bg-green-200' :
      status.color === 'red' ? 'bg-red-200' :
      status.color === 'yellow' ? 'bg-yellow-200' :
      status.color === 'orange' ? 'bg-orange-200' :
      'bg-gray-300';
    
    return (
      <div className={`inline-block px-2 py-1 rounded ${bgColor}`}>
        {formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}
        {status.message && (
          <div className="text-xs mt-1">{status.message}</div>
        )}
      </div>
    );
  })()}
</td>



      {/* End Time */}
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {checkIn.end_time ? formatTimeInIndianapolis(checkIn.end_time, true) : (
          <span className="text-yellow-600 font-medium">In Progress</span>
        )}
      </td>

       {/* Detention */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
  const { hasDetention, detentionDuration } = calculateDetention(
    checkIn.check_in_time,
    checkIn.end_time,
    checkIn.appointment_time,
    checkIn.appointment_date
  );

  return hasDetention ? (
    <span className="text-red-600 font-semibold">
      ⚠️ Detention: {detentionDuration}
    </span>
  ) : null;
})()}

                    </td>


      {/* Notes */}
      <td className="px-4 py-3 text-sm max-w-xs">
        <div className="truncate" title={checkIn.notes || ''}>
          {checkIn.notes || 'N/A'}
        </div>
      </td>

      {/* Status */}
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(checkIn.status)}`}>
                        {getStatusLabel(checkIn.status)}
                      </span>
                    </td>


      {/* Actions */}
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <button
          onClick={() => handleEdit(checkIn)}
          className="text-blue-600 hover:text-blue-900 font-medium"
        >
          Edit
                        </button>
                        <button
                          onClick={() => handleStatusChange(checkIn)}
                          className="text-green-600 hover:text-green-800 font-medium"
                        >
                          
                          Status
                        </button>

      </td>
    </tr>
  ))}
</tbody>
        </table>
      </div>
    </main>
        
  
      {/* Modals */}
      {selectedForStatusChange && (
        <StatusChangeModal
          checkIn={selectedForStatusChange}
          onClose={() => setSelectedForStatusChange(null)}
          onSuccess={handleStatusChangeSuccess}
        />
      )}

      {selectedForEdit && (
        <EditCheckInModal
          isOpen={true}
          checkIn={selectedForEdit}
          onClose={() => setSelectedForEdit(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
