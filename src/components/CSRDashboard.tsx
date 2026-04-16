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
import Header from './Header';
import { matchAppointmentToCheckIn } from '@/lib/appointmentMatcher';
import PaidReceiptModal from './PaidReceiptModal';

const TIMEZONE = 'America/Indiana/Indianapolis';

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
      return 'No Check-in Time';
    }
    const date = new Date(isoString);
    if (isNaN(date.getTime()) || date.getTime() < 0) return 'Invalid Date';
    if (date.getFullYear() < 2000) return 'Invalid Date';
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    if (includeDate) {
      options.year = 'numeric';
      options.month = '2-digit';
      options.day = '2-digit';
    }
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch {
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
  return (now.getTime() - checkIn.getTime()) / (1000 * 60);
};

const MANUAL_APPOINTMENT_TYPES = ['LTL', 'Paid', 'Charge', 'work_in'];

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
        return `${mo}/${dy}/${date.getFullYear()} - Work In`;
      }
    } catch {
      // fall through
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
        formattedDate = `${mo}/${dy}/${date.getFullYear()}`;
      }
    }
    const formattedTime = formatAppointmentTime(appointmentTime);
    if (!formattedDate) return formattedTime !== 'N/A' ? formattedTime : 'N/A';
    if (formattedTime && formattedTime !== 'N/A') return `${formattedDate}, ${formattedTime}`;
    if (formattedDate) return formattedDate;
    return 'N/A';
  } catch {
    return formatAppointmentTime(appointmentTime) !== 'N/A' ? formatAppointmentTime(appointmentTime) : 'N/A';
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
  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return { color: 'red', message: null };
  }
  if (appointmentTime === 'LTL' || appointmentTime === 'Charge' || appointmentTime === 'Paid') {
    return { color: 'orange', message: null };
  }
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { color: 'yellow', message: null };
  }
  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) return { color: 'red', message: null };

  try {
    const checkInComponents = getDateComponentsInIndianapolis(checkInTime);
    let checkInHour = checkInComponents.hour;
    if (checkInHour === 24) checkInHour = 0;
    const aptHour = parseInt(normalizedTime.substring(0, 2));
    const aptMinute = parseInt(normalizedTime.substring(2, 4));
    const diffMinutes = (checkInHour * 60 + checkInComponents.minute) - (aptHour * 60 + aptMinute);
    return diffMinutes <= 0 ? { color: 'green', message: null } : { color: 'yellow', message: null };
  } catch {
    return { color: 'red', message: null };
  }
};

// ─── Leading-zero normalization ───────────────────────────────────────────────

const stripLeadingZeros = (value: string): string =>
  /^\d+$/.test(value) ? value.replace(/^0+/, '') || '0' : value;

const parseReferenceNumbers = (referenceNumber: string | undefined): string[] => {
  if (!referenceNumber) return [];
  return referenceNumber.split(/[,;\s|]+/).map(ref => ref.trim()).filter(ref => ref.length > 0);
};

const expandRefsWithNormalized = (refs: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!seen.has(ref)) { result.push(ref); seen.add(ref); }
    const stripped = stripLeadingZeros(ref);
    if (stripped !== ref && !seen.has(stripped)) { result.push(stripped); seen.add(stripped); }
  }
  return result;
};

// ─── Types ───────────────────────────────────────────────────────────────────
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
  companion_reference?: string | null;
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
  has_duplicate_in_progress?: boolean;
  has_duplicate_checked_out?: boolean;
  has_duplicate_denied?: boolean;
}

export default function CSRDashboard() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedForDock, setSelectedForDock] = useState<CheckIn | null>(null);
  const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);
  const [selectedForDeny, setSelectedForDeny] = useState<CheckIn | null>(null);
  const [showManualCheckIn, setShowManualCheckIn] = useState(false);
  const [selectedForPaidReceipt, setSelectedForPaidReceipt] = useState<CheckIn | null>(null);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const today = getTodayInIndianapolis();

      const { data: checkInsData, error: checkInsError } = await supabase
        .from('check_ins')
        .select('*')
        .eq('status', 'pending')
        .order('check_in_time', { ascending: true });

      if (checkInsError) throw checkInsError;

      // ── Build normalized reference number list for querying ──────────────
      const rawReferenceNumbers = Array.from(new Set(
        (checkInsData || [])
          .flatMap((ci: any) => parseReferenceNumbers(ci.reference_number))
      ));
      const referenceNumbers = expandRefsWithNormalized(rawReferenceNumbers);

      // ── Query in-progress, checked-out, and denied using expanded refs ───
      const inProgressRefs = new Set<string>();
      const checkedOutRefs = new Set<string>();
      const deniedRefs = new Set<string>();

      if (referenceNumbers.length > 0) {
        const todayStart = `${today}T00:00:00.000Z`;
        const todayEnd = `${today}T23:59:59.999Z`;

        const { data: inProgressData } = await supabase
          .from('check_ins')
          .select('id, reference_number, start_time, end_time')
          .in('reference_number', referenceNumbers)
          .not('start_time', 'is', null)
          .is('end_time', null)
          .gte('check_in_time', todayStart)
          .lte('check_in_time', todayEnd);

        (inProgressData || []).forEach((ci: any) => {
          if (ci.reference_number) {
            expandRefsWithNormalized(parseReferenceNumbers(ci.reference_number))
              .forEach((ref: string) => inProgressRefs.add(ref));
          }
        });

        const { data: checkedOutData } = await supabase
          .from('check_ins')
          .select('id, reference_number, end_time')
          .in('reference_number', referenceNumbers)
          .not('end_time', 'is', null)
          .not('status', 'in', '("check_in_denial","denied","turned_away","driver_left","rejected")')
          .gte('check_in_time', todayStart)
          .lte('check_in_time', todayEnd);

        (checkedOutData || []).forEach((ci: any) => {
          if (ci.reference_number) {
            expandRefsWithNormalized(parseReferenceNumbers(ci.reference_number))
              .forEach((ref: string) => checkedOutRefs.add(ref));
          }
        });

        const { data: deniedData } = await supabase
          .from('check_ins')
          .select('id, reference_number, status')
          .in('reference_number', referenceNumbers)
          .in('status', ['check_in_denial', 'denied', 'turned_away'])
          .gte('check_in_time', todayStart)
          .lte('check_in_time', todayEnd);

        (deniedData || []).forEach((ci: any) => {
          if (ci.reference_number) {
            expandRefsWithNormalized(parseReferenceNumbers(ci.reference_number))
              .forEach((ref: string) => deniedRefs.add(ref));
          }
        });
      }

      // ── Fetch appointments using expanded refs ───────────────────────────
      let allTodayAppointments: any[] = [];

      if (referenceNumbers.length > 0) {
        const BATCH_SIZE = 20;
        for (let i = 0; i < referenceNumbers.length; i += BATCH_SIZE) {
          const batch = referenceNumbers.slice(i, i + BATCH_SIZE);
          const orFilter = batch
            .flatMap((ref: string) => [
              `sales_order.ilike.%${ref}%`,
              `delivery.ilike.%${ref}%`,
            ])
            .join(',');

          const { data: appointmentsData, error: appointmentsError } = await supabase
            .from('appointments')
            .select('sales_order, delivery, appointment_time, appointment_date, carrier, mode, ship_to_city, ship_to_state, requested_ship_date, customer')
            .eq('appointment_date', today)
            .or(orFilter);

          if (appointmentsError) {
            console.error('Error fetching appointments:', appointmentsError);
            continue;
          }
          if (appointmentsData) {
            allTodayAppointments = allTodayAppointments.concat(appointmentsData);
          }
        }

        const seen = new Set<string>();
        allTodayAppointments = allTodayAppointments.filter(apt => {
          const key = `${apt.sales_order ?? ''}||${apt.delivery ?? ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // ── Enrich each check-in with appointment data + companion reference ─
      const processedCheckIns = (checkInsData || []).map((ci: any) => {
        const refs = parseReferenceNumbers(ci.reference_number);
        const expandedRefs = expandRefsWithNormalized(refs);

        const aptInfo = matchAppointmentToCheckIn(expandedRefs, allTodayAppointments);

        // ── Derive companion reference from the matched appointment ────────
let companionReference: string | null = ci.companion_reference ?? null;
if (!companionReference) {
  // Find the raw appointment that matched this check-in
  const matchedApt = allTodayAppointments.find(apt => {
    const soMatch = apt.sales_order && expandedRefs.some((r: string) =>
      apt.sales_order.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(apt.sales_order.toLowerCase())
    );
    const delMatch = apt.delivery && expandedRefs.some((r: string) =>
      apt.delivery.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(apt.delivery.toLowerCase())
    );
    return soMatch || delMatch;
  });

  if (matchedApt?.sales_order && matchedApt?.delivery) {
    const primaryLower = (ci.reference_number || '').toLowerCase();
    const soLower = matchedApt.sales_order.toLowerCase();
    const delLower = matchedApt.delivery.toLowerCase();
    // Whichever one the driver didn't check in with becomes the companion
    if (primaryLower.includes(soLower) || soLower.includes(primaryLower)) {
      companionReference = matchedApt.delivery;
    } else {
      companionReference = matchedApt.sales_order;
    }
  }

  if (companionReference) {
    supabase
      .from('check_ins')
      .update({ companion_reference: companionReference })
      .eq('id', ci.id)
      .is('companion_reference', null)
      .then(() => {});
  }
}

        // Use all expanded refs when checking duplicate sets
        const hasDuplicateInProgress = expandedRefs.some((ref: string) => inProgressRefs.has(ref));
        const hasDuplicateCheckedOut = expandedRefs.some((ref: string) => checkedOutRefs.has(ref));
        const hasDuplicateDenied = expandedRefs.some((ref: string) => deniedRefs.has(ref));

        return {
          ...ci,
          companion_reference: companionReference,
          appointment_time: aptInfo?.time ??
            (MANUAL_APPOINTMENT_TYPES.includes(ci.appointment_time) ? ci.appointment_time : null),
          appointment_date: aptInfo?.date ??
            (MANUAL_APPOINTMENT_TYPES.includes(ci.appointment_time) ? ci.appointment_date : null),
          ship_to_city: aptInfo?.ship_to_city ?? ci.ship_to_city ?? null,
          ship_to_state: aptInfo?.ship_to_state ?? ci.ship_to_state ?? null,
          carrier: aptInfo?.carrier ?? ci.carrier ?? null,
          mode: aptInfo?.mode ?? ci.mode ?? null,
          requested_ship_date: aptInfo?.requested_ship_date ?? ci.requested_ship_date ?? null,
          has_duplicate_in_progress: hasDuplicateInProgress,
          has_duplicate_checked_out: hasDuplicateCheckedOut,
          has_duplicate_denied: hasDuplicateDenied,
        };
      });

      setCheckIns(processedCheckIns);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load check-ins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const subscription = supabase
      .channel('check_ins_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () => {
        fetchAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const handleDockAssignSuccess = () => {
    setSelectedForDock(null);
    fetchAllData();
  };

  const handleEditSuccess = () => {
    setSelectedForEdit(null);
    fetchAllData();
  };

  const handleDenySuccess = () => {
    setSelectedForDeny(null);
    fetchAllData();
  };

  const handleManualCheckInSuccess = () => {
    setShowManualCheckIn(false);
    fetchAllData();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="CSR Dashboard" />
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="mb-4 flex justify-between items-center">
          <button
            onClick={() => setShowManualCheckIn(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Manual Check-In
          </button>
        </div>

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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-In Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Req. Date and Dest.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SCAC and Mode</th>
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
                          checkIn.load_type === 'inbound' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                        </span>
                      </td>

                      {/* Driver Info */}
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-900">{checkIn.carrier_name || 'N/A'}</div>
                        <div className="text-gray-700">{checkIn.driver_name || 'N/A'}</div>
                        <div className="text-gray-500 text-xs">{formatPhoneNumber(checkIn.driver_phone)}</div>
                      </td>

                      {/* Trailer */}
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-900">{checkIn.trailer_number || 'N/A'}</div>
                        <div className="text-gray-500 text-xs">
                          {checkIn.trailer_length ? `${checkIn.trailer_length}'` : 'N/A'}
                        </div>
                      </td>

                      {/* Reference # — with companion reference + duplicate flags */}
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">
                        <div>{checkIn.reference_number || 'N/A'}</div>
                        {checkIn.companion_reference && (
                          <div className="text-xs font-normal text-gray-500 mt-0.5">
                            {checkIn.companion_reference}
                          </div>
                        )}
                        {checkIn.has_duplicate_in_progress && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                              <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <circle cx="8" cy="12" r="0.75" fill="currentColor"/>
                            </svg>
                            Already at dock
                          </span>
                        )}
                        {checkIn.has_duplicate_denied && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                              <line x1="5" y1="5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <line x1="11" y1="5" x2="5" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            Check-In Denied Previously
                          </span>
                        )}
                        {checkIn.has_duplicate_checked_out && !checkIn.has_duplicate_denied && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Already Checked Out
                          </span>
                        )}
                      </td>

                      {/* Appointment */}
                      <td className={`px-4 py-3 text-sm ${
                        (() => {
                          const status = getAppointmentStatus(checkIn.check_in_time, checkIn.appointment_time, checkIn.appointment_date);
                          return status.color === 'green'  ? 'bg-green-100'  :
                                 status.color === 'yellow' ? 'bg-yellow-100' :
                                 status.color === 'orange' ? 'bg-orange-100' :
                                 status.color === 'red'    ? 'bg-red-200'    : '';
                        })()
                      }`}>
                        <div>{formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}</div>
                        {(() => {
                          const status = getAppointmentStatus(checkIn.check_in_time, checkIn.appointment_time, checkIn.appointment_date);
                          return status.message ? (
                            <div className="text-xs font-semibold mt-1 text-orange-800">{status.message}</div>
                          ) : null;
                        })()}
                      </td>

                      {/* Check-In Time */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {formatTimeInIndianapolis(checkIn.check_in_time, true)}
                      </td>

                      {/* Req. Date and Dest. */}
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{checkIn.customer || 'N/A'}</span>
                          <span className="font-semibold text-gray-900">{checkIn.requested_ship_date || 'N/A'}</span>
                          <span className="text-gray-500 text-xs mt-0.5">
                            {checkIn.ship_to_city && checkIn.ship_to_state
                              ? `${checkIn.ship_to_city}, ${checkIn.ship_to_state}`
                              : checkIn.ship_to_city || checkIn.ship_to_state || 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* SCAC and Mode */}
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{checkIn.carrier || 'N/A'}</span>
                          <span className="font-semibold text-gray-900">{checkIn.mode || 'N/A'}</span>
                        </div>
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
                        <button onClick={() => setSelectedForEdit(checkIn)} className="text-blue-600 hover:text-blue-900">
                          Edit
                        </button>
                        <button onClick={() => setSelectedForDock(checkIn)} className="text-green-600 hover:text-green-900">
                          Assign
                        </button>
                        <button onClick={() => setSelectedForDeny(checkIn)} className="text-red-600 hover:text-red-900">
                          Deny
                        </button>
                        {checkIn.appointment_time === 'Paid' && (
  <button
    onClick={() => setSelectedForPaidReceipt(checkIn)}
    className="text-green-600 hover:text-green-800 font-medium text-left flex items-center gap-1"
  >
    💵 Paid Receipt
  </button>
)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
        {selectedForPaidReceipt && (
  <PaidReceiptModal
    isOpen={!!selectedForPaidReceipt}
    checkIn={selectedForPaidReceipt}
    onClose={() => setSelectedForPaidReceipt(null)}
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
