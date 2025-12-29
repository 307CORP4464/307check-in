'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';
import StatusChangeModal from './StatusChangeModal';

const TIMEZONE = 'America/Indiana/Indianapolis';

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

const formatAppointmentTime = (appointmentTime: string | null | undefined): string => {
  if (!appointmentTime) return 'N/A';
  
  if (appointmentTime === 'work_in') return 'Work In';
  if (appointmentTime === 'paid_to_load') return 'Paid to Load';
  if (appointmentTime === 'paid_charge_customer') return 'Paid - Charge Customer';
  
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const hours = appointmentTime.substring(0, 2);
    const minutes = appointmentTime.substring(2, 4);
    return `${hours}:${minutes}`;
  }
  
  return appointmentTime;
};

const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'paid_to_load' || appointmentTime === 'paid_charge_customer') {
    return true;
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
    return difference >= -15 && difference <= 15;
  }
  
  return true;
};

// Calculate detention time in minutes
const calculateDetention = (checkIn: CheckIn): string => {
  // Must have both start and end times
  if (!checkIn.start_time || !checkIn.end_time) {
    return '-';
  }

  const startTime = new Date(checkIn.start_time);
  const endTime = new Date(checkIn.end_time);
  
  // Calculate actual time spent (in minutes)
  const differenceMs = endTime.getTime() - startTime.getTime();
  const actualMinutes = Math.floor(differenceMs / (1000 * 60));
  
  // Standard load/unload time is 2 hours (120 minutes)
  const standardMinutes = 120;
  
  let detentionMinutes = 0;

  // If driver arrived on time and has appointment time
  if (checkIn.appointment_time && isOnTime(checkIn.check_in_time, checkIn.appointment_time)) {
    // Parse appointment time (format: "1430" = 14:30)
    const appointmentTime = checkIn.appointment_time;
    
    // Skip special appointment types
    if (appointmentTime === 'work_in' || 
        appointmentTime === 'paid_to_load' || 
        appointmentTime === 'paid_charge_customer') {
      detentionMinutes = Math.max(0, actualMinutes - standardMinutes);
    } 
    // Handle regular appointment time (HHMM format)
    else if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
      const appointmentHour = parseInt(appointmentTime.substring(0, 2));
      const appointmentMinute = parseInt(appointmentTime.substring(2, 4));
      
      // Create appointment date using the check-in date
      const checkInDate = new Date(checkIn.check_in_time);
      const appointmentDate = new Date(checkInDate);
      
      // Convert appointment time to Indianapolis timezone
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
      
      // Set appointment time in Indianapolis timezone
      appointmentDate.setFullYear(year, month, day);
      appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);
      
      // Calculate time from appointment to end time
      const timeSinceAppointmentMs = endTime.getTime() - appointmentDate.getTime();
      const minutesSinceAppointment = Math.floor(timeSinceAppointmentMs / (1000 * 60));
      
      // Detention is anything over 2 hours from appointment time
      detentionMinutes = Math.max(0, minutesSinceAppointment - standardMinutes);
    } else {
      // Unknown appointment format, fall back to start time
      detentionMinutes = Math.max(0, actualMinutes - standardMinutes);
    }
  } else {
    // Driver was late or no appointment - calculate from start_time
    detentionMinutes = Math.max(0, actualMinutes - standardMinutes);
  }
  
  if (detentionMinutes === 0) {
    return 'None';
  }
  
  const hours = Math.floor(detentionMinutes / 60);
  const minutes = detentionMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
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
  pickup_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
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
  }, [selectedDate, supabase]);

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

  const getStatusBadgeColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'completed') return 'bg-green-500 text-white';
    if (statusLower === 'pending') return 'bg-yellow-500 text-white';
    if (statusLower === 'checked_in') return 'bg-purple-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const exportToCSV = () => {
    const headers = [
      'Type',
      'Appointment Time',
      'Check-in Time (EST)',
      'Load End Time (EST)',
      'Pickup Number',
      'Carrier Name',
      'Driver Name',
      'Driver Phone',
      'Trailer Number',
      'Trailer Length',
      'Destination',
      'Dock Number',
      'Detention',
      'Start Time',
      'End Time',
      'Status',
      'Notes'
    ];

    const rows = checkIns.map(ci => [
      ci.load_type === 'inbound' ? 'I' : 'O',
      formatAppointmentTime(ci.appointment_time),
      formatTimeInIndianapolis(ci.check_in_time, true),
      ci.end_time ? formatTimeInIndianapolis(ci.end_time, true) : ci.check_out_time ? formatTimeInIndianapolis(ci.check_out_time, true) : '-',
      ci.pickup_number || '',
      ci.carrier_name || '',
      ci.driver_name || '',
      ci.driver_phone || '',
      ci.trailer_number || '',
      ci.trailer_length || '',
      ci.destination_city && ci.destination_state ? `${ci.destination_city}, ${ci.destination_state}` : '',
      ci.dock_number || '',
      calculateDetention(ci),
      ci.start_time ? formatTimeInIndianapolis(ci.start_time, true) : '',
      ci.end_time ? formatTimeInIndianapolis(ci.end_time, true) : ci.check_out_time ? formatTimeInIndianapolis(ci.check_out_time, true) : '',
      ci.status,
      ci.notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `check-ins-${selectedDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  const totalCheckIns = checkIns.length;
  const completedCheckIns = checkIns.filter(ci => {
    const statusLower = ci.status.toLowerCase();
    return statusLower !== 'checked_in' && statusLower !== 'pending';
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Check-in Log (EST/EDT)</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
              <p className="text-xs text-gray-500">Current time: {formatTimeInIndianapolis(new Date().toISOString())}</p>
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                CSR Dashboard
              </Link>
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Export to CSV
              </button>
              <Link
                href="/"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                New Check-in
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
          
          <div className="mt-4 flex gap-4">
            <div className="bg-blue-50 px-4 py-2 rounded-lg">
              <span className="text-sm text-gray-600">Total Check-ins: </span>
              <span className="font-semibold text-blue-700">{totalCheckIns}</span>
            </div>
            <div className="bg-green-50 px-4 py-2 rounded-lg">
              <span className="text-sm text-gray-600">Completed: </span>
              <span className="font-semibold text-green-700">{completedCheckIns}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appt Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Load End Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pickup #</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carrier / Driver</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer Info</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dock #</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detention</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {checkIns.map((checkIn) => {
                  const onTime = isOnTime(checkIn.check_in_time, checkIn.appointment_time);
                  return (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          checkIn.load_type === 'inbound' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <div className={`${onTime ? 'text-green-600 font-semibold' : 'text-gray-900'}`}>
                          {formatAppointmentTime(checkIn.appointment_time)}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatTimeInIndianapolis(checkIn.check_in_time)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.end_time 
                          ? formatTimeInIndianapolis(checkIn.end_time)
                          : checkIn.check_out_time 
                          ? formatTimeInIndianapolis(checkIn.check_out_time)
                          : '-'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {checkIn.pickup_number || '-'}
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900">
                        <div className="flex flex-col">
                          <span className="font-medium">{checkIn.carrier_name || '-'}</span>
                          <span className="text-gray-600">{checkIn.driver_name || '-'}</span>
                          <span className="text-gray-500 text-xs">{checkIn.driver_phone || '-'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900">
                        <div className="flex flex-col">
                          <span className="font-medium">{checkIn.trailer_number || '-'}</span>
                          <span className="text-gray-600 text-xs">{checkIn.trailer_length || '-'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.destination_city && checkIn.destination_state 
                          ? `${checkIn.destination_city}, ${checkIn.destination_state}`
                          : '-'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {checkIn.dock_number || '-'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {calculateDetention(checkIn)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusBadgeColor(checkIn.status)}`}>
                          {checkIn.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900 max-w-xs">
                        <div className="truncate" title={checkIn.notes || ''}>
                          {checkIn.notes || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleStatusChange(checkIn)}
                          className="text-green-600 hover:text-green-900 font-semibold"
                        >
                          Update
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {checkIns.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No check-ins found for {selectedDate}</p>
            </div>
          )}
        </div>
      </div>

      {selectedForStatusChange && (
        <StatusChangeModal
          checkIn={selectedForStatusChange}
          onClose={() => setSelectedForStatusChange(null)}
          onSuccess={handleStatusChangeSuccess}
        />
      )}
    </div>
  );
}
