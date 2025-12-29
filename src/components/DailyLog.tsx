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

// Phone formatting function
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

const calculateDetention = (checkIn: CheckIn): string => {
  if (!checkIn.start_time || !checkIn.end_time) {
    return '-';
  }

  const startTime = new Date(checkIn.start_time);
  const endTime = new Date(checkIn.end_time);
  
  const differenceMs = endTime.getTime() - startTime.getTime();
  const actualMinutes = Math.floor(differenceMs / (1000 * 60));
  
  const standardMinutes = 120;
  
  let detentionMinutes = 0;

  if (checkIn.appointment_time && isOnTime(checkIn.check_in_time, checkIn.appointment_time)) {
    const appointmentTime = checkIn.appointment_time;
    
    if (appointmentTime === 'work_in' || 
        appointmentTime === 'paid_to_load' || 
        appointmentTime === 'paid_charge_customer') {
      detentionMinutes = Math.max(0, actualMinutes - standardMinutes);
    } 
    else if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
      const appointmentHour = parseInt(appointmentTime.substring(0, 2));
      const appointmentMinute = parseInt(appointmentTime.substring(2, 4));
      
      const checkInDate = new Date(checkIn.check_in_time);
      const appointmentDate = new Date(checkInDate);
      
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
      
      appointmentDate.setFullYear(year, month, day);
      appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);
      
      const timeSinceAppointmentMs = endTime.getTime() - appointmentDate.getTime();
      const minutesSinceAppointment = Math.floor(timeSinceAppointmentMs / (1000 * 60));
      
      detentionMinutes = Math.max(0, minutesSinceAppointment - standardMinutes);
    } else {
      detentionMinutes = Math.max(0, actualMinutes - standardMinutes);
    }
  } else {
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

  const getStatusLabel = (status: string): string => {
    if (status === 'checked_in') return 'Checked In';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Activity Log</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Select Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={getCurrentDateInIndianapolis()}
              className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="ml-auto text-sm text-gray-600">
              Total Check-ins: <span className="font-bold text-gray-900">{checkIns.length}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold">Check-Ins for {selectedDate}</h2>
          </div>
          
          {checkIns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-6xl mb-4">📋</div>
              <p className="text-xl">No check-ins for this date</p>
              <p className="text-sm mt-2">Select a different date to view check-ins</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appt Time</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">On Time?</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pickup #</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver Info</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dock</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Time</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Time</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detention</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-out</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {checkIns.map((ci) => {
                    const onTime = isOnTime(ci.check_in_time, ci.appointment_time);
                    const detention = calculateDetention(ci);
                    
                    return (
                      <tr key={ci.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            ci.load_type === 'inbound' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {ci.load_type === 'inbound' ? 'I' : 'O'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(ci.status)}`}>
                            {getStatusLabel(ci.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatTimeInIndianapolis(ci.check_in_time)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatAppointmentTime(ci.appointment_time)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            onTime ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {onTime ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ci.pickup_number || 'N/A'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          <div className="text-gray-900 font-medium">{ci.driver_name || 'N/A'}</div>
                          <div className="text-gray-500">{formatPhoneNumber(ci.driver_phone)}</div>
                          <div className="text-gray-500 text-xs">{ci.carrier_name || 'N/A'}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          <div className="text-gray-900">{ci.trailer_number || 'N/A'}</div>
                          <div className="text-gray-500 text-xs">{ci.trailer_length || 'N/A'}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ci.destination_city && ci.destination_state 
                            ? `${ci.destination_city}, ${ci.destination_state}`
                            : 'N/A'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ci.dock_number || '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ci.start_time ? formatTimeInIndianapolis(ci.start_time) : '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ci.end_time ? formatTimeInIndianapolis(ci.end_time) : '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm">
                          <span className={`font-semibold ${detention !== '-' && detention !== 'None' ? 'text-red-600' : 'text-green-600'}`}>
                            {detention}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {ci.check_out_time ? formatTimeInIndianapolis(ci.check_out_time) : '-'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900 max-w-xs truncate">
                          {ci.notes || '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center text-sm">
                          {ci.status !== 'completed' && (
                            <button
                              onClick={() => handleStatusChange(ci)}
                              className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors text-xs font-medium"
                            >
                              Update
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

