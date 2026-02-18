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
    
    if (timeString.toLowerCase().includes('work in')) {
      return 'Work In';
    }
    
    const timePattern = /^(\d{1,2}):(\d{2})(:\d{2})?$/;
    const match = timeString.match(timePattern);
    
    if (match) {
      const hours = match[1];
      const minutes = match[2];
      return `${hours}:${minutes}`;
    }
    
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

// Helper to get status badge styling
const getStatusBadge = (status: string | null) => {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
        Not Checked In
      </span>
    );
  }

  // Treat "unloaded" as "checked_out"
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

  const getDailyLogStatus = (appointment: Appointment): string | null => {
    const salesOrder = appointment.sales_order?.trim().toLowerCase();
    const delivery = appointment.delivery?.trim().toLowerCase();

    if (salesOrder && checkInStatuses[salesOrder]) {
      return checkInStatuses[salesOrder];
    }
    if (delivery && checkInStatuses[delivery]) {
      return checkInStatuses[delivery];
    }
    return null;
  };

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
    loadAppointments();
    fetchCheckInStatuses();
  }, [selectedDate]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      console.log('🔍 Loading appointments for date:', selectedDate);
      const data = await getAppointmentsByDate(selectedDate);
      console.log('📦 Received appointments:', data);
      console.log('📊 Total count:', data.length);
      
      if (data.length > 0) {
        console.log('🔍 First appointment:', data[0]);
        console.log('🕐 Appointment times:', data.map(a => a.appointment_time));
        console.log('🕐 First appointment_time type:', typeof data[0].appointment_time);
        console.log('🕐 First appointment_time value:', data[0].appointment_time);
      }
      
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

  const filteredAppointments = appointments.filter(apt => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    const salesOrder = apt.sales_order?.toLowerCase() || '';
    const delivery = apt.delivery?.toLowerCase() || '';
    
    return salesOrder.includes(query) || delivery.includes(query);
  });

    const totalAppointmentsCount = filteredAppointments.length;

  // Count work-ins
  const workInCount = filteredAppointments.filter(apt => {
    const time = apt.appointment_time?.toLowerCase() || '';
    return time.includes('work in');
  }).length;

  // Count statuses based on daily log
  const checkedOutCount = filteredAppointments.filter(apt => {
    const status = getDailyLogStatus(apt);
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'checked_out' || s === 'unloaded';
  }).length;

  const checkedInCount = filteredAppointments.filter(apt => {
    const status = getDailyLogStatus(apt);
    if (!status) return false;
    return status.toLowerCase() === 'checked_in';
  }).length;

  const notCheckedInCount = filteredAppointments.filter(apt => {
    const status = getDailyLogStatus(apt);
    return !status;
  }).length;

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

      if (error) {
        console.error('Error fetching check-in statuses:', error);
        return;
      }

      if (data) {
        const statusMap: Record<string, string> = {};
        data.forEach((checkIn: { reference_number: string; status: string }) => {
          if (checkIn.reference_number) {
            statusMap[checkIn.reference_number.trim().toLowerCase()] = checkIn.status;
          }
        });
        setCheckInStatuses(statusMap);
        console.log('📋 Check-in statuses loaded:', statusMap);
      }
    } catch (err) {
      console.error('Error in fetchCheckInStatuses:', err);
    }
  };

  const handleEdit = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    
    try {
      await deleteAppointment(id);
      await loadAppointments();
    } catch (error: any) {
      alert(error.message || 'Error deleting appointment');
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

return (
  <div className="min-h-screen bg-gray-50">
    {/* Header */}
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Appointment Scheduling</h1>
            {userEmail && (
              <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
            )}
            <p className="text-xs text-gray-500">
              Current time (Indianapolis): {getCurrentTimeInIndianapolis()}
            </p>
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

        {/* Date Selector + Counters combined */}
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
            onClick={() => {
              setEditingAppointment(null);
              setModalOpen(true);
            }}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition-colors font-medium mb-4"
          >
            + Add Manual Appointment
          </button>

          {/* Counters inside the same box */}
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
                  <p className="text-xs font-medium text-orange-500">Not Checked In</p>
                  <p className="text-lg font-bold text-orange-700">{notCheckedInCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Appointments by Customer + Search Bar side by side */}
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
                <div
                  key={customer}
                  className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded"
                >
                  <span className="text-sm text-gray-700 font-medium truncate">
                    {customer}
                  </span>
                  <span className="text-sm font-bold text-blue-600 ml-2">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white border-2 border-gray-200 rounded-lg shadow-lg p-4 flex flex-col justify-start">
          <h3 className="text-sm font-bold text-gray-700 mb-3 text-center">
            Search Appointments
          </h3>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Sales Order or Delivery Number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-3 top-3 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Appointments Table - now INSIDE the max-w wrapper */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchQuery ? 'No appointments found matching your search' : 'No appointments scheduled for this date'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sales Order
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAppointments.map((appointment) => {
                  const dailyLogStatus = getDailyLogStatus(appointment);
                  return (
                    <tr key={appointment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatTimeInIndianapolis(appointment.appointment_time)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {appointment.sales_order || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {appointment.delivery || '-'}
                      </td>
                       <td className="px-4 py-3 text-sm text-gray-900">
                        {appointment.customer}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {getStatusBadge(dailyLogStatus)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm space-x-2">
                        <button
                          onClick={() => handleEdit(appointment)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(appointment.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div> {/* closes max-w-[1600px] */}

    {modalOpen && (
      <AppointmentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleSave}
        initialDate={selectedDate}
        appointment={editingAppointment}
      />
    )}
  </div> {/* closes min-h-screen */}
);
