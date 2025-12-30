'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';
import StatusChangeModal from './StatusChangeModal';
// Add import at the top
import EditCheckInModal from './EditCheckInModal';

// Add state for edit modal after other state declarations
const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);

// Add handler function
const handleEdit = (checkIn: CheckIn) => {
  setSelectedForEdit(checkIn);
};

const handleEditSuccess = () => {
  fetchCheckInsForDate();
  setSelectedForEdit(null);
};

// In your table, add an Edit button column. Update the table header to include:
<th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
  Actions
</th>

// And in the table row, add the buttons:
<td className="px-4 py-4 whitespace-nowrap text-center">
  <div className="flex gap-2 justify-center">
    <button
      onClick={() => handleEdit(checkIn)}
      className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 text-sm"
    >
      Edit
    </button>
    {checkIn.status !== 'completed' && (
      <button
        onClick={() => handleStatusChange(checkIn)}
        className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm"
      >
        Change Status
      </button>
    )}
  </div>
</td>

// Add the modal at the end before the closing div:
{selectedForEdit && (
  <EditCheckInModal
    checkIn={selectedForEdit}
    onClose={() => setSelectedForEdit(null)}
    onSuccess={handleEditSuccess}
  />
)}

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
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'paid_to_load' || appointmentTime === 'paid_charge_customer') {
    return false; // Don't highlight for these types
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
    return difference <= 0; // On time if checked in before or at appointment time
  }
  
  return false;
};

const getAppointmentTimeColor = (checkInTime: string, appointmentTime: string | null | undefined): string => {
  // Grey for special appointment types
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'paid_to_load' || appointmentTime === 'paid_charge_customer') {
    return 'text-gray-500';
  }
  
  // Green if on time, grey if missed
  return isOnTime(checkInTime, appointmentTime) ? 'text-green-600 font-semibold' : 'text-gray-500';
};

const calculateDetention = (checkIn: CheckIn): string => {
  // Check if we have the necessary data
  if (!checkIn.appointment_time || !checkIn.end_time) {
    return '-';
  }

  // Only calculate detention if driver was on time
  if (!isOnTime(checkIn.check_in_time, checkIn.appointment_time)) {
    return '-';
  }

  // Handle special appointment types - they don't get detention
  if (checkIn.appointment_time === 'work_in' || 
      checkIn.appointment_time === 'paid_to_load' || 
      checkIn.appointment_time === 'paid_charge_customer') {
    return '-';
  }

  const endTime = new Date(checkIn.end_time);
  const standardMinutes = 120;
  let detentionMinutes = 0;

  // Handle regular appointment times (4-digit format like "0800")
  if (checkIn.appointment_time.length === 4 && /^\d{4}$/.test(checkIn.appointment_time)) {
    const appointmentHour = parseInt(checkIn.appointment_time.substring(0, 2));
    const appointmentMinute = parseInt(checkIn.appointment_time.substring(2, 4));
    
    const checkInDate = new Date(checkIn.check_in_time);
    
    // Get the date parts in Indianapolis timezone
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
    
    // Create appointment date object
    const appointmentDate = new Date(checkInDate);
    appointmentDate.setFullYear(year, month, day);
    appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);
    
    // Calculate time since appointment
    const timeSinceAppointmentMs = endTime.getTime() - appointmentDate.getTime();
    const minutesSinceAppointment = Math.floor(timeSinceAppointmentMs / (1000 * 60));
    
    // Detention is any time over 2 hours (120 minutes) from appointment time
    detentionMinutes = Math.max(0, minutesSinceAppointment - standardMinutes);
  }
  
  // If no detention time or less than 2 hours total
  if (detentionMinutes === 0) {
    return '-';
  }
  
  // Only show minutes
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
    if (statusLower === 'completed') return 'bg-gray-500 text-white';
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
  <div className="min-h-screen bg-gray-50 p-6">
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-gray-800">Daily Log</h1>
        <div className="flex gap-3">
          <Link 
            href="/tracking"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition inline-block text-center"
          >
            View Tracking
          </Link>
          <Link 
            href="/dashboard"
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition inline-block text-center"
          >
            Back to Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Date Selector */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Date
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Check-Ins</div>
          <div className="text-2xl font-bold text-blue-600">{checkIns.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Inbound</div>
          <div className="text-2xl font-bold text-green-600">
            {checkIns.filter(c => c.load_type === 'inbound').length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Outbound</div>
          <div className="text-2xl font-bold text-purple-600">
            {checkIns.filter(c => c.load_type === 'outbound').length}
          </div>
        </div>
      </div>
    </div>
    
    {/* Rest of your component... */}

      <div className="max-w-[1800px] mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Select Date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="text-sm text-gray-600">
              Total Check-ins: <span className="font-semibold">{checkIns.length}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Appointment Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Check-In Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    End Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Detention
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Driver Info
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trailer Info
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dock Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {checkIns.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                      No check-ins found for this date
                    </td>
                  </tr>
                ) : (
                  checkIns.map((checkIn) => (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      {/* Type */}
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                          checkIn.load_type === 'inbound' 
                            ? 'bg-blue-500' 
                            : 'bg-orange-500'
                        }`}>
                          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                        </span>
                      </td>

                      {/* Appointment Time */}
                      <td className={`px-4 py-3 text-sm ${getAppointmentTimeColor(checkIn.check_in_time, checkIn.appointment_time)}`}>
                        {formatAppointmentTime(checkIn.appointment_time)}
                      </td>

                      {/* Check-In Time */}
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatTimeInIndianapolis(checkIn.check_in_time)}
                      </td>

                      {/* End Time */}
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {checkIn.end_time ? formatTimeInIndianapolis(checkIn.end_time) : '-'}
                      </td>

                      {/* Detention */}
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {calculateDetention(checkIn)}
                      </td>

                      {/* Reference Number */}
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        {checkIn.reference_number || 'N/A'}
                      </td>

                      {/* Destination */}
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {checkIn.destination_city && checkIn.destination_state
                          ? `${checkIn.destination_city}, ${checkIn.destination_state}`
                          : 'N/A'}
                      </td>

                      {/* Driver Info - Stacked */}
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="font-bold text-gray-900">
                            {checkIn.carrier_name || 'N/A'}
                          </div>
                          <div className="text-gray-700">
                            {checkIn.driver_name || 'N/A'}
                          </div>
                          <div className="text-gray-600">
                            {formatPhoneNumber(checkIn.driver_phone)}
                          </div>
                        </div>
                      </td>

                      {/* Trailer Info - Stacked */}
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="text-gray-900">
                            {checkIn.trailer_number || 'N/A'}
                          </div>
                          <div className="text-gray-600">
                            {checkIn.trailer_length || 'N/A'}
                          </div>
                        </div>
                      </td>

                      {/* Dock Number */}
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        {checkIn.dock_number || 'N/A'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(checkIn.status)}`}>
                          {getStatusLabel(checkIn.status)}
                        </span>
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                        <div className="truncate" title={checkIn.notes || ''}>
                          {checkIn.notes || '-'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleStatusChange(checkIn)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs font-medium"
                        >
                          Update
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
