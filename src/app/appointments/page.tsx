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

// Format date for display
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
  }, [selectedDate]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      console.log('🔍 Loading appointments for date:', selectedDate);
      const data = await getAppointmentsByDate(selectedDate);
      console.log('📦 Received appointments:', data);
      console.log('📊 Total appointments:', data.length);
      console.log('🔨 Manual appointments:', data.filter(a => a.source === 'manual'));
      setAppointments(data);
      console.log('✅ State updated with appointments');
    } catch (error) {
      console.error('❌ Error loading appointments:', error);
      setAppointments([]);
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
    acc[slot] = filteredAppointments.filter(apt => apt.appointment_time === slot);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const workInCount = groupedAppointments['Work In']?.length || 0;
  const totalAppointmentsCount = filteredAppointments.length;

  const handleSave = async (data: AppointmentInput) => {
    try {
      // Add the selected date and source for new appointments
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
    } catch (error: any) {
      console.error('Error saving appointment:', error);
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

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <AppointmentUpload onUploadComplete={loadAppointments} />
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

            {/* Counters - Moved here and made larger */}
            <div className="mt-6 space-y-4">
              <div className="bg-blue-500 text-white p-6 rounded-lg shadow-lg">
                <div className="text-center">
                  <div className="text-5xl font-bold mb-2">{totalAppointmentsCount}</div>
                  <div className="text-xl font-medium">Total Appointments</div>
                  <div className="text-sm opacity-90 mt-1">for {formatDateForDisplay(selectedDate)}</div>
                </div>
              </div>
              
              <div className="bg-purple-500 text-white p-6 rounded-lg shadow-lg">
                <div className="text-center">
                  <div className="text-5xl font-bold mb-2">{workInCount}</div>
                  <div className="text-xl font-medium">Work In Appointments</div>
                  <div className="text-sm opacity-90 mt-1">Unscheduled appointments</div>
                </div>
              </div>
            </div>
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
                placeholder="Search by Sales Order or Delivery number..."
                className="w-full p-3 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={clearSearch}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Clear
            </button>
          </div>
          {searchQuery && (
            <p className="text-sm text-gray-600 mt-2">
              Showing {filteredAppointments.length} result{filteredAppointments.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
          )}
        </div>

        {/* Selected Date Display */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-2xl font-bold text-center text-gray-900">
            {formatDateForDisplay(selectedDate)}
          </h2>
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading appointments...</p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-medium">
                {searchQuery ? 'No appointments found matching your search' : 'No appointments scheduled for this date'}
              </p>
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="mt-4 text-blue-600 hover:text-blue-800 underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {TIME_SLOTS.map((timeSlot) => {
                const slotAppointments = groupedAppointments[timeSlot] || [];
                
                return (
                  <div key={timeSlot} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="min-w-[100px]">
                        <div className="font-semibold text-gray-900">{timeSlot}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {slotAppointments.length} appointment{slotAppointments.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        {slotAppointments.length === 0 ? (
                          <div className="text-gray-400 italic text-sm">No appointments</div>
                        ) : (
                          <div className="space-y-2">
                            {slotAppointments.map((apt) => (
                              <div
                                key={apt.id}
                                className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      {apt.sales_order && (
                                        <span className="text-sm font-semibold text-gray-900">
                                          SO: {apt.sales_order}
                                        </span>
                                      )}
                                      {apt.delivery && (
                                        <span className="text-sm font-semibold text-gray-900">
                                          Del: {apt.delivery}
                                        </span>
                                      )}
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        apt.source === 'manual' 
                                          ? 'bg-green-100 text-green-700' 
                                          : 'bg-blue-100 text-blue-700'
                                      }`}>
                                        {apt.source === 'manual' ? 'Manual' : 'Upload'}
                                      </span>
                                    </div>
                                    {apt.notes && (
                                      <p className="text-sm text-gray-600 mt-1">{apt.notes}</p>
                                    )}
                                    <div className="text-xs text-gray-500 mt-1">
                                      Created: {apt.created_at ? new Date(apt.created_at).toLocaleString() : 'N/A'}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleEdit(apt)}
                                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Edit"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDelete(apt.id)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Delete"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
        initialDate={selectedDate}
      />
    </div>
  );
}

