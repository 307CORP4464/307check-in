'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';
import StatusChangeModal from './StatusChangeModal';
import EditCheckInModal from './EditCheckInModal';

const TIMEZONE = 'America/Indiana/Indianapolis';

// Helper function for date navigation
const adjustDate = (dateString: string, days: number): string => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');
  
  return `${newYear}-${newMonth}-${newDay}`;
};

const formatTimeInIndianapolis = (isoString: string, includeDate: boolean = false): string => {
  try {
    const utcDate = new Date(isoString);
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour12: false,
      ...(includeDate && {
        month: '2-digit',
        day: '2-digit',
      }),
      hour: '2-digit',
      minute: '2-digit',
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(utcDate);
  } catch (e) {
    console.error('Time formatting error:', e);
    return '-';
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
  if (appointmentTime === 'paid_to_load') return 'Paid - No Appt';
  if (appointmentTime === 'paid_charge_customer') return 'Paid - Charge Customer';
  if (appointmentTime === 'ltl') return 'LTL';
  
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const hours = appointmentTime.substring(0, 2);
    const minutes = appointmentTime.substring(2, 4);
    return `${hours}:${minutes}`;
  }
  
  return appointmentTime;
};

const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (!appointmentTime || 
      appointmentTime === 'work_in' || 
      appointmentTime === 'paid_to_load' || 
      appointmentTime === 'paid_charge_customer' ||
      appointmentTime === 'ltl') {
    return false;
  }

  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const appointmentHour = parseInt(appointmentTime.substring(0, 2));
    const appointmentMinute = parseInt(appointmentTime.substring(2, 4));
    
    const checkInDate = new Date(checkInTime);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    
    const timeString = formatter.format(checkInDate);
    const [checkInHour, checkInMinute] = timeString.split(':').map(Number);
    
    const appointmentTotalMinutes = appointmentHour * 60 + appointmentMinute;
    const checkInTotalMinutes = checkInHour * 60 + checkInMinute;
    
    const difference = checkInTotalMinutes - appointmentTotalMinutes;
    return difference <= 0;
  }
  
  return false;
};

const calculateDetention = (checkIn: CheckIn): string => {
  if (!checkIn.appointment_time || !checkIn.end_time) {
    return '-';
  }

  if (!isOnTime(checkIn.check_in_time, checkIn.appointment_time)) {
    return '-';
  }

  if (checkIn.appointment_time === 'work_in' || 
      checkIn.appointment_time === 'paid_to_load' || 
      checkIn.appointment_time === 'paid_charge_customer' ||
      checkIn.appointment_time === 'ltl') {
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

const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': 'Pending',
    'checked_in': 'Checked In',
    'unloaded': 'Unloaded',
    'completed': 'Completed',
    'checked_out': 'Checked Out',
    'rejected': 'Rejected',
    'turned_away': 'Turned Away',
    'driver_left': 'Driver Left'
  };
  return statusMap[status.toLowerCase()] || status;
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
  end_time?: string | null;
  start_time?: string | null;
  notes?: string;
  destination_city?: string;
  destination_state?: string;
}

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

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', startOfDayIndy.toISOString())
        .lte('check_in_time', endOfDayIndy.toISOString())
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      setCheckIns(data || []);
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

  // Calculate counters
  const totalCount = filteredCheckIns.length;
  const completedCount = filteredCheckIns.filter(checkIn => {
    const statusLower = checkIn.status.toLowerCase();
    return statusLower === 'completed' || 
           statusLower === 'checked_out' || 
           statusLower === 'rejected' || 
           statusLower === 'driver_left' || 
           statusLower === 'turned_away';
  }).length;

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
    if (statusLower === 'unloaded') return 'bg-green-500 text-white';
    if (statusLower === 'rejected') return 'bg-red-500 text-white';
    if (statusLower === 'turned_away') return 'bg-orange-500 text-white';
    if (statusLower === 'driver_left') return 'bg-indigo-500 text-white';
    if (statusLower === 'pending') return 'bg-yellow-500 text-white';
    if (statusLower === 'checked_in') return 'bg-blue-500 text-white';
    return 'bg-gray-500 text-white';
  };

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

    {/* Main Content Area */}
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Date picker, search, and stats - Combined in one row */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left side: Date and Search */}
          <div className="flex-1 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            {/* Date Selector with Arrows */}
            <div className="flex-shrink-0">
              <label htmlFor="date-picker" className="block text-sm font-medium text-gray-700 mb-1">
                Select Date
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedDate(adjustDate(selectedDate, -1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
                  title="Previous day"
                >
                  <svg 
                    className="w-5 h-5 text-gray-600" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M15 19l-7-7 7-7" 
                    />
                  </svg>
                </button>
                
                <input
                  id="date-picker"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                
                <button
                  onClick={() => setSelectedDate(adjustDate(selectedDate, 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
                  title="Next day"
                >
                  <svg 
                    className="w-5 h-5 text-gray-600" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M9 5l7 7-7 7" 
                    />
                  </svg>
                </button>
                
                <button
                  onClick={() => setSelectedDate(getCurrentDateInIndianapolis())}
                  className="ml-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm font-medium"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Search Input with Clear Button */}
            <div className="w-full sm:w-80">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Search by Reference Number
              </label>
              <div className="relative">
                <input
                  id="search"
                  type="text"
                  placeholder="Enter reference number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
                    title="Clear search"
                  >
                    <svg 
                      className="w-5 h-5 text-gray-400 hover:text-gray-600" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M6 18L18 6M6 6l12 12" 
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right side: Stats Cards (Side by side) */}
          <div className="flex flex-row gap-3">
            {/* Total Count Card - Compact */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-4 text-white min-w-[200px]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Total Checked In</p>
                  <p className="text-3xl font-bold mt-1">{totalCount}</p>
                </div>
                <div className="text-3xl opacity-20">
                  📋
                </div>
              </div>
            </div>

            {/* Completed Count Card - Compact */}
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow p-4 text-white min-w-[200px]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs font-medium uppercase tracking-wide">Total Completed</p>
                  <p className="text-3xl font-bold mt-1">{completedCount}</p>
                  <p className="text-green-100 text-xs mt-1">
                    {totalCount > 0 ? `${Math.round((completedCount / totalCount) * 100)}%` : 'N/A'}
                  </p>
                </div>
                <div className="text-3xl opacity-20">
                  ✓
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table - Updated with fixed column widths */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-xs table-fixed">
            <colgroup>
              <col style={{ width: '60px' }} /> {/* Type */}
              <col style={{ width: '80px' }} /> {/* Driver */}
              <col style={{ width: '80px' }} /> {/* Trailer */}
              <col style={{ width: 'auto' }} /> {/* Destination */}
              <col style={{ width: '150px' }} /> {/* Ref# - 15 digits visible */}
              <col style={{ width: 'auto' }} /> {/* Dock */}
              <col style={{ width: '80px' }} /> {/* Check In */}
              <col style={{ width: 'auto' }} /> {/* Check Out */}
              <col style={{ width: '80px' }} /> {/* Status */}
              <col style={{ width: '150px' }} /> {/* Notes - 15 digits visible */}
              <col style={{ width: 'auto' }} /> {/* Actions */}
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trailer
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Destination
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ref#
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dock
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">

                  Appt
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Check In
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  End
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Det.
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Notes
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Status
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : filteredCheckIns.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-4 text-center text-gray-500">
                      No check-ins found for this date
                    </td>
                  </tr>
                ) : (
                  filteredCheckIns.map((checkIn, index) => (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      {/* Type */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          checkIn.load_type === 'inbound' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                        </span>
                      </td>
                      
                      {/* Driver Info */}
                      <td className="px-2 py-2 text-xs">
                        <div className="max-w-[120px]">
                          <div className="font-medium text-gray-900 truncate" title={checkIn.driver_name || 'N/A'}>
                            {checkIn.driver_name || 'N/A'}
                          </div>
                          <div className="text-gray-500 truncate" title={formatPhoneNumber(checkIn.driver_phone)}>
                            {formatPhoneNumber(checkIn.driver_phone)}
                          </div>
                          <div className="text-gray-500 truncate" title={checkIn.carrier_name || 'N/A'}>
                            {checkIn.carrier_name || 'N/A'}
                          </div>
                        </div>
                      </td>
                      
                      {/* Trailer */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <div>
                          <div className="text-gray-900">{checkIn.trailer_number || 'N/A'}</div>
                          <div className="text-gray-500">{checkIn.trailer_length || 'N/A'}</div>
                        </div>
                      </td>
                      
                      {/* Destination */}
                      <td className="px-2 py-2 text-xs">
                        <div className="max-w-[100px] truncate" title={`${checkIn.destination_city || 'N/A'}, ${checkIn.destination_state || 'N/A'}`}>
                          {checkIn.destination_city ? (
                            <>{checkIn.destination_city}, {checkIn.destination_state}</>
                          ) : (
                            'N/A'
                          )}
                        </div>
                      </td>
                      
                      {/* Reference */}
                      <td className="px-2 py-2 text-xs">
                        <div className="max-w-[80px] truncate font-medium" title={checkIn.reference_number || 'N/A'}>
                          {checkIn.reference_number || 'N/A'}
                        </div>
                      </td>
                      
                      {/* Dock */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs font-medium">
                        {checkIn.dock_number || 'N/A'}
                      </td>
                      
                      {/* Appointment */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        {formatAppointmentTime(checkIn.appointment_time)}
                      </td>
                      
                      {/* Check In Time */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        {formatTimeInIndianapolis(checkIn.check_in_time)}
                      </td>
                      
                      {/* End Time */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        {checkIn.end_time ? formatTimeInIndianapolis(checkIn.end_time) : '-'}
                      </td>
                      
                      {/* Detention */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <span className={calculateDetention(checkIn) !== '-' ? 'text-red-600 font-semibold' : ''}>
                          {calculateDetention(checkIn)}
                        </span>
                      </td>
                      
                      {/* Notes */}
                      <td className="px-2 py-2 text-xs">
                        <div className="max-w-[100px] truncate" title={checkIn.notes || '-'}>
                          {checkIn.notes || '-'}
                        </div>
                      </td>
                      
                      {/* Status */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          checkIn.status.toLowerCase() === 'completed' || checkIn.status.toLowerCase() === 'checked_out'
                            ? 'bg-green-100 text-green-800'
                            : checkIn.status.toLowerCase() === 'rejected' || checkIn.status.toLowerCase() === 'turned_away' || checkIn.status.toLowerCase() === 'driver_left'
                            ? 'bg-red-100 text-red-800'
                            : checkIn.status.toLowerCase() === 'checked_in'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {getStatusLabel(checkIn.status)}
                        </span>
                      </td>
                      
                      {/* Actions */}
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleStatusChange(checkIn)}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                            title="Change Status"
                          >
                            Status
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setSelectedForEdit(checkIn)}
                            className="text-green-600 hover:text-green-900 font-medium"
                            title="Edit"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
