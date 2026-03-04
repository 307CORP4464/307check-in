// @/components/AppointmentModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { Appointment, AppointmentInput, TIME_SLOTS } from '@/types/appointments';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AppointmentInput) => Promise<void>;
  appointment?: Appointment | null;
  initialDate?: string;
  existingAppointment?: Appointment | null;
  onCheckDuplicate?: (salesOrder: string, delivery: string) => void;
}

const CUSTOMERS = ['TATE', 'PRIM', 'XARC', 'BAGS', 'TRAX', 'ADM'];

export default function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  appointment,
  initialDate = new Date().toISOString().split('T')[0],
  existingAppointment = null,
  onCheckDuplicate,
}: AppointmentModalProps) {
  const [formData, setFormData] = useState<AppointmentInput>({
    appointment_date: initialDate,
    appointment_time: '08:00',
    sales_order: '',
    delivery: '',
    customer: '',
    notes: '',
    source: 'manual',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingExisting, setEditingExisting] = useState(false);

  const activeAppointment = editingExisting ? existingAppointment : appointment;

  useEffect(() => {
    if (activeAppointment) {
      setFormData({
        appointment_date: activeAppointment.appointment_date,
        appointment_time: activeAppointment.appointment_time,
        sales_order: activeAppointment.sales_order || '',
        delivery: activeAppointment.delivery || '',
        customer: activeAppointment.customer || '',
        notes: activeAppointment.notes || '',
        source: activeAppointment.source,
      });
    } else {
      setFormData({
        appointment_date: initialDate,
        appointment_time: '08:00',
        sales_order: '',
        delivery: '',
        customer: '',
        notes: '',
        source: 'manual',
      });
    }
    setError('');
  }, [activeAppointment, initialDate, isOpen]);

  // Reset editingExisting whenever modal opens/closes
  useEffect(() => {
    if (!isOpen) setEditingExisting(false);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.sales_order && !formData.delivery) {
      setError('Either Sales Order or Delivery is required');
      return;
    }

    if (!formData.customer) {
      setError('Customer is required');
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

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!isOpen) return null;

  const showDuplicateWarning = !appointment && !editingExisting && existingAppointment;

  const modalTitle = editingExisting
    ? 'Edit Existing Appointment'
    : appointment
    ? 'Edit Appointment'
    : 'Add Appointment';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">

          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">{modalTitle}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              disabled={saving}
            >
              ×
            </button>
          </div>

          {/* ⚠️ Duplicate Warning Banner */}
          {showDuplicateWarning && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className="text-amber-800 font-semibold text-sm mb-1">
                    An appointment already exists for this{' '}
                    {existingAppointment!.sales_order ? 'Sales Order' : 'Delivery'}
                  </p>
                  <div className="text-amber-700 text-sm space-y-0.5">
                    {existingAppointment!.sales_order && (
                      <p>
                        <span className="font-medium">Sales Order:</span>{' '}
                        {existingAppointment!.sales_order}
                      </p>
                    )}
                    {existingAppointment!.delivery && (
                      <p>
                        <span className="font-medium">Delivery:</span>{' '}
                        {existingAppointment!.delivery}
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Date:</span>{' '}
                      {formatDate(existingAppointment!.appointment_date)}
                    </p>
                    <p>
                      <span className="font-medium">Time:</span>{' '}
                      {existingAppointment!.appointment_time}
                    </p>
                    {existingAppointment!.customer && (
                      <p>
                        <span className="font-medium">Customer:</span>{' '}
                        {existingAppointment!.customer}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExisting(true);
                      setError('');
                    }}
                    className="mt-3 w-full px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded transition-colors"
                  >
                    Edit Existing Appointment Instead
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Blue banner when switched to editing existing */}
          {editingExisting && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded flex items-center justify-between">
              <p className="text-blue-700 text-sm font-medium">
                Editing the existing appointment
              </p>
              <button
                type="button"
                onClick={() => setEditingExisting(false)}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Error */}
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
                onChange={(e) =>
                  setFormData({ ...formData, appointment_date: e.target.value })
                }
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Time Slot *</label>
              <select
                value={formData.appointment_time}
                onChange={(e) =>
                  setFormData({ ...formData, appointment_time: e.target.value })
                }
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
                Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.customer || ''}
                onChange={(e) =>
                  setFormData({ ...formData, customer: e.target.value })
                }
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a customer</option>
                {CUSTOMERS.map((customer) => (
                  <option key={customer} value={customer}>
                    {customer}
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
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, sales_order: val });
                  onCheckDuplicate?.(val, formData.delivery ?? '');
                }}
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
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, delivery: val });
                  onCheckDuplicate?.(formData.sales_order ?? '', val);
                }}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter delivery number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
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
