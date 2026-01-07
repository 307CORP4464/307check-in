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

export default function AppointmentsPage() {
 const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    loadAppointments();
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

  const groupedAppointments = TIME_SLOTS.reduce((acc, slot) => {
    acc[slot] = appointments.filter(apt => apt.scheduled_time === slot);
    return acc;
  }, {} as Record<string, Appointment[]>);

  const workInCount = groupedAppointments['Work In']?.length || 0;

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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Appointment Scheduling</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <AppointmentUpload onUploadComplete={loadAppointments} />
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <label className="block text-sm font-medium mb-2">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            />
            <button
              onClick={() => {
                setEditingAppointment(null);
                setModalOpen(true);
              }}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
            >
              + Add Manual Appointment
            </button>
          </div>
        </div>

        <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg mb-6 text-center">
          <h3 className="text-2xl font-bold text-yellow-800">
            Work In Appointments: {workInCount}
          </h3>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="space-y-6">
            {TIME_SLOTS.map(slot => {
              const slotAppts = groupedAppointments[slot] || [];
              const displayTime = slot === 'Work In' ? 'Work In' : `${slot.substring(0, 2)}:${slot.substring(2)}`;

              return (
                <div key={slot} className="bg-white rounded-lg shadow p-4">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 className="text-xl font-semibold">{displayTime}</h3>
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                      {slotAppts.length} appointments
                    </span>
                  </div>

                  {slotAppts.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No appointments</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {slotAppts.map(apt => (
                        <div
                          key={apt.id}
                          className={`p-4 rounded border-l-4 ${
                            apt.source === 'manual' ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-blue-50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-sm"><strong>SO:</strong> {apt.sales_order}</p>
                              <p className="text-sm"><strong>Delivery:</strong> {apt.delivery}</p>
                              <p className="text-xs text-gray-600 mt-1">Source: {apt.source}</p>
                            </div>
                            {apt.source === 'manual' && (
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => handleEdit(apt)}
                                  className="text-blue-600 hover:text-blue-800 text-xs"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(apt.id)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
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
        defaultDate={selectedDate}
      />
    </div>
  );
}

