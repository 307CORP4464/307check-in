'use client';

import { useState, useEffect } from 'react';
import { Appointment, AppointmentInput, TIME_SLOTS } from '@/types/appointments';
import {
  getAppointmentsByDate,
  createAppointment,
  updateAppointment,
  deleteAppointment
} from '@/lib/appointmentsService';
import AppointmentUpload from '@/components/AppointmentUpload';
import AppointmentModal from '@/components/AppointmentModal';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (timeString: string): string => {
  try {
    if (!timeString) return 'No Time';
    if (timeString.toLowerCase().includes('work in')) return 'Work In';
    const timePattern = /^(\d{1,2}):(\d{2})(:\d{2})?$/;
    const match = timeString.match(timePattern);
    if (match) return `${match[1]}:${match[2]}`;
    console.warn('Unexpected time format:', timeString);
    return timeString;
  } catch (e) {
    console.error('Time formatting error:', e, 'for value:', timeString);
    return timeString;
  }
};

const formatDateForDisplay = (dateString: string): string => {
  const [year, month, day] = dateString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIMEZONE
  });
};

const getCurrentTimeInIndianapolis = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.format(now);
};

const getStatusBadge = (status: string | null) => {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
        Not Checked In
      </span>
    );
  }

  const normalizedStatus = status.toLowerCase() === 'unloaded' ? 'checked_out' : status.toLowerCase();
  const statusStyles: Record<string, string> = {
    'checked_in': 'bg-purple-100 text-purple-800',
    'pending': 'bg-yellow-100 text-yellow-800',
    'rejected': 'bg-red-100 text-red-800',
    'completed': 'bg-gray-100 text-gray-800',
    'checked_out': 'bg-green-100 text-green-800',
    'driver_left': 'bg-indigo-100 text-indigo-800',
    'turned_away': 'bg-orange-100 text-orange-800',
  };
  const style = statusStyles[normalizedStatus] || 'bg-gray-100 text-gray-800';
  const displayStatus = normalizedStatus
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l: string) => l.toUpperCase());

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {displayStatus}
    </span>
  );
};

type StatusFilter = 'all' | 'not_checked_in' | 'checked_in' | 'pending' | 'checked_out' | 'work_in';

export default function AppointmentsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [checkInStatuses, setCheckInStatuses] = useState<Record<string, string>>({});
  const [existingAppointment, setExistingAppointment] = useState<Appointment | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const getDailyLogStatus = (appointment: Appointment): string | null => {
    const salesOrder = appointment.sales_order?.trim().toLowerCase();
    const delivery = appointment.delivery?.trim().toLowerCase();
    if (salesOrder && checkInStatuses[salesOrder]) return checkInStatuses[salesOrder];
    if (delivery && checkInStatuses[delivery]) return checkInStatuses[delivery];
    return null;
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || '');
    };
    getUser();
  }, [supabase]);

  useEffect(() => {
    loadAppointments();
    fetchCheckInStatuses();
    setStatusFilter('all');
  }, [selectedDate]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await getAppointmentsByDate(selectedDate);
      setAppointments(data);
    } catch (error) {
      console.error('❌ Error loading appointments:', error);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  const changeDateByDays = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const clearSearch = () => setSearchQuery('');

  const searchFilteredAppointments = appointments.filter(apt => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const salesOrder = apt.sales_order?.toLowerCase() || '';
    const delivery = apt.delivery?.toLowerCase() || '';
    return salesOrder.includes(query) || delivery.includes(query);
  });

  const filteredAppointments = searchFilteredAppointments.filter(apt => {
    if (statusFilter === 'all') return true;
    const status = getDailyLogStatus(apt);
    const time = apt.appointment_time?.toLowerCase() || '';
    const isWorkIn = time.includes('work in');
    if (statusFilter === 'work_in') return isWorkIn;
    if (statusFilter === 'not_checked_in') return !status;
    if (statusFilter === 'checked_in') return status?.toLowerCase() === 'checked_in';
    if (statusFilter === 'pending') return status?.toLowerCase() === 'pending';
    if (statusFilter === 'checked_out') {
      const s = status?.toLowerCase();
      return s === 'checked_out' || s === 'unloaded';
    }
    return true;
  });

  const totalAppointmentsCount = searchFilteredAppointments.length;

  const workInCount = searchFilteredAppointments.filter(apt =>
    apt.appointment_time?.toLowerCase().includes('work in')
  ).length;

  const checkedOutCount = searchFilteredAppointments.filter(apt => {
    const s = getDailyLogStatus(apt)?.toLowerCase();
    return s === 'checked_out' || s === 'unloaded';
  }).length;

  const checkedInCount = searchFilteredAppointments.filter(apt =>
    getDailyLogStatus(apt)?.toLowerCase() === 'checked_in'
  ).length;

  const pendingCount = searchFilteredAppointments.filter(apt =>
    getDailyLogStatus(apt)?.toLowerCase() === 'pending'
  ).length;

  const notCheckedInCount = searchFilteredAppointments.filter(apt =>
    !getDailyLogStatus(apt)
  ).length;

  const isFilterActive = (filter: StatusFilter) => statusFilter === filter;

  const statusBreakdownButtons: {
    filter: StatusFilter;
    label: string;
    count: number;
    activeClass: string;
    inactiveClass: string;
  }[] = [
    {
      filter: 'not_checked_in',
      label: 'Not Checked In',
      count: notCheckedInCount,
      activeClass: 'bg-blue-500 border-blue-500 text-white',
      inactiveClass: 'bg-white border-gray-300 text-gray-700 hover:border-blue-400',
    },
    {
      filter: 'checked_in',
      label: 'Checked In',
      count: checkedInCount,
      activeClass: 'bg-purple-500 border-purple-500 text-white',
      inactiveClass: 'bg-white border-gray-300 text-gray-700 hover:border-purple-400',
    },
    {
      filter: 'pending',
      label: 'Pending',
      count: pendingCount,
      activeClass: 'bg-yellow-500 border-yellow-500 text-white',
      inactiveClass: 'bg-white border-gray-300 text-gray-700 hover:border-yellow-400',
    },
    {
      filter: 'checked_out',
      label: 'Checked Out',
      count: checkedOutCount,
      activeClass: 'bg-green-500 border-green-500 text-white',
      inactiveClass: 'bg-white border-gray-300 text-gray-700 hover:border-green-400',
    },
    {
      filter: 'work_in',
      label: 'Work In',
      count: workInCount,
      activeClass: 'bg-orange-500 border-orange-500 text-white',
      inactiveClass: 'bg-white border-gray-300 text-gray-700 hover:border-orange-400',
    },
  ];

  const handleCheckDuplicate = (salesOrder: string, delivery: string) => {
    if (editingAppointment) { setExistingAppointment(null); return; }
    const so = salesOrder.trim().toLowerCase();
    const del = delivery.trim().toLowerCase();
    const found = appointments.find((a) =>
      (so !== '' && a.sales_order?.trim().toLowerCase() === so) ||
      (del !== '' && a.delivery?.trim().toLowerCase() === del)
    ) ?? null;
    setExistingAppointment(found);
  };

  const handleSave = async (data: AppointmentInput) => {
    try {
      const appointmentData: AppointmentInput = {
        ...data,
        source: editingAppointment ? data.source : 'manual'
      };
      if (editingAppointment) {
        await updateAppointment(editingAppointment.id, appointmentData);
      } else {
        await createAppointment(appointmentData);
      }
      setModalOpen(false);
      setEditingAppointment(null);
      await loadAppointments();
      await fetchCheckInStatuses();
    } catch (error: any) {
      console.error('Error saving appointment:', error);
      alert(error.message || 'Error saving appointment');
      throw error;
    }
  };

  const fetchCheckInStatuses = async () => {
    try {
      const { zonedTimeToUtc } = await import('date-fns-tz');
      const startUtc = zonedTimeToUtc(`${selectedDate} 00:00:00`, TIMEZONE);
      const endUtc = zonedTimeToUtc(`${selectedDate} 23:59:59`, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('reference_number, status')
        .gte('check_in_time', startUtc.toISOString())
        .lte('check_in_time', endUtc.toISOString())
        .not('reference_number', 'is', null);

      if (error) { console.error('Error fetching check-in statuses:', error); return; }

      if (data) {
        const statusMap: Record<string, string> = {};
        data.forEach((checkIn: { reference_number: string; status: string }) => {
          if (checkIn.reference_number) {
            statusMap[checkIn.reference_number.trim().toLowerCase()] = checkIn.status;
          }
        });
        setCheckInStatuses(statusMap);
      }
    } catch (error) {
      console.error('Error in fetchCheckInStatuses:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-[1600px] mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Appointment Scheduling</h1>
              </div>
              <div className="flex gap-3">
                <Link href="/appointments" className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium">
                  Appointments
                </Link>
                <Link href="/dock-status" className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium">
                  Dock Status
                </Link>
                <Link href="/dashboard" className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium">
                  Dashboard
                </Link>
                <Link href="/logs" className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium">
                  Daily Logs
                </Link>
                <Link href="/tracking" className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors font-medium">
                  Tracking
                </Link>
                <Link href="/check-in" className="bg-yellow-500 text-white px-6 py-2 rounded-lg hover:bg-yellow-600 transition-colors font-medium">
                  Check-In Form
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-[1600px] mx-auto px-4 py-6">

          {/* Row 1: Upload + Date Selector with Counters */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <AppointmentUpload onUploadComplete={loadAppointments} />
            </div>

            {/* Date Selector + Counters */}
            <div className="bg-white p-6 rounded-lg shadow">
              <label className="block text-sm font-medium mb-2">Select Date</label>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => changeDateByDays(-1)}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors font-medium"
                >
                  ← Prev
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 p-2 border rounded"
                />
                <button
                  onClick={() => changeDateByDays(1)}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors font-medium"
                >
                  Next →
                </button>
              </div>
              <button
                onClick={() => { setEditingAppointment(null); setModalOpen(true); }}
                className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition-colors font-medium mb-4"
              >
                + Add Manual Appointment
              </button>

              <div className="border-t pt-4 mt-2">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-blue-600">Total Appointments</p>
                      <p className="text-2xl font-bold text-blue-700">{totalAppointmentsCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-blue-600">Work Ins</p>
                      <p className="text-2xl font-bold text-blue-700">{workInCount}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-orange-600 mb-1">Status Breakdown</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-center">
                      <p className="text-xs font-medium text-orange-500">Checked Out</p>
                      <p className="text-lg font-bold text-orange-700">{checkedOutCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-orange-500">Checked In</p>
                      <p className="text-lg font-bold text-orange-700">{checkedInCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-orange-500">Pending</p>
                      <p className="text-lg font-bold text-orange-700">{pendingCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-orange-500">Not Checked In</p>
                      <p className="text-lg font-bold text-orange-700">{notCheckedInCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Appointments by Customer + Search Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Appointments by Customer */}
            <div className="bg-white border-2 border-gray-200 rounded-lg shadow-lg p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3 text-center">
                Appointments by Customer
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(
                  filteredAppointments.reduce((acc, apt) => {
                    const customer = apt.customer || 'Unknown Customer';
                    acc[customer] = (acc[customer] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort(([, a], [, b]) => b - a)
                  .map(([customer, count]) => (
                    <div key={customer} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                      <span className="text-sm text-gray-700 font-medium truncate">{customer}</span>
                      <span className="text-sm font-bold text-blue-600 ml-2">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Search & Status Filter */}
            <div className="bg-white border-2 border-gray-200 rounded-lg shadow-lg p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3 text-center">
                Search Appointments
              </h3>
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search by Sales Order or Delivery Number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg className="absolute left-3 top-3 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button onClick={clearSearch} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                    ✕
                  </button>
                )}
              </div>

              <div className="border-t border-gray-200 mb-3" />

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-700">Status Breakdown</h3>
                {statusFilter !== 'all' && (
                  <button onClick={() => setStatusFilter('all')} className="text-xs text-gray-500 hover:text-gray-700 underline">
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {statusBreakdownButtons.map(({ filter, label, count, activeClass, inactiveClass }) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(isFilterActive(filter) ? 'all' : filter)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                      border transition-colors duration-150 cursor-pointer
                      ${isFilterActive(filter) ? activeClass : inactiveClass}
                    `}
                  >
                    {label}
                    <span className={`
                      inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold
                      ${isFilterActive(filter) ? 'bg-white bg-opacity-25 text-inherit' : 'bg-gray-100 text-gray-600'}
                    `}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Appointments Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                Appointments for {formatDateForDisplay(selectedDate)}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Sales Order
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Delivery
                    </th>
                    {/* ── NEW: Load In Info ── */}
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Load In Info
                    </th>
                    {/* ── NEW: Transport Info ── */}
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Transport Info
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Dock
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                        Loading…
                      </td>
                    </tr>
                  ) : filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                        No appointments found.
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((apt) => {
                      const dailyLogStatus = getDailyLogStatus(apt);

                      // Build "City, ST" destination string
                      const destinationParts = [apt.destination_city, apt.destination_state].filter(Boolean);
                      const destination = destinationParts.length > 0 ? destinationParts.join(', ') : null;

                      return (
                        <tr key={apt.id} className="hover:bg-gray-50 transition-colors">

                          {/* Time */}
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                            {formatTimeInIndianapolis(apt.appointment_time || '')}
                          </td>

                          {/* Sales Order */}
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {apt.sales_order || '—'}
                          </td>

                          {/* Delivery */}
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {apt.delivery || '—'}
                          </td>

                          {/* ── NEW: Load In Info ── */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {apt.requested_ship_date || destination ? (
                              <div className="flex flex-col gap-0.5">
                                {apt.requested_ship_date && (
                                  <span className="text-gray-900 font-medium text-xs">
                                    {apt.requested_ship_date}
                                  </span>
                                )}
                                {destination && (
                                  <span className="text-gray-500 text-xs">
                                    {destination}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* ── NEW: Transport Info ── */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {apt.carrier || apt.mode ? (
                              <div className="flex flex-col gap-0.5">
                                {apt.carrier && (
                                  <span className="text-gray-900 font-medium text-xs">
                                    {apt.carrier}
                                  </span>
                                )}
                                {apt.mode && (
                                  <span className="text-gray-500 text-xs">
                                    {apt.mode}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Customer */}
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {apt.customer || '—'}
                          </td>

                          {/* Dock */}
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {apt.dock || '—'}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getStatusBadge(dailyLogStatus)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => { setEditingAppointment(apt); setModalOpen(true); }}
                              className="text-blue-600 hover:text-blue-800 font-medium text-sm mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={
