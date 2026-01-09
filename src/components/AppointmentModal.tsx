'use client';

import { useState, useEffect } from 'react';
import { AppointmentInput, TIME_SLOTS, Appointment } from '@/types/appointments';
import { getLoadStatusFromLog, checkDuplicateAppointment } from '@/lib/appointmentsService';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AppointmentInput) => Promise<void>;
  appointment?: Appointment | null;
  selectedDate?: string; // Made optional since it's now called defaultDate
  defaultDate?: string; // Added this prop
}

export default function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  appointment,
  selectedDate,
  defaultDate
}: AppointmentModalProps) {
  // Use defaultDate if provided, otherwise fall back to selectedDate
  const initialDate = defaultDate || selectedDate || new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<AppointmentInput>({
    appointment_date: initialDate,
    scheduled_time: '06:00',
    sales_order: '',
    delivery: '',
    carrier: '',
    notes: ''
  });

  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appointment) {
      setFormData({
        appointment_date: appointment.appointment_date,
        scheduled_time: appointment.scheduled_time,
        sales_order: appointment.sales_order || '',
        delivery: appointment.delivery || '',
        carrier: appointment.carrier || '',
        notes: appointment.notes || ''
      });
    } else {
      // Use defaultDate or selectedDate for new appointments
      const dateToUse = defaultDate || selectedDate || new Date().toISOString().split('T')[0];
      setFormData({
        appointment_date: dateToUse,
        scheduled_time: '06:00',
        sales_order: '',
        delivery: '',
        carrier: '',
        notes: ''
      });
    }
    setLoadStatus(null);
    setDuplicateWarning(null);
  }, [appointment, selectedDate, defaultDate, isOpen]);

  // Fetch load status when sales order or delivery changes
  useEffect(() => {
    const fetchLoadStatus = async () => {
      if (formData.sales_order || formData.delivery) {
        setLoadingStatus(true);
        const status = await getLoadStatusFromLog(
          formData.sales_order,
          formData.delivery
        );
        setLoadStatus(status);
        setLoadingStatus(false);
      } else {
        setLoadStatus(null);
      }
    };

    const timeoutId = setTimeout(fetchLoadStatus, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [formData.sales_order, formData.delivery]);

  // Check for duplicates
  useEffect(() => {
    const checkDuplicate = async () => {
      if ((formData.sales_order || formData.delivery) && formData.appointment_date) {
        const duplicate = await checkDuplicateAppointment(
          formData.sales_order,
          formData.delivery,
          formData.appointment_date,
          appointment?.id
        );
        setDuplicateWarning(duplicate);
      } else {
        setDuplicateWarning(null);
      }
    };

    const timeoutId = setTimeout(checkDuplicate, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [formData.sales_order, formData.delivery, formData.appointment_date, appointment?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If there's a duplicate, ask for confirmation
    if (duplicateWarning && !appointment) {
      const override = confirm(
        `⚠️ DUPLICATE DETECTED!\n\n` +
        `An appointment already exists:\n` +
        `Sales Order: ${duplicateWarning.sales_order || 'N/A'}\n` +
        `Delivery: ${duplicateWarning.delivery || 'N/A'}\n` +
        `Time: ${duplicateWarning.scheduled_time}\n\n` +
        `Do you want to create a duplicate appointment?`
      );
      
      if (!override) {
        return;
      }
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving appointment:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">
            {appointment ? 'Edit Appointment' : 'Add Appointment'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={formData.appointment_date}
                onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                className="w-full p-2 border rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Time Slot</label>
              <select
                value={formData.scheduled_time}
                onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                className="w-full p-2 border rounded"
                required
              >
                {TIME_SLOTS.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Sales Order</label>
              <input
                type="text"
                value={formData.sales_order}
                onChange={(e) => setFormData({ ...formData, sales_order: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="Enter sales order number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Delivery</label>
              <input
                type="text"
                value={formData.delivery}
                onChange={(e) => setFormData({ ...formData, delivery: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="Enter delivery number"
              />
            </div>

            {/* Load Status Display */}
            {(formData.sales_order || formData.delivery) && (
              <div className={`p-3 rounded-lg border-2 ${
                loadingStatus 
                  ? 'bg-gray-50 border-gray-300' 
                  : loadStatus 
                    ? 'bg-blue-50 border-blue-300' 
                    : 'bg-yellow-50 border-yellow-300'
              }`}>
                <label className="block text-sm font-medium mb-1">
                  Load Status (from Daily Log)
                </label>
                {loadingStatus ? (
                  <p className="text-gray-600 text-sm">Loading status...</p>
                ) : loadStatus ? (
                  <p className="text-blue-700 font-semibold">{loadStatus}</p>
                ) : (
                  <p className="text-yellow-700 text-sm">No status found in daily logs</p>
                )}
              </div>
            )}

            {/* Duplicate Warning */}
            {duplicateWarning && !appointment && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-red-800 font-semibold text-sm mb-1">⚠️ DUPLICATE DETECTED!</p>
                    <p className="text-red-700 text-xs">
                      An appointment already exists for this reference number at {duplicateWarning.scheduled_time}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Carrier</label>
              <input
                type="text"
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                className="w-full p-2 border rounded"
                placeholder="Enter carrier name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2 border rounded"
                rows={3}
                placeholder="Enter any additional notes"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                disabled={saving}
              >
                {saving ? 'Saving...' : (appointment ? 'Update' : 'Create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
