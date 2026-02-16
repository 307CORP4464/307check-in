'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { differenceInMinutes } from 'date-fns';
import Link from 'next/link';
import AssignDockModal from './AssignDockModal';
import EditCheckInModal from './EditCheckInModal';
import DenyCheckInModal from './DenyCheckInModal';
import ManualCheckInModal from './ManualCheckInModal';

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
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') return 'Work In';
  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return 'N/A';
  }
  try {
    let formattedDate = '';
    if (appointmentDate && appointmentDate !== 'null' && appointmentDate !== 'undefined') {
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
        formattedDate = `${month}/${day}/${year}`;
      }
    }
    const formattedTime = formatAppointmentTime(appointmentTime);
    if (!formattedDate) {
      return formattedTime !== 'N/A' ? formattedTime : 'N/A';
    }
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
const getDayDifference = (checkInComponents: any, appointmentDate: Date): number => {
  const checkInDate = new Date(checkInComponents.year, checkInComponents.month - 1, checkInComponents.day);
  const aptDate = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());
  const diffTime = checkInDate.getTime() - aptDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

const getAppointmentStatus = (
  checkInTime: string, 
  appointmentTime: string | null | undefined,
  appointmentDate: string | null | undefined
): { color: 'green' | 'orange' | 'red' | 'none', message: string | null } => {
  
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { color: 'red', message: null };
  }

  if (!appointmentTime.match(/^\d{4}$/)) {
    return { color: 'none', message: null };
  }

  if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
    return { color: 'none', message: null };
  }

  try {
    const checkInComponents = getDateComponentsInIndianapolis(checkInTime);
    
    let appointmentDateObj: Date;
    if (appointmentDate.includes('/')) {
      const [month, day, year] = appointmentDate.split('/').map(Number);
      appointmentDateObj = new Date(year, month - 1, day);
    } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = appointmentDate.split('-').map(Number);
      appointmentDateObj = new Date(year, month - 1, day);
    } else {
      const tempDate = new Date(appointmentDate);
      appointmentDateObj = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());
    }

    if (isNaN(appointmentDateObj.getTime())) {
      return { color: 'none', message: null };
    }

    const dayDiff = getDayDifference(checkInComponents, appointmentDateObj);

    if (dayDiff < 0) {
      const daysEarly = Math.abs(dayDiff);
      return { 
        color: 'orange', 
        message: `${daysEarly} day${daysEarly > 1 ? 's' : ''} early` 
      };
    }

    if (dayDiff > 0) {
      return { 
        color: 'orange', 
        message: `${dayDiff} day${dayDiff > 1 ? 's' : ''} late` 
      };
    }

    const appointmentHour = parseInt(appointmentTime.substring(0, 2));
    const appointmentMinute = parseInt(appointmentTime.substring(2, 4));
    
    const appointmentTotalMinutes = appointmentHour * 60 + appointmentMinute;
    const checkInTotalMinutes = checkInComponents.hour * 60 + checkInComponents.minute;
    const minuteDifference = checkInTotalMinutes - appointmentTotalMinutes;

    if (minuteDifference <= 15) {
      return { color: 'green', message: null };
    }

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
  const [selectedForDeny, setSelectedForDeny] = useState<CheckIn | null>(null);
  const [showManualCheckIn, setShowManualCheckIn] = useState(false);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () => {
        fetchCheckIns();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchAppointments();
      })
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
        if (apt.sales_order) appointmentMap.set(apt.sales_order, apt);
        if (apt.delivery) appointmentMap.set(apt.delivery, apt);
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
        ?.map((ci: any) => ci.reference_number)
        .filter((ref: any) => ref && ref.trim() !== '') || [];
      
      let appointmentsMap = new Map();
      
      if (referenceNumbers.length > 0) {
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from('appointments')
          .select('sales_order, delivery, appointment_time, appointment_date')
          .or(`sales_order.in.(${referenceNumbers.join(',')}),delivery.in.(${referenceNumbers.join(',')})`);
        
        if (appointmentsError) {
          console.error('Error fetching appointments:', appointmentsError);
        } else if (appointmentsData) {
          appointmentsData.forEach((apt: any) => {
            const appointmentInfo = { time: apt.appointment_time, date: apt.appointment_date };
            if (apt.sales_order) appointmentsMap.set(apt.sales_order, appointmentInfo);
            if (apt.delivery) appointmentsMap.set(apt.delivery, appointmentInfo);
          });
        }
      }

      const enrichedCheckIns = checkInsData?.map((ci: any) => {
        const aptInfo = ci.reference_number ? appointmentsMap.get(ci.reference_number) : null;
        return {
          ...ci,
          appointment_time: ci.appointment_time || aptInfo?.time,
          appointment_date: ci.appointment_date || aptInfo?.date
        };
      }) || [];

      setCheckIns(enrichedCheckIns);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching check-ins:', err);
      setError(err.message);
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CSR Dashboard</h1>
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

      <div className="mb-4 flex justify-between items-center">
        <button
          onClick={() => setShowManualCheckIn(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Manual Check-In
        </button>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading check-ins...</p>
          </div>
        )}

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

                      {/* Check-in Time */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {formatTimeInIndianapolis(checkIn.check_in_time, true)}
                      </td>

                      {/* Appointment Date & Time */}
                      
<td className={`px-4 py-3 text-sm ${
  (() => {
    const status = getAppointmentStatus(
      checkIn.check_in_time, 
      checkIn.appointment_time,
      checkIn.appointment_date
    );
    return status.color === 'green' ? 'bg-green-100' :
           status.color === 'orange' ? 'bg-orange-100' :
           status.color === 'red' ? 'bg-red-100' : '';
  })()
}`}>
  <div>{formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}</div>
  {(() => {
    const status = getAppointmentStatus(
      checkIn.check_in_time, 
      checkIn.appointment_time,
      checkIn.appointment_date
    );
    return status.message ? (
      <div className="text-xs font-semibold mt-1 text-orange-800">
        {status.message}
      </div>
    ) : null;
  })()}
</td>

  );
})()}

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
                        <span className={`font-medium ${
                          calculateWaitTime(checkIn.check_in_time) > 60 ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {Math.floor(calculateWaitTime(checkIn.check_in_time))} min
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium space-x-2">
                        <button
                          onClick={() => setSelectedForEdit(checkIn)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setSelectedForDock(checkIn)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => setSelectedForDeny(checkIn)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Deny
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>


        {selectedForDock && (
        <AssignDockModal isOpen={!!selectedForDock} checkIn={selectedForDock} onClose={() => setSelectedForDock(null)} onSuccess={handleDockAssignSuccess} />
      )}
      {selectedForEdit && (
        <EditCheckInModal checkIn={selectedForEdit} onClose={() => setSelectedForEdit(null)} onSuccess={handleEditSuccess} isOpen={!!selectedForEdit} />
      )}

        {selectedForDeny && (
          <DenyCheckInModal
            checkIn={selectedForDeny}
            onClose={() => setSelectedForDeny(null)}
            onDeny={handleDenyComplete}

          />
        )}
        <ManualCheckInModal
          isOpen={showManualCheckIn}
          onClose={() => setShowManualCheckIn(false)}
          onSuccess={handleManualCheckInSuccess}
        />
      </div>
    </div>
  );
}
