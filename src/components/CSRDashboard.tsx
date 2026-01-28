'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { differenceInMinutes } from 'date-fns';
import Link from 'next/link';
import AssignDockModal from './AssignDockModal';
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

// Add this function after formatAppointmentTime in CSRDashboard.tsx
const formatAppointmentDateTime = (appointmentDate: string | null | undefined, appointmentTime: string | null | undefined): string => {
  // Handle special appointment types first
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') return 'Work In';
  
  // If no appointment date, just show time or N/A
  if (!appointmentDate) {
    return appointmentTime ? formatAppointmentTime(appointmentTime) : 'N/A';
  }
  
  try {
    const date = new Date(appointmentDate);
    
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
      console.error('Invalid appointment date:', appointmentDate);
      return appointmentTime ? formatAppointmentTime(appointmentTime) : 'N/A';
    }
    
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
    
    const formattedDate = dateFormatter.format(date);
    
    // Format the time if available
    const formattedTime = formatAppointmentTime(appointmentTime);
    
    if (formattedTime && formattedTime !== 'N/A') {
      return `${formattedDate} at ${formattedTime}`;
    }
    
    return formattedDate;
  } catch (error) {
    console.error('Error formatting appointment date/time:', error, { appointmentDate, appointmentTime });
    return appointmentTime ? formatAppointmentTime(appointmentTime) : 'N/A';
  }
};


const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (!appointmentTime || 
      appointmentTime === 'work_in' || {
    return false;
  }

  try {
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
      
      return difference <= 15;
    }
  } catch (error) {
    console.error('Error in isOnTime:', error);
  }
  
  return false;
};

// Rest of your interfaces and component code continues here...


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
  appointment_date?: string | null;
  appointment_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  destination_city?: string;
  destination_state?: string;
  notes?: string;
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
}

export default function CSRDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [appointments, setAppointments] = useState<Map<string, Appointment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedForDock, setSelectedForDock] = useState<CheckIn | null>(null);
  const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      }
    };
    getUser();
  }, [supabase]);

  useEffect(() => {
    fetchCheckIns();
    fetchAppointments();
    
    const channel = supabase
      .channel('dashboard_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins' },
        () => {
          fetchCheckIns();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          fetchAppointments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const fetchAppointments = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .gte('appointment_date', startOfDay)
        .lte('appointment_date', endOfDay);

      if (error) throw error;
      
      const appointmentMap = new Map<string, Appointment>();
      data?.forEach(apt => {
        if (apt.sales_order) {
          appointmentMap.set(apt.sales_order, apt);
        }
        if (apt.delivery) {
          appointmentMap.set(apt.delivery, apt);
        }
      });
      setAppointments(appointmentMap);
    } catch (err) {
      console.error('Fetch appointments error:', err);
    }
  };

  const fetchCheckIns = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: checkInsData, error: checkInsError } = await supabase
        .from('check_ins')
        .select('*')
        .eq('status', 'pending')
        .order('check_in_time', { ascending: true });

      if (checkInsError) throw checkInsError;

      const referenceNumbers = checkInsData
        ?.map(ci => ci.reference_number)
        .filter(ref => ref && ref.trim() !== '') || [];

      let appointmentsMap = new Map();

      if (referenceNumbers.length > 0) {
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from('appointments')
          .select('sales_order, delivery, appointment_time')
          .or(`sales_order.in.(${referenceNumbers.join(',')}),delivery.in.(${referenceNumbers.join(',')})`);

        if (appointmentsError) {
          console.error('Error fetching appointments:', appointmentsError);
        } else if (appointmentsData) {
          appointmentsData.forEach(apt => {
            if (apt.sales_order) {
              appointmentsMap.set(apt.sales_order, apt.appointment_time);
            }
            if (apt.delivery) {
              appointmentsMap.set(apt.delivery, apt.appointment_time);
            }
          });
        }
      }

      const enrichedCheckIns = checkInsData?.map(checkIn => ({
        ...checkIn,
        appointment_time: appointmentsMap.get(checkIn.reference_number) || checkIn.appointment_time || null
      })) || [];

      setCheckIns(enrichedCheckIns);
    } catch (err) {
      console.error('Fetch error:', err);
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

  const handleAssignDock = (checkIn: CheckIn) => {
    setSelectedForDock(checkIn);
  };

  const handleDockAssignSuccess = () => {
    fetchCheckIns();
    setSelectedForDock(null);
  };

  const handleEdit = (checkIn: CheckIn) => {
    setSelectedForEdit(checkIn);
  };

  const handleEditSuccess = () => {
    fetchCheckIns();
    setSelectedForEdit(null);
  };

  const calculateWaitTime = (checkIn: CheckIn): string => {
    const start = new Date(checkIn.check_in_time);
    const now = new Date();
    const minutes = differenceInMinutes(now, start);
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getWaitTimeColor = (checkIn: CheckIn): string => {
    const start = new Date(checkIn.check_in_time);
    const now = new Date();
    const minutes = differenceInMinutes(now, start);
    
    if (minutes > 120) return 'text-red-600';
    if (minutes > 60) return 'text-orange-600';
    return 'text-gray-900';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
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

      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Pending Check-Ins</h2>
            <p className="text-sm text-gray-600 mt-1">
              {checkIns.length} driver{checkIns.length !== 1 ? 's' : ''} waiting
            </p>
          </div>

          {checkIns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No pending check-ins at this time
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver Info</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wait Time</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
<tbody className="bg-white divide-y divide-gray-200">
  {checkIns.map((checkIn) => (
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

      {/* ✅ CHECK-IN TIME - When form was submitted */}
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {formatTimeInIndianapolis(checkIn.check_in_time, true)}
      </td>

     {/* ✅ APPOINTMENT DATE & TIME - With conditional highlighting */}
<td className="px-4 py-3 whitespace-nowrap text-sm">
  {checkIn.appointment_time && isOnTime(checkIn.check_in_time, checkIn.appointment_time) ? (
    <>
      {/* Check if appointment is same day or future date */}
      {new Date(checkIn.appointment_time).toDateString() === new Date(checkIn.check_in_time).toDateString() ? (
        // Same day appointment - Green highlight
        <span className="bg-green-500 text-white px-2 py-1 rounded font-semibold">
          {new Date(checkIn.appointment_time).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
          {' at '}
          {formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}
        </span>
      ) : (
        // Future date appointment - Orange highlight
        <span className="bg-orange-500 text-white px-2 py-1 rounded font-semibold">
          {new Date(checkIn.appointment_time).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
          {' at '}
          {formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}
        </span>
      )}
    </>
  ) : (
    // Not on time or no appointment
    <span className="text-gray-600">
      {checkIn.appointment_time ? (
        <>
          {new Date(checkIn.appointment_time).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
          {' at '}
          {formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}
        </>
      ) : (
        'N/A'
      )}
    </span>
  )}
</td>


      {/* Reference Number */}
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
        {checkIn.reference_number || 'N/A'}
      </td>

      {/* Driver Info */}
      <td className="px-4 py-3 text-sm">
        <div>{checkIn.driver_name || 'N/A'}</div>
        <div className="text-gray-500 text-xs">{formatPhoneNumber(checkIn.driver_phone)}</div>
        <div className="text-gray-500 text-xs">{checkIn.carrier_name || 'N/A'}</div>
      </td>

      {/* Trailer */}
      <td className="px-4 py-3 text-sm">
        <div>{checkIn.trailer_number || 'N/A'}</div>
        <div className="text-gray-500 text-xs">{checkIn.trailer_length || 'N/A'}</div>
      </td>

      {/* Destination */}
      <td className="px-4 py-3 text-sm">
        {checkIn.destination_city && checkIn.destination_state
          ? `${checkIn.destination_city}, ${checkIn.destination_state}`
          : 'N/A'}
      </td>

      {/* Wait Time */}
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <span className={`font-semibold ${getWaitTimeColor(checkIn)}`}>
          {calculateWaitTime(checkIn)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => handleAssignDock(checkIn)}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors text-xs"
          >
            Assign Dock
          </button>
          <button
            onClick={() => handleEdit(checkIn)}
            className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 transition-colors text-xs"
          >
            Edit
          </button>
        </div>
      </td>
    </tr>
  ))}
</tbody>

              </table>
            </div>
          )}
        </div>
      </div>

      {selectedForDock && (
        <AssignDockModal isOpen={!!selectedForDock} checkIn={selectedForDock} onClose={() => setSelectedForDock(null)} onSuccess={handleDockAssignSuccess} />
      )}
      {selectedForEdit && (
        <EditCheckInModal checkIn={selectedForEdit} onClose={() => setSelectedForEdit(null)} onSuccess={handleEditSuccess} isOpen={!!selectedForEdit} />
      )}
    </div>
  );
}

