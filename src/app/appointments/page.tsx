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
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(date);
  } catch (e) {
    console.error('Time formatting error:', e);
    return isoString;
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
      console.log('📊 Total count:', data.length);
      
      if (data.length > 0) {
        console.log('🔍 First appointment:', data[0]);
        console.log('🕐 Appointment times:', data.map(a => a.appointment_time));
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
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition-colors font-medium"
            >
              + Add Manual Appointment
            </button>

        {/* Enhanced Counter */}
<div className="mt-6 space-y-4">
  {/* Total Appointments */}
  <div className="bg-blue-500 text-white p-6 rounded-lg shadow-lg">
    <div className="text-center">
      <div className="text-5xl font-bold mb-2">{totalAppointmentsCount}</div>
      <div className="text-xl font-medium">Total Appointments</div>
    </div>
  </div>

  {/* Work-In Appointments */}
  <div className="bg-orange-500 text-white p-4 rounded-lg shadow-lg">
    <div className="text-center">
      <div className="text-3xl font-bold mb-1">
        {filteredAppointments.filter(apt => apt.type === 'Work In').length}
      </div>
      <div className="text-sm font-medium">Work In Appointments</div>
    </div>
  </div>

  {/* Appointments by Customer */}
  <div className="bg-white border-2 border-gray-200 rounded-lg shadow-lg p-4">
    <h3 className="text-sm font-bold text-gray-700 mb-3 text-center">
      Appointments by Customer
    </h3>
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {Object.entries(
        filteredAppointments.reduce((acc, apt) => {
          const customer = apt.delivery || 'Unknown Customer';
          acc[customer] = (acc[customer] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      )
        .sort(([, a], [, b]) => b - a)
        .map(([customer, count]) => (
          <div
            key={customer}
            className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700 truncate flex-1">
              {customer}
            </span>
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full ml-2">
              {count}
            </span>
          </div>
        ))}
      {filteredAppointments.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-4">
          No appointments for this date
        </p>
      )}
    </div>
  </div>
</div>
    


        {/* Appointments Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <h2 className="text-lg font-bold">
              Appointments for {formatDateForDisplay(selectedDate)}
            </h2>
            
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SO or Delivery..."
                className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading appointments...</p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {appointments.length === 0 
                ? '📅 No appointments scheduled for this date. Click "Add Manual Appointment" or upload a file to get started.'
                : '🔍 No appointments match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Sales Order</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Delivery</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Customer</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Notes</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Source</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAppointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{apt.appointment_time}</td>
                      <td className="px-4 py-3 text-sm">{apt.sales_order || '-'}</td>
                      <td className="px-4 py-3 text-sm">{apt.delivery || '-'}</td>
                      <td className="px-4 py-3 text-sm">{apt.customer || '-'}</td>
                      
                      <td className="px-4 py-3 text-sm">{apt.notes || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          apt.source === 'manual' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {apt.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          onClick={() => handleEdit(apt)}
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(apt.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
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
      )}
    </div>
  );
}
