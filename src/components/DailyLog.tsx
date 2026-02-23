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
        return `Work In - ${month}/${day}/${year}`;
      }
    } catch (error) {
      console.error('Error formatting work in date:', error);
    }
    
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
        // Format the date to MM/DD/YYYY
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
): { color: 'green' | 'orange' | 'red' | 'none', message: string | null } => {
  
  // No appointment time or work-in = red
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { color: 'red', message: null };
  }

  // Normalize: "08:00" → "0800", "0800" stays "0800"
  const normalizedTime = appointmentTime.replace(/:/g, '').trim();

  // Must be exactly 4 digits after normalization
  if (!normalizedTime.match(/^\d{4}$/)) {
    return { color: 'none', message: null };
  }

  if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
    return { color: 'none', message: null };
  }

  try {
    const checkInComponents = getDateComponentsInIndianapolis(checkInTime);

    // Fix: hour12:false can return 24 for midnight
    let checkInHour = checkInComponents.hour;
    if (checkInHour === 24) checkInHour = 0;

    // Parse appointment date
    let aptYear: number, aptMonth: number, aptDay: number;

    if (appointmentDate.includes('/')) {
      [aptMonth, aptDay, aptYear] = appointmentDate.split('/').map(Number);
    } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Handles "2026-02-17" and "2026-02-17T00:00:00"
      const datePart = appointmentDate.substring(0, 10);
      [aptYear, aptMonth, aptDay] = datePart.split('-').map(Number);
    } else {
      return { color: 'none', message: null };
    }

    // Day comparison
    const checkInDateObj = new Date(checkInComponents.year, checkInComponents.month - 1, checkInComponents.day);
    const aptDateObj = new Date(aptYear, aptMonth - 1, aptDay);
    const diffTime = checkInDateObj.getTime() - aptDateObj.getTime();
    const dayDiff = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // Different day - early
    if (dayDiff < 0) {
      const daysEarly = Math.abs(dayDiff);
      return { 
        color: 'orange', 
        message: `${daysEarly} day${daysEarly > 1 ? 's' : ''} early` 
      };
    }

    // Different day - late
    if (dayDiff > 0) {
      return { 
        color: 'orange', 
        message: `${dayDiff} day${dayDiff > 1 ? 's' : ''} late` 
      };
    }

    // ─── SAME DAY ───────────────────────────────────────────
    const appointmentHour = parseInt(normalizedTime.substring(0, 2));
    const appointmentMinute = parseInt(normalizedTime.substring(2, 4));

    const appointmentTotalMinutes = appointmentHour * 60 + appointmentMinute;
    const checkInTotalMinutes = checkInHour * 60 + checkInComponents.minute;
    const minuteDifference = checkInTotalMinutes - appointmentTotalMinutes;

    // Early or within 10 min after appointment = GREEN
    if (minuteDifference <= 10) {
      return { color: 'green', message: null };
    }

    // More than 15 min late = RED
    return { color: 'red', message: null };

  } catch (error) {
    console.error('Error in getAppointmentStatus:', error);
    return { color: 'none', message: null };
  }
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
  destination_city?: string;
  destination_state?: string;
}

const calculateDetention = (checkIn: CheckIn): string => {
  if (!checkIn.appointment_time || !checkIn.end_time) {
    return '-';
  }

  const status = getAppointmentStatus(checkIn.check_in_time, checkIn.appointment_time, checkIn.appointment_date);
  if (status.color !== 'green') {
    return '-';
  }

  if (checkIn.appointment_time === 'work_in') {
    return '-';
  }

  const endTime = new Date(checkIn.end_time);
  const standardMinutes = 120;
  let detentionMinutes = 0;

  if (checkIn.appointment_time.length === 4 && /^\d{4}$/.test(checkIn.appointment_time)) {
    const appointmentHour = parseInt(checkIn.appointment_time.substring(0, 2));
    const appointmentMinute = parseInt(checkIn.appointment_time.substring(2, 4));
    
    const checkInDate = new Date(checkIn.check_in_time);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    const parts = formatter.formatToParts(checkInDate);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    
    const appointmentDate = new Date(checkInDate);
    appointmentDate.setFullYear(year, month, day);
    appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);
    
    const timeSinceAppointmentMs = endTime.getTime() - appointmentDate.getTime();
    const minutesSinceAppointment = Math.floor(timeSinceAppointmentMs / (1000 * 60));
    
    detentionMinutes = Math.max(0, minutesSinceAppointment - standardMinutes);
  }
  
  if (detentionMinutes === 0) {
    return '-';
  }
  
  return `${detentionMinutes} min`;
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

    // Step 2: Get reference numbers to look up appointments
    const referenceNumbers = checkInsData
      ?.map(ci => ci.reference_number)
      .filter(ref => ref && ref.trim() !== '') || [];

    let appointmentsMap = new Map();

    // Step 3: Fetch appointment data from appointments table
    if (referenceNumbers.length > 0) {
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select('sales_order, delivery, appointment_time, appointment_date')
        .or(`sales_order.in.(${referenceNumbers.join(',')}),delivery.in.(${referenceNumbers.join(',')})`);

      if (appointmentsError) {
        console.error('Error fetching appointments:', appointmentsError);
      } else if (appointmentsData) {
        appointmentsData.forEach(apt => {
          const appointmentInfo = {
            time: apt.appointment_time,
            date: apt.appointment_date
          };
          if (apt.sales_order) {
            appointmentsMap.set(apt.sales_order, appointmentInfo);
          }
          if (apt.delivery) {
            appointmentsMap.set(apt.delivery, appointmentInfo);
          }
        });
      }
    }

    // Step 4: Enrich check-ins with appointment data
    const enrichedCheckIns = checkInsData?.map(checkIn => {
      const appointmentInfo = appointmentsMap.get(checkIn.reference_number);
      return {
        ...checkIn,
        appointment_time: appointmentInfo?.time || checkIn.appointment_time || null,
        appointment_date: appointmentInfo?.date || checkIn.appointment_date || null
      };
    }) || [];

    // DEBUG - Log the first record to see enriched data
    if (enrichedCheckIns.length > 0) {
      console.log('📊 First enriched check-in record:', enrichedCheckIns[0]);
      console.log('📅 appointment_date field:', enrichedCheckIns[0].appointment_date);
      console.log('⏰ appointment_time field:', enrichedCheckIns[0].appointment_time);
    }
    
    setCheckIns(enrichedCheckIns);
  } catch (err) {
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
            {userEmail && (
              <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
            )}
            <p className="text-xs text-gray-500">
              Current time: {formatTimeInIndianapolis(new Date().toISOString())}
            </p>
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
        </div>
      </div>

      {/* Table - Full Width */}
      <div className="bg-white rounded-lg shadow">
        <table className="w-full divide-y divide-gray-200">
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
                Destination
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
  {filteredCheckIns.map((checkIn) => (
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

      {/* Destination */}
      <td className="px-4 py-4 text-sm text-gray-900">
          {checkIn.destination_city && checkIn.destination_state
           ? `${checkIn.destination_city}, ${checkIn.destination_state}`
           : 'N/A'}
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

  {/* In your table rendering code, find the appointment time cell and update it to: */}
<td className="border px-4 py-2">
  {(() => {
    const status = getAppointmentStatus(
      checkIn.check_in_time,
      checkIn.appointment_time,
      checkIn.appointment_date
    );
    
    const bgColor = 
      status.color === 'green' ? 'bg-green-200' :
      status.color === 'red' ? 'bg-red-200' :
      status.color === 'orange' ? 'bg-orange-200' :
      '';
    
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
                      {calculateDetention(checkIn)}
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
