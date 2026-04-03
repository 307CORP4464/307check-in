'use client';

import { useState, useEffect } from 'react';
import { Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { Appointment, AppointmentInput, TIME_SLOTS } from '@/types/appointments';
import { getHoliday, isHoliday } from '@/lib/holidays';

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
    carrier: '',
    mode: '',
    requested_ship_date: '',
    ship_to_city: '',
    ship_to_state: '',
    notes: '',
    source: 'manual',
  });

  const [salesOrders, setSalesOrders] = useState<string[]>(['']);
  const [deliveries, setDeliveries] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingExisting, setEditingExisting] = useState(false);
  const [showLoadInfo, setShowLoadInfo] = useState(false);

  const activeAppointment = editingExisting ? existingAppointment : appointment;

  // Derived: is the currently-selected appointment date a holiday?
  const selectedDateHoliday = getHoliday(formData.appointment_date);

  useEffect(() => {
    if (activeAppointment) {
      setFormData({
        appointment_date: activeAppointment.appointment_date,
        appointment_time: activeAppointment.appointment_time,
        sales_order: activeAppointment.sales_order || '',
        delivery: activeAppointment.delivery || '',
        customer: activeAppointment.customer || '',
        carrier: activeAppointment.carrier || '',
        mode: activeAppointment.mode || '',
        requested_ship_date: activeAppointment.requested_ship_date || '',
        ship_to_city: activeAppointment.ship_to_city || '',
        ship_to_state: activeAppointment.ship_to_state || '',
        notes: activeAppointment.notes || '',
        source: activeAppointment.source,
      });

      const existingSOs = activeAppointment.sales_order
        ? activeAppointment.sales_order.split(',').map(s => s.trim()).filter(Boolean)
        : [''];
      const existingDOs = activeAppointment.delivery
        ? activeAppointment.delivery.split(',').map(s => s.trim()).filter(Boolean)
        : [''];

      setSalesOrders(existingSOs.length > 0 ? existingSOs : ['']);
      setDeliveries(existingDOs.length > 0 ? existingDOs : ['']);

      const hasLoadInfo =
        !!activeAppointment.carrier ||
        !!activeAppointment.mode ||
        !!activeAppointment.requested_ship_date ||
        !!activeAppointment.ship_to_city ||
        !!activeAppointment.ship_to_state;
      setShowLoadInfo(hasLoadInfo);

    } else {
      setFormData({
        appointment_date: initialDate,
        appointment_time: '08:00',
        sales_order: '',
        delivery: '',
        customer: '',
        carrier: '',
        mode: '',
        requested_ship_date: '',
        ship_to_city: '',
        ship_to_state: '',
        notes: '',
        source: 'manual',
      });
      setSalesOrders(['']);
      setDeliveries(['']);
      setShowLoadInfo(false);
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

    // ── Holiday guard ────────────────────────────────────────────────
    const holidayOnDate = getHoliday(formData.appointment_date);
    if (holidayOnDate) {
      setError(
        `${formData.appointment_date} is ${holidayOnDate.name} — the facility is closed on this date. Please choose a different day.`
      );
      return;
    }

    const filledSOs = salesOrders.map(s => s.trim()).filter(Boolean);
    const filledDOs = deliveries.map(d => d.trim()).filter(Boolean);

    if (filledSOs.length === 0 && filledDOs.length === 0) {
      setError('At least one Sales Order or Delivery is required');
      return;
    }

    const hasBlankSO = salesOrders.some(s => s.trim() === '' && salesOrders.length > 1);
    const hasBlankDO = deliveries.some(d => d.trim() === '' && deliveries.length > 1);
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

  const noDeliveries = deliveries.every(d => d.trim() === '');
  const noSalesOrders = salesOrders.every(s => s.trim() === '');

  const inputClass = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-sm font-medium mb-1";

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

          {/* Duplicate Warning */}
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
              <label className={labelClass}>Date *</label>
              <input
                type="date"
                value={formData.appointment_date}
                onChange={e => setFormData({ ...formData, appointment_date: e.target.value })}
                className={`${inputClass} ${selectedDateHoliday ? 'border-red-400 bg-red-50' : ''}`}
                required
              />
              {/* ── Holiday warning under the date picker ── */}
              {selectedDateHoliday && (
                <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 border border-red-300 rounded-lg">
                  <span className="text-red-500 text-base shrink-0">🚫</span>
                  <div>
                    <p className="text-sm font-semibold text-red-700">
                      Facility closed — {selectedDateHoliday.name}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Appointments cannot be scheduled on this date. Please select a different day.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Time */}
            <div>
              <label className={labelClass}>Time *</label>
              <select
                value={formData.appointment_time}
                onChange={e => setFormData({ ...formData, appointment_time: e.target.value })}
                className={inputClass}
                required
              >
                {TIME_SLOTS.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>

            {/* Customer */}
            <div>
              <label className={labelClass}>Customer *</label>
              <select
                value={formData.customer}
                onChange={e => setFormData({ ...formData, customer: e.target.value })}
                className={inputClass}
                required
              >
                <option value="">Select customer...</option>
                {CUSTOMERS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sales Orders */}
            <div>
              <label className={labelClass}>
                Sales Order {noDeliveries ? '*' : ''}
              </label>
              {salesOrders.map((so, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={so}
                    onChange={e => handleSalesOrderChange(index, e.target.value)}
                    placeholder="e.g. 2xxxxxx or 44xxxxxxxx"
                    className={inputClass}
                  />
                  {salesOrders.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSalesOrder(index)}
                      className="p-2 text-red-500 hover:text-red-700"
                    >
                      <Minus size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addSalesOrder}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus size={14} /> Add Sales Order
              </button>
            </div>

            {/* Deliveries */}
            <div>
              <label className={labelClass}>
                Delivery {noSalesOrders ? '*' : ''}
              </label>
              {deliveries.map((del, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={del}
                    onChange={e => handleDeliveryChange(index, e.target.value)}
                    placeholder="e.g. 8xxxxxxx"
                    className={inputClass}
                  />
                  {deliveries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDelivery(index)}
                      className="p-2 text-red-500 hover:text-red-700"
                    >
                      <Minus size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addDelivery}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus size={14} /> Add Delivery
              </button>
            </div>

            {/* ── Load & Transport Info (collapsible) ── */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLoadInfo(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                <span>Load &amp; Transport Info</span>
                {showLoadInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showLoadInfo && (
                <div className="p-4 space-y-3 border-t border-gray-200">
                  <div>
                    <label className={labelClass}>Carrier</label>
                    <input
                      type="text"
                      value={formData.carrier || ''}
                      onChange={e => setFormData({ ...formData, carrier: e.target.value })}
                      placeholder="e.g. FedEx, UPS"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Mode</label>
                    <input
                      type="text"
                      value={formData.mode || ''}
                      onChange={e => setFormData({ ...formData, mode: e.target.value })}
                      placeholder="e.g. LTL, FTL, Parcel"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Requested Ship Date</label>
                    <input
                      type="date"
                      value={formData.requested_ship_date || ''}
                      onChange={e => setFormData({ ...formData, requested_ship_date: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Ship To City</label>
                      <input
                        type="text"
                        value={formData.ship_to_city || ''}
                        onChange={e => setFormData({ ...formData, ship_to_city: e.target.value })}
                        placeholder="City"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>State</label>
                      <input
                        type="text"
                        value={formData.ship_to_state || ''}
                        onChange={e => setFormData({ ...formData, ship_to_state: e.target.value })}
                        placeholder="e.g. IN"
                        maxLength={2}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={formData.notes || ''}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes..."
                rows={3}
                className={inputClass}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !!selectedDateHoliday}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
