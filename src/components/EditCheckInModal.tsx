'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface EditCheckInModalProps {
  checkIn: {
    id: string;
    driver_name?: string;
    driver_phone?: string;
    carrier_name?: string;
    trailer_number?: string;
    trailer_length?: string;
    load_type?: 'inbound' | 'outbound';
    reference_number?: string;
    appointment_time?: string | null;
    destination_city?: string;
    destination_state?: string;
    notes?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditCheckInModal({ checkIn, onClose, onSuccess }: EditCheckInModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [formData, setFormData] = useState({
    driver_name: checkIn.driver_name || '',
    driver_phone: checkIn.driver_phone || '',
    carrier_name: checkIn.carrier_name || '',
    trailer_number: checkIn.trailer_number || '',
    trailer_length: checkIn.trailer_length || '',
    load_type: checkIn.load_type || 'inbound' as 'inbound' | 'outbound',
    reference_number: checkIn.reference_number || '',
    appointment_time: checkIn.appointment_time || '',
    destination_city: checkIn.destination_city || '',
    destination_state: checkIn.destination_state || '',
    notes: checkIn.notes || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const { error: updateError } = await supabase
        .from('check_ins')
        .update({
          driver_name: formData.driver_name,
          driver_phone: formData.driver_phone,
          carrier_name: formData.carrier_name,
          trailer_number: formData.trailer_number,
          trailer_length: formData.trailer_length,
          load_type: formData.load_type,
          reference_number: formData.reference_number,
          appointment_time: formData.appointment_time || null,
          destination_city: formData.destination_city,
          destination_state: formData.destination_state,
          notes: formData.notes,
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update check-in');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">Edit Check-In Information</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Load Type *
              </label>
              <select
                name="load_type"
                value={formData.load_type}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reference Number
              </label>
              <input
                type="text"
                name="reference_number"
                value={formData.reference_number}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Driver Name *
              </label>
              <input
                type="text"
                name="driver_name"
                value={formData.driver_name}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Driver Phone *
              </label>
              <input
                type="tel"
                name="driver_phone"
                value={formData.driver_phone}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Carrier Name
              </label>
              <input
                type="text"
                name="carrier_name"
                value={formData.carrier_name}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trailer Number
              </label>
              <input
                type="text"
                name="trailer_number"
                value={formData.trailer_number}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trailer Length
              </label>
              <select
                name="trailer_length"
                value={formData.trailer_length}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="48">48'</option>
                <option value="53">53'</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Appointment Time
              </label>
              <select
                name="appointment_time"
                value={formData.appointment_time}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                <option value="work_in">Work In</option>
                <option value="paid_to_load">Paid - No Appt</option>
                <option value="paid_charge_customer">Paid - Charge Customer</option>
                <option value="0700">07:00</option>
                <option value="0800">08:00</option>
                <option value="0900">09:00</option>
                <option value="1000">10:00</option>
                <option value="1100">11:00</option>
                <option value="1200">12:00</option>
                <option value="1300">13:00</option>
                <option value="1400">14:00</option>
                <option value="1500">15:00</option>
                <option value="1600">16:00</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destination City
              </label>
              <input
                type="text"
                name="destination_city"
                value={formData.destination_city}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destination State
              </label>
              <input
                type="text"
                name="destination_state"
                value={formData.destination_state}
                onChange={handleChange}
                maxLength={2}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 bg-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-400 disabled:bg-gray-200 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
