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

// ─── Get today's date string in Indianapolis timezone (YYYY-MM-DD) ───
const getTodayInIndianapolis = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

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

const calculateWaitTime = (checkInTime: string): number => {
  const checkIn = new Date(checkInTime);
  const now = new Date();
  const diffMs = now.getTime() - checkIn.getTime();
  return diffMs / (1000 * 60);
};

const formatAppointmentTime = (appointmentTime: string | null | undefined): string => {
  if (!appointmentTime) return 'N/A';
  if (appointmentTime === 'work_in') return 'Work In';
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    return `${appointmentTime.substring(0, 2)}:${appointmentTime.substring(2, 4)}`;
  }
  return appointmentTime;
};

const formatAppointmentDateTime = (
  appointmentDate: string | null | undefined,
  appointmentTime: string | null | undefined
): string => {
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
      return 'Work In';
    }
    try {
      let date: Date;
      if (appointmentDate.includes('/')) {
        const [m, d, y] = appointmentDate.split('/').map(Number);
        date = new Date(y, m - 1, d);
      } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        const [y, m, d] = appointmentDate.substring(0, 10).split('-').map(Number);
        date = new Date(y, m - 1, d);
      } else {
        date = new Date(appointmentDate);
      }
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const dy = String(date.getDate()).padStart(2, '0');
        const yr = date.getFullYear();
        return `${mo}/${dy}/${yr} - Work In`;
      }
    } catch (error) {
      console.error('Error formatting work in date:', error);
    }
    return 'Work In';
  }

  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return 'N/A';
  }

  try {
    let formattedDate = '';
    if (appointmentDate && appointmentDate !== 'null' && appointmentDate !== 'undefined') {
      let date: Date;
      if (appointmentDate.includes('/')) {
        const [m, d, y] = appointmentDate.split('/').map(Number);
        date = new Date(y, m - 1, d);
      } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        const [y, m, d] = appointmentDate.substring(0, 10).split('-').map(Number);
        date = new Date(y, m - 1, d);
      } else {
        date = new Date(appointmentDate);
      }
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const dy = String(date.getDate()).padStart(2, '0');
        const yr = date.getFullYear();
        formattedDate = `${mo}/${dy}/${yr}`;
      }
    }
    const formattedTime = formatAppointmentTime(appointmentTime);
    if (!formattedDate) return formattedTime !== 'N/A' ? formattedTime : 'N/A';
    if (formattedTime && formattedTime !== 'N/A') return `${formattedDate}, ${formattedTime}`;
    if (formattedDate) return formattedDate;
    return 'N/A';
  } catch (error) {
    console.error('Error formatting appointment date/time:', error, { appointmentDate, appointmentTime });
    const formattedTime = formatAppointmentTime(appointmentTime);
    return formattedTime !== 'N/A' ? formattedTime : 'N/A';
  }
};

const getDateComponentsInIndianapolis = (
  isoString: string
): { year: number; month: number; day: number; hour: number; minute: number } => {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '0'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
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
    appointmentTime === 'Charge' ||
    appointmentTime === 'Paid'
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


// ─── Types ───
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
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  carrier?: string | null;
  customer?: string | null;
  mode?: string | null;
  requested_ship_date?: string | null;
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
  ship_to_city?: string;
  ship_to_state?: string;
  carrier?: string;
  customer?: string;
  mode?: string;
  requested_ship_date?: string;
}

export default function CSRDashboard() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [appointments, setAppointments] = useState<Map<string, Appointment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedForDock, setSelectedForDock] = useState<CheckIn | null>(null);
  const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);
  const [selectedForDeny, setSelectedForDeny] = useState<CheckIn | null>(null);
  const [showManualCheckIn, setShowManualCheckIn] = useState(false);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

 const fetchAllData = async () => {
  try {
    setLoading(true);
    setError(null);

    const today = getTodayInIndianapolis();

    // Fetch pending check-ins
    const { data: checkInsData, error: checkInsError } = await supabase
      .from('check_ins')
      .select('*')
      .eq('status', 'pending')
      .order('check_in_time', { ascending: true });

    if (checkInsError) throw checkInsError;

    const referenceNumbers = checkInsData
      ?.map((ci: any) => ci.reference_number)
      .filter((ref: any) => ref && ref.trim() !== '') || [];

    // ✅ Updated map to store ALL fields we need
    const appointmentsMap = new Map<string, {
      time: string | null;
      date: string | null;
      ship_to_city: string | null;
      ship_to_state: string | null;
      carrier: string | null;
      mode: string | null;
      customer: string | null;
      requested_ship_date: string | null;
    }>();

    if (referenceNumbers.length > 0) {
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select(
          'sales_order, delivery, appointment_time, appointment_date, carrier, mode, ship_to_city, ship_to_state, requested_ship_date, customer'
        )
        .or(
          `sales_order.in.(${referenceNumbers.join(',')}),delivery.in.(${referenceNumbers.join(',')})`
        );
        // ✅ REMOVED .eq('appointment_date', today) — this was filtering out
        //    appointments that don't match today's date, causing N/A for
        //    check-ins with appointments on other dates

      if (appointmentsError) {
        console.error('Error fetching appointments:', appointmentsError);
      } else if (appointmentsData) {
        appointmentsData.forEach((apt: any) => {
          // ✅ Now store ALL the fields we need
          const appointmentInfo = {
            time: apt.appointment_time ?? null,
            date: apt.appointment_date ?? today,
            ship_to_city: apt.ship_to_city ?? null,
            ship_to_state: apt.ship_to_state ?? null,
            carrier: apt.carrier ?? null,
            mode: apt.mode ?? null,
            customer: apt.customer ?? null,
            requested_ship_date: apt.requested_ship_date ?? null,
          };

          if (apt.sales_order) {
            appointmentsMap.set(String(apt.sales_order), appointmentInfo);
          }
          if (apt.delivery) {
            appointmentsMap.set(String(apt.delivery), appointmentInfo);
          }
        });
      }
    }

    // ✅ Merge ALL appointment fields into each check-in
    const processedCheckIns = checkInsData?.map((ci: any) => {
      const ref = ci.reference_number ? String(ci.reference_number) : null;
      const aptInfo = ref ? appointmentsMap.get(ref) : null;

      if (ref) {
        console.log(`CheckIn ref: ${ref} → aptInfo:`, aptInfo);
      }

      return {
        ...ci,
        appointment_time: aptInfo?.time ?? ci.appointment_time ?? null,
        appointment_date: aptInfo?.date ?? ci.appointment_date ?? null,
        // ✅ These were missing before — now properly merged
        ship_to_city: aptInfo?.ship_to_city ?? ci.ship_to_city ?? null,
        ship_to_state: aptInfo?.ship_to_state ?? ci.ship_to_state ?? null,
        carrier: aptInfo?.carrier ?? ci.carrier ?? null,
        mode: aptInfo?.mode ?? ci.mode ?? null,
        requested_ship_date: aptInfo?.requested_ship_date ?? ci.requested_ship_date ?? null,
      };
    }) || [];

    console.log('Processed check-ins sample:', processedCheckIns[0]);

    setCheckIns(processedCheckIns);

    // Update the appointments state map
    const fullAppointmentMap = new Map<string, Appointment>();
    appointmentsMap.forEach((value, key) => {
      fullAppointmentMap.set(key, {
        id: key,
        appointment_time: value.time ?? undefined,
        appointment_date: value.date ?? undefined,
        ship_to_city: value.ship_to_city ?? undefined,
        ship_to_state: value.ship_to_state ?? undefined,
        carrier: value.carrier ?? undefined,
        mode: value.mode ?? undefined,
        requested_ship_date: value.requested_ship_date ?? undefined,
      });
    });
    setAppointments(fullAppointmentMap);

  } catch (err) {
    console.error('Fetch error:', err);
    setError('Failed to load check-ins');
  } finally {
    setLoading(false);
  }
};

  // ─── Initial load + real-time subscription ───
  useEffect(() => {
    fetchAllData();

    const subscription = supabase
      .channel('check_ins_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins' },
        () => {
          fetchAllData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // ─── Handlers ───
  const handleDockAssignSuccess = () => {
    setSelectedForDock(null);
    fetchAllData(); // ✅ Now accessible
  };

  const handleEditSuccess = () => {
    setSelectedForEdit(null);
    fetchAllData(); // ✅ Now accessible
  };

  const handleDenySuccess = () => {
    setSelectedForDeny(null);
    fetchAllData(); // ✅ Now accessible
  };

  const handleManualCheckInSuccess = () => {
    setShowManualCheckIn(false);
    fetchAllData(); // ✅ Now accessible
  };

  const handleRefresh = () => {
    fetchAllData(); // ✅ Now accessible
  };


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
<div className="bg-white border-b shadow-sm">
  <div className="max-w-[1600px] mx-auto px-4 py-4">
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CSR Dashboard</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link 
          href="/appointments" 
          className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm"
        >
          Appointments
        </Link>  

        <Link
          href="/dock-status"
          className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm"
        >
          Dock Status
        </Link>    

        <Link
          href="/dashboard"
          className="bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium text-sm"
        >
          Dashboard
        </Link>
        
        <Link
          href="/logs"
          className="bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium text-sm"
        >
          Daily Logs
        </Link>
        
        <Link
          href="/tracking"
          className="bg-pink-500 text-white px-3 py-2 rounded-lg hover:bg-pink-600 transition-colors font-medium text-sm"
        >
          Tracking
        </Link>
        
        <Link
          href="/check-in"
          className="bg-yellow-500 text-white px-3 py-2 rounded-lg hover:bg-yellow-600 transition-colors font-medium text-sm"
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver Info</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Req. Date and Dest.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SCAC and Mode</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference #</th>
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
                               status.color === 'yellow' ? 'bg-yellow-100' :
                               status.color === 'red' ? 'bg-red-200' : '';
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

                       {/* Requested Ship Date and Destination */}
                      <td className="px-4 py-3 text-sm">
                        <div>{checkIn.customer || 'N/A'}</div>
                        <div>{checkIn.requested_ship_date || 'N/A'}</div>
                        <div> {checkIn.ship_to_city && checkIn.ship_to_state
                          ? `${checkIn.ship_to_city}, ${checkIn.ship_to_state}`
                          : 'N/A'}</div>  
                      </td>

                      {/* Transport */}
                      <td className="px-4 py-3 text-sm">
                        {checkIn.carrier && checkIn.mode
                          ? `${checkIn.carrier}, ${checkIn.mode}`
                          : 'N/A'}
                      </td>

                      {/* Reference Number */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        {checkIn.reference_number || 'N/A'}
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


             {/* ─── Modals ─────────────────────────────────────────── */}

      {selectedForDock && (
        <AssignDockModal
          isOpen={!!selectedForDock}
          checkIn={selectedForDock}
          onClose={() => setSelectedForDock(null)}
          onSuccess={handleDockAssignSuccess}
        />
      )}
      {selectedForEdit && (
        <EditCheckInModal
          checkIn={selectedForEdit}
          onClose={() => setSelectedForEdit(null)}
          onSuccess={handleEditSuccess}
          isOpen={!!selectedForEdit} 
        />
      )}
      {selectedForDeny && (
        <DenyCheckInModal
          checkIn={selectedForDeny}
          onClose={() => setSelectedForDeny(null)}
          onDeny={handleDenySuccess}
        />
      )}
      {showManualCheckIn && (
        <ManualCheckInModal
          isOpen={showManualCheckIn}
          onClose={() => setShowManualCheckIn(false)}
          onSuccess={handleManualCheckInSuccess}
        />
      )}

      </div>
    </div>
  );
}
