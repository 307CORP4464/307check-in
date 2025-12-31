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
    return `(${cleaned.slice(0, 3)})${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  return phone;
};

const formatAppointmentTime = (appointmentTime: string | null | undefined): string => {
  if (!appointmentTime) return 'N/A';
  
  if (appointmentTime === 'work_in') return 'Work In';
  if (appointmentTime === 'paid_to_load') return 'Paid - No Appt';
  if (appointmentTime === 'paid_charge_customer') return 'Paid - Charge Customer';
  
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const hours = appointmentTime.substring(0, 2);
    const minutes = appointmentTime.substring(2, 4);
    return `${hours}:${minutes}`;
  }
  
  return appointmentTime;
};

const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'paid_to_load' || appointmentTime === 'paid_charge_customer' || appointmentTime === 'LTL') {
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
      checkIn.appointment_time === 'paid_charge_customer'
     checkIn.appointment_time === 'LTL' ) {
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
    if (statusLower === 'pending') return 'bg-yellow-500 text-white';
    if (statusLower === 'checked_in') return 'bg-purple-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const getStatusLabel = (status: string): string => {
    if (status === 'checked_in') return 'Checked In';
    if (status === 'checked_out') return 'Checked Out';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const totalCheckIns = checkIns.length;
  const activeCheckIns = checkIns.filter(c => c.status.toLowerCase() === 'checked_in' || c.status.toLowerCase() === 'pending').length;
  const completedCheckIns = checkIns.filter(c => c.status.toLowerCase() === 'completed' || c.status.toLowerCase() === 'checked_out').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Navigation */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Daily Log</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{userEmail}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-3 mb-4">
            <Link
              href="/dashboard"
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/tracking"
              className="px-6 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors"
            >
              Tracking
            </Link>
          </div>

          {/* Date Selector and Stats */}
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-4 text-sm">
              <span className="text-gray-600">Total: <strong>{totalCheckIns}</strong></span>
              <span className="text-gray-600">Active: <strong>{activeCheckIns}</strong></span>
              <span className="text-gray-600">Completed: <strong>{completedCheckIns}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver Info</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer Info</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference Number</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Time</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detention</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {checkIns.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-4 text-center text-gray-500">
                      No check-ins for this date
                    </td>
                  </tr>
                ) : (
                  checkIns.map((checkIn) => (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      {/* Type */}
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded font-bold ${
                          checkIn.load_type === 'inbound' 
                            ? 'bg-orange-400 text-white' 
                            : 'bg-blue-400 text-white'
                        }`}>
                          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                        </span>
                      </td>

                      {/* Driver Info */}
                      <td className="px-3 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{checkIn.carrier_name || 'N/A'}</span>
                          <span className="text-sm text-gray-700">{checkIn.driver_name || 'N/A'}</span>
                          <span className="text-sm text-gray-600">{formatPhoneNumber(checkIn.driver_phone)}</span>
                        </div>
                      </td>

                      {/* Trailer Info */}
                      <td className="px-3 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{checkIn.trailer_number || 'N/A'}</span>
                          <span className="text-sm text-gray-600">{checkIn.trailer_length || 'N/A'}</span>
                        </div>
                      </td>

                      {/* Destination */}
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {checkIn.destination_city && checkIn.destination_state 
                          ? `${checkIn.destination_city}, ${checkIn.destination_state}`
                          : 'N/A'}
                      </td>

                      {/* Reference Number */}
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className="font-bold text-sm">{checkIn.reference_number || 'N/A'}</span>
                      </td>

                      {/* Appointment Time */}
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={
                          isOnTime(checkIn.check_in_time, checkIn.appointment_time)
                            ? 'bg-green-100 text-green-800 px-2 py-1 rounded font-semibold text-sm'
                            : 'text-sm text-gray-700'
                        }>
                          {formatAppointmentTime(checkIn.appointment_time)}
                        </span>
                      </td>

                      {/* Check In Time */}
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {formatTimeInIndianapolis(checkIn.check_in_time)}
                      </td>

                      {/* End Time */}
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {checkIn.end_time ? formatTimeInIndianapolis(checkIn.end_time) : '-'}
                      </td>

                      {/* Detention */}
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {calculateDetention(checkIn)}
                      </td>

                      {/* Notes */}
                      <td className="px-3 py-4 text-sm max-w-xs truncate">
                        {checkIn.notes || '-'}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(checkIn.status)}`}>
                          {getStatusLabel(checkIn.status)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(checkIn)}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleStatusChange(checkIn)}
                            className="text-green-600 hover:text-green-900 font-medium"
                          >
                            Status
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
          checkIn={selectedForEdit}
          onClose={() => setSelectedForEdit(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
