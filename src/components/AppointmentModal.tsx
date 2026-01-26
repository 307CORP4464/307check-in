'use client';

import { useState, useEffect } from 'react';
import { Appointment, AppointmentInput, TIME_SLOTS } from '@/types/appointments';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AppointmentInput) => Promise<void>;
  appointment?: Appointment | null;
  initialDate?: string;
}

export default function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  appointment,
  initialDate = new Date().toISOString().split('T')[0]
}: AppointmentModalProps) {
  const [formData, setFormData] = useState<AppointmentInput>({
    appointment_date: initialDate,
    appointment_time: '08:00',
    sales_order: '',
    delivery: '',
    notes: '',
    source: 'manual'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (appointment) {
      setFormData({
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time,
        sales_order: appointment.sales_order || '',
        delivery: appointment.delivery || '',
        notes: appointment.notes || '',
        source: appointment.source
      });
    } else {
      setFormData({
        appointment_date: initialDate,
        appointment_time: '08:00',
        sales_order: '',
        delivery: '',
        notes: '',
        source: 'manual'
      });
    }
    setError('');
  }, [appointment, initialDate, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.sales_order && !formData.delivery) {
      setError('Either Sales Order or Delivery is required');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error saving appointment');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              {appointment ? 'Edit Appointment' : 'Add Appointment'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              disabled={saving}
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>
              <input
                type="date"
                value={formData.appointment_date}
                onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Time Slot *</label>
              <select
                value={formData.appointment_time}
                onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Sales Order
                {!formData.delivery && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={formData.sales_order}
                onChange={(e) => setFormData({ ...formData, sales_order: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter sales order number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Delivery
                {!formData.sales_order && <span className="text-red-500"> *</span>}
              </label>
              <input
                type="text"
                value={formData.delivery}
                onChange={(e) => setFormData({ ...formData, delivery: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter delivery number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Enter any additional notes"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

