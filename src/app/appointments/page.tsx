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
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-sm text-gray-600 mt-2">
              Found {filteredAppointments.length} {filteredAppointments.length === 1 ? 'appointment' : 'appointments'} matching "{searchQuery}"
            </p>
          )}
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-yellow-50 border-2 border-yellow-400 p-6 rounded-lg text-center shadow">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">Work In Appointments</h3>
            <p className="text-4xl font-bold text-yellow-900">{workInCount}</p>
          </div>
          <div className="bg-blue-50 border-2 border-blue-400 p-6 rounded-lg text-center shadow">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">Total Appointments</h3>
            <p className="text-4xl font-bold text-blue-900">{totalAppointmentsCount}</p>
          </div>
        </div>

        {/* Appointments List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-xl text-gray-600">Loading...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {TIME_SLOTS.map(slot => {
              const slotAppts = groupedAppointments[slot] || [];
              const displayTime = slot === 'Work In' ? 'Work In' : `${slot.substring(0, 2)}:${slot.substring(2)}`;

              return (
                <div key={slot} className="bg-white rounded-lg shadow">
                  <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="text-xl font-semibold text-gray-900">{displayTime}</h3>
                    <span className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
                      {slotAppts.length} {slotAppts.length === 1 ? 'appointment' : 'appointments'}
                    </span>
                  </div>

                  <div className="p-4">
                    {slotAppts.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No appointments scheduled</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {slotAppts.map(apt => (
                          <div
                            key={apt.id}
                            className={`p-4 rounded-lg border-l-4 ${
                              apt.source === 'manual' 
                                ? 'border-green-500 bg-green-50' 
                                : 'border-blue-500 bg-blue-50'
                            } shadow-sm hover:shadow-md transition-shadow`}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                  <span className="text-gray-600">SO:</span> {apt.sales_order}
                                </p>
                                <p className="text-sm text-gray-700 mb-2">
                                  <span className="font-medium">Delivery:</span> {apt.delivery}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    apt.source === 'manual' 
                                      ? 'bg-green-200 text-green-800' 
                                      : 'bg-blue-200 text-blue-800'
                                  }`}>
                                    {apt.source === 'manual' ? 'Manual' : 'Uploaded'}
                                  </span>
                                </div>
                              </div>
                              {apt.source === 'manual' && (
                                <div className="flex flex-col gap-1 ml-2">
                                  <button
                                    onClick={() => handleEdit(apt)}
                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 hover:bg-blue-100 rounded transition-colors">
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(apt.id)}
                                    className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 hover:bg-red-100 rounded transition-colors">
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

     <AppointmentModal
  isOpen={modalOpen}
  onClose={() => {
    setModalOpen(false);
    setEditingAppointment(null);
  }}
  onSave={handleSave}
  appointment={editingAppointment}
  initialDate={selectedDate}  // Changed from defaultDate to initialDate
/>


    </div>
  );
}
