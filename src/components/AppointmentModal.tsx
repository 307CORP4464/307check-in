'use client';

import { useState, useEffect } from 'react';
import { Plus, Minus } from 'lucide-react';
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
  existingAppointment,
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

  // Multi-entry states for Sales Orders and Deliveries
  const [salesOrders, setSalesOrders] = useState<string[]>(['']);
  const [deliveries, setDeliveries] = useState<string[]>(['']);

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

      // Parse existing comma-separated values back into arrays
      const existingSOs = activeAppointment.sales_order
        ? activeAppointment.sales_order.split(',').map(s => s.trim()).filter(Boolean)
        : [''];
      const existingDOs = activeAppointment.delivery
        ? activeAppointment.delivery.split(',').map(s => s.trim()).filter(Boolean)
        : [''];

      setSalesOrders(existingSOs.length > 0 ? existingSOs : ['']);
      setDeliveries(existingDOs.length > 0 ? existingDOs : ['']);
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
      setSalesOrders(['']);
      setDeliveries(['']);
    }
    setError('');
  }, [activeAppointment, initialDate, isOpen]);

  useEffect(() => {
    if (!isOpen) setEditingExisting(false);
  }, [isOpen]);

  // ── Sales Order helpers ──────────────────────────────────────────
  const handleSalesOrderChange = (index: number, value: string) => {
    setSalesOrders(prev => {
      const updated = [...prev];
      updated[index] = value;
      // Fire duplicate check using first SO and first delivery
      onCheckDuplicate?.(updated[0], deliveries[0] ?? '');
      return updated;
    });
  };

  const addSalesOrder = () => setSalesOrders(prev => [...prev, '']);

  const removeSalesOrder = (index: number) =>
    setSalesOrders(prev => prev.filter((_, i) => i !== index));

  // ── Delivery helpers ─────────────────────────────────────────────
  const handleDeliveryChange = (index: number, value: string) => {
    setDeliveries(prev => {
      const updated = [...prev];
      updated[index] = value;
      // Fire duplicate check using first SO and first delivery
      onCheckDuplicate?.(salesOrders[0] ?? '', updated[0]);
      return updated;
    });
  };

  const addDelivery = () => setDeliveries(prev => [...prev, '']);

  const removeDelivery = (index: number) =>
    setDeliveries(prev => prev.filter((_, i) => i !== index));

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const filledSOs = salesOrders.map(s => s.trim()).filter(Boolean);
    const filledDOs = deliveries.map(d => d.trim()).filter(Boolean);

    if (filledSOs.length === 0 && filledDOs.length === 0) {
      setError('At least one Sales Order or Delivery is required');
      return;
    }

    // Check for blank intermediate entries
    const hasBlankSO = salesOrders.some((s, i) => s.trim() === '' && salesOrders.length > 1);
    const hasBlankDO = deliveries.some((d, i) => d.trim() === '' && deliveries.length > 1);
    if (hasBlankSO) {
      setError('Please fill in all Sales Order fields or remove empty ones');
      return;
    }
    if (hasBlankDO) {
      setError('Please fill in all Delivery fields or remove empty ones');
      return;
    }

    if (!formData.customer) {
      setError('Customer is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...formData,
        sales_order: filledSOs.join(', '),
        delivery: filledDOs.join(', '),
      });
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
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  if (!isOpen) return null;

  const showDuplicateWarning = !appointment && !editingExisting && !!existingAppointment;

  const modalTitle = editingExisting
    ? 'Edit Existing Appointment'
    : appointment
    ? 'Edit Appointment'
    : 'Add Appointment';

  // For the required asterisk logic, check if the OTHER field group is empty
  const noDeliveries = deliveries.every(d => d.trim() === '');
  const noSalesOrders = salesOrders.every(s => s.trim() === '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">

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
          {showDuplicateWarning && existingAppointment && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className="text-amber-800 font-semibold text-sm mb-1">
                    An appointment already exists for this{' '}
                    {existingAppointment.sales_order ? 'Sales Order' : 'Delivery'}
                  </p>
                  <div className="text-amber-700 text-sm space-y-0.5">
                    {existingAppointment.sales_order && (
                      <p><span className="font-medium">Sales Order:</span> {existingAppointment.sales_order}</p>
                    )}
                    {existingAppointment.delivery && (
                      <p><span className="font-medium">Delivery:</span> {existingAppointment.delivery}</p>
                    )}
                    <p><span className="font-medium">Date:</span> {formatDate(existingAppointment.appointment_date)}</p>
                    <p><span className="font-medium">Time:</span> {existingAppointment.appointment_time}</p>
                    {existingAppointment.customer && (
                      <p><span className="font-medium">Customer:</span> {existingAppointment.customer}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingExisting(true); setError(''); }}
                    className="mt-3 w-full px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded transition-colors"
                  >
                    Edit Existing Appointment Instead
                  </button>
                </div>
              </div>
            </div>
          )}

          {editingExisting && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded flex items-center justify-between">
              <p className="text-blue-700 text-sm font-medium">Editing the existing appointment</p>
              <button
                type="button"
                onClick={() => setEditingExisting(false)}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Cancel
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Date */}
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

            {/* Time Slot */}
            <div>
              <label className="block text-sm font-medium mb-1">Time Slot *</label>
              <select
                value={formData.appointment_time}
                onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>

            {/* Customer */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.customer || ''}
                onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a customer</option>
                {CUSTOMERS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sales Orders — multi-entry */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">
                  Sales Order{salesOrders.length > 1 ? 's' : ''}{' '}
                  {noDeliveries && <span className="text-red-500">*</span>}
                </label>
                <button
                  type="button"
                  onClick={addSalesOrder}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                  title="Add another sales order"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {salesOrders.map((so, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={so}
                      onChange={(e) => handleSalesOrderChange(index, e.target.value)}
                      placeholder={index === 0 ? 'Enter sales order number' : `Sales Order #${index + 1}`}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeSalesOrder(index)}
                        className="flex-shrink-0 text-red-500 hover:text-red-700 transition-colors"
                        title="Remove this sales order"
                      >
                        <Minus size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Deliveries — multi-entry */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">
                  Deliver{deliveries.length > 1 ? 'ies' : 'y'}{' '}
                  {noSalesOrders && <span className="text-red-500">*</span>}
                </label>
                <button
                  type="button"
                  onClick={addDelivery}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                  title="Add another delivery"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {deliveries.map((delivery, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={delivery}
                      onChange={(e) => handleDeliveryChange(index, e.target.value)}
                      placeholder={index === 0 ? 'Enter delivery number' : `Delivery #${index + 1}`}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeDelivery(index)}
                        className="flex-shrink-0 text-red-500 hover:text-red-700 transition-colors"
                        title="Remove this delivery"
                      >
                        <Minus size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Optional notes"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Appointment'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
