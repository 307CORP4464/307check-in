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
import { zonedTimeToUtc } from 'date-fns-tz';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(date);
  } catch (e) {
    console.error('Time formatting error:', e, isoString);
    return isoString;
  }
};
// Update the filteredAppointments logic to handle manual appointments better
const filteredAppointments = appointments.filter(apt => {
  if (!searchQuery.trim()) return true;
  
  const query = searchQuery.toLowerCase().trim();
  const salesOrder = apt.sales_order?.toLowerCase() || '';
  const delivery = apt.delivery?.toLowerCase() || '';
  const carrier = apt.carrier?.toLowerCase() || '';
  const notes = apt.notes?.toLowerCase() || '';
  const source = apt.source?.toLowerCase() || '';
  
  // Search across multiple fields including carrier, notes, and source
  return salesOrder.includes(query) || 
         delivery.includes(query) || 
         carrier.includes(query) ||
         notes.includes(query) ||
         source.includes(query);
});

// Status badge color function matching DailyLog
const getStatusBadgeColor = (status: string): string => {
  const statusLower = status.toLowerCase();
  if (statusLower === 'completed' || statusLower === 'checked_out') return 'bg-gray-500 text-white';
  if (statusLower === 'unloaded') return 'bg-green-500 text-white';
  if (statusLower === 'rejected') return 'bg-red-500 text-white';
  if (statusLower === 'turned_away') return 'bg-red-500 text-white';
  if (statusLower === 'driver_left') return 'bg-red-500 text-white';
  if (statusLower === 'pending') return 'bg-yellow-500 text-white';
  if (statusLower === 'checked_in') return 'bg-purple-500 text-white';
  return 'bg-gray-500 text-white';
};

// Status label function
const getStatusLabel = (status: string): string => {
  if (status === 'checked_in') return 'Check In';
  if (status === 'checked_out') return 'Completed';
  if (status === 'turned_away') return 'Turned Away';
  if (status === 'driver_left') return 'Driver Left';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

interface CheckInStatus {
  reference_number: string;
  status: string;
  check_in_time?: string;
}

export default function AppointmentsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [checkInStatuses, setCheckInStatuses] = useState<Map<string, CheckInStatus>>(new Map());
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
    loadCheckInStatuses();
  }, [selectedDate]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await getAppointmentsByDate(selectedDate);
      setAppointments(data);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCheckInStatuses = async () => {
    try {
      const startOfDayIndy = zonedTimeToUtc(`${selectedDate} 00:00:00`, TIMEZONE);
      const endOfDayIndy = zonedTimeToUtc(`${selectedDate} 23:59:59`, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('reference_number, status, check_in_time')
        .gte('check_in_time', startOfDayIndy.toISOString())
        .lte('check_in_time', endOfDayIndy.toISOString());

      if (error) throw error;
      
      const statusMap = new Map<string, CheckInStatus>();
      data?.forEach((checkIn) => {
        if (checkIn.reference_number) {
          statusMap.set(checkIn.reference_number, {
            reference_number: checkIn.reference_number,
            status: checkIn.status,
            check_in_time: checkIn.check_in_time
          });
        }
      });
      
      setCheckInStatuses(statusMap);
    } catch (error) {
      console.error('Error loading check-in statuses:', error);
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

  const changeDateByDays = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  // Filter appointments based on search query
  const filteredAppointments = appointments.filter(apt => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    const salesOrder = apt.sales_order?.toLowerCase() || '';
    const delivery = apt.delivery?.toLowerCase() || '';
    
    return salesOrder.includes(query) || delivery.includes(query);
  });

  const groupedAppointments = TIME_SLOTS.reduce((acc, slot) => {
    acc[slot] = filteredAppointments.filter(apt => apt.scheduled_time === slot);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const workInCount = groupedAppointments['Work In']?.length || 0;
  const totalAppointmentsCount = filteredAppointments.length;

  const handleSave = async (data: AppointmentInput) => {
    try {
      if (editingAppointment) {
        await updateAppointment(editingAppointment.id, data);
      } else {
        await createAppointment({ ...data, source: 'manual' });
      }
      await loadAppointments();
      await loadCheckInStatuses();
      setEditingAppointment(null);
    } catch (error: any) {
      alert(error.message || 'Error saving appointment');
      throw error;
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

  // Helper function to get status for an appointment
  const getAppointmentStatus = (appointment: Appointment): CheckInStatus | undefined => {
    const refNumber = appointment.sales_order || appointment.delivery;
    return refNumber ? checkInStatuses.get(refNumber) : undefined;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Matching Dashboard */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Appointment Scheduling</h1>
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

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <AppointmentUpload onUploadComplete={() => {
              loadAppointments();
              loadCheckInStatuses();
            }} />
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <label className="block text-sm font-medium mb-2">Select Date</label>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => changeDateByDays(-1)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors font-medium"
                title="Previous Day">
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
                title="Next Day">
                Next →
              </button>
            </div>
            <button
              onClick={() => {
                setEditingAppointment(null);
                setModalOpen(true);
              }}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition-colors font-medium">
              + Add Manual Appointment
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <label className="block text-sm font-medium mb-2 text-gray-700">
            Search by Reference Number
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter Sales Order or Delivery number..."
                className="w-full p-3 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
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
            </div>
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
            <div className="text-sm text-blue-800 font-medium">Total Appointments</div>
            <div className="text-3xl font-bold text-blue-900">{totalAppointmentsCount}</div>
          </div>
          <div className="bg-green-100 p-4 rounded-lg border border-green-300">
            <div className="text-sm text-green-800 font-medium">Work In Count</div>
            <div className="text-3xl font-bold text-green-900">{workInCount}</div>
          </div>
        </div>

        {/* Appointments List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {TIME_SLOTS.map((slot) => {
              const slotAppointments = groupedAppointments[slot] || [];
              if (slotAppointments.length === 0) return null;

              return (
                <div key={slot} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3">
                    <h3 className="text-lg font-bold">
                      {slot} ({slotAppointments.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {slotAppointments.map((appointment) => {
                      const status = getAppointmentStatus(appointment);
                      
                      return (
                        <div
                          key={appointment.id}
                          className="p-6 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                {/* Sales Order or Delivery as Title */}
                                <h4 className="text-lg font-semibold text-gray-900">
                                  {appointment.sales_order || appointment.delivery || 'N/A'}
                                </h4>
                                {/* Status Badge */}
                                {status && (
                                  <span
                                    className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusBadgeColor(
                                      status.status
                                    )}`}
                                  >
                                    {getStatusLabel(status.status)}
                                  </span>
                                )}
                              </div>

                              {/* Appointment Details */}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                {appointment.sales_order && (
                                  <div>
                                    <span className="text-gray-600">Sales Order:</span>
                                    <span className="ml-2 font-medium text-gray-900">
                                      {appointment.sales_order}
                                    </span>
                                  </div>
                                )}
                                {appointment.delivery && (
                                  <div>
                                    <span className="text-gray-600">Delivery:</span>
                                    <span className="ml-2 font-medium text-gray-900">
                                      {appointment.delivery}
                                    </span>
                                  </div>
                                )}
                                {status?.check_in_time && (
                                  <div>
                                    <span className="text-gray-600">Check In Time:</span>
                                    <span className="ml-2 font-medium text-gray-900">
                                      {formatTimeInIndianapolis(status.check_in_time)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Notes */}
                              {appointment.notes && (
                                <div className="mt-3 text-sm">
                                  <span className="text-gray-600 font-medium">Notes:</span>
                                  <p className="mt-1 text-gray-900">{appointment.notes}</p>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => handleEdit(appointment)}
                                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(appointment.id)}
                                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors text-sm font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Source and Created At */}
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                            <span className={`px-2 py-1 rounded ${
                              appointment.source === 'upload' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {appointment.source === 'upload' ? 'Uploaded' : 'Manual'}
                            </span>
                            <span>
                              Created: {new Date(appointment.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
{/* Modal */}
<AppointmentModal
  isOpen={modalOpen}
  onClose={() => {
    setModalOpen(false);
    setEditingAppointment(null);
  }}
  onSave={handleSave}
  appointment={editingAppointment}
/>
      
    </div>
  );
}
