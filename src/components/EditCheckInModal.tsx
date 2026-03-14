'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface EditCheckInModalProps {
  checkIn: {
    id: string;
    driver_name?: string | null;
    driver_phone?: string | null;
    carrier_name?: string | null;
    trailer_number?: string | null;
    trailer_length?: string | null;
    load_type?: 'inbound' | 'outbound';
    reference_number?: string | null;
    appointment_time?: string | null;
    dock_number?: string | null;
    customer?: string | null;
    requested_ship_date?: string | null;
    ship_to_city?: string | null;
    ship_to_state?: string | null;
    carrier?: string | null;
    mode?: string | null;
    notes?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean;
}

export default function EditCheckInModal({ checkIn, onClose, onSuccess, isOpen }: EditCheckInModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const parseReferenceNumbers = (refNum?: string): string[] => {
    if (!refNum) return [''];
    const parts = refNum.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [''];
  };

  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(
    parseReferenceNumbers(checkIn.reference_number)
  );

  const [formData, setFormData] = useState({
    driver_name: checkIn.driver_name || '',
    driver_phone: checkIn.driver_phone || '',
    carrier_name: checkIn.carrier_name || '',
    trailer_number: checkIn.trailer_number || '',
    trailer_length: checkIn.trailer_length || '',
    load_type: checkIn.load_type || 'inbound' as 'inbound' | 'outbound',
    appointment_time: checkIn.appointment_time || '',
    dock_number: checkIn.dock_number || '',
    customer: checkIn.customer || '',
    requested_ship_date: checkIn.requested_ship_date || '',
    ship_to_city: checkIn.ship_to_city || '',
    ship_to_state: checkIn.ship_to_state || '',
    carrier: checkIn.carrier || '',
    mode: checkIn.mode || '',
    notes: checkIn.notes || '',
  });


  const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'MX', 'CN'
  ] as const;

  const MODES = [
    'TL', 'LTL', 'Intermodal', 'Flatbed', 'Reefer', 'Partial', 'Van', 'Other'
  ];

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleReferenceChange = (index: number, value: string) => {
    setReferenceNumbers(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const addReferenceNumber = () => {
    setReferenceNumbers(prev => [...prev, '']);
  };

  const removeReferenceNumber = (index: number) => {
    setReferenceNumbers(prev => {
      if (prev.length === 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const combinedReferenceNumber = referenceNumbers
      .map(r => r.trim())
      .filter(Boolean)
      .join(', ');

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
          reference_number: combinedReferenceNumber,
          appointment_time: formData.appointment_time || null,
          dock_number: formData.dock_number || null,
          customer: formData.customer || null,
          requested_ship_date: formData.requested_ship_date || null,
          ship_to_city: formData.ship_to_city || null,
          ship_to_state: formData.ship_to_state || null,
          carrier: formData.carrier || null,
          mode: formData.mode || null,
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

  if (!isOpen) return null;

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

            {/* Load Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Load Type
              </label>
              <select
                name="load_type"
                value={formData.load_type}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>

            {/* Reference Numbers */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reference Number(s)
              </label>
              <div className="flex flex-col gap-2">
                {referenceNumbers.map((ref, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ref}
                      onChange={(e) => handleReferenceChange(index, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder={`Reference #${index + 1}`}
                    />
                    {referenceNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeReferenceNumber(index)}
                        className="text-red-500 hover:text-red-700 font-bold text-lg px-2"
                        title="Remove"
                      >
                        &minus;
                      </button>
                    )}
                    {index === referenceNumbers.length - 1 && (
                      <button
                        type="button"
                        onClick={addReferenceNumber}
                        className="text-blue-500 hover:text-blue-700 font-bold text-lg px-2"
                        title="Add another reference number"
                      >
                        +
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Appointment Time */}
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
                <option value="LTL">LTL</option>
                <option value="Paid no appointment">Paid</option>
                <option value="Charge Customer no appointment">Charge</option>
                <option value="0800">08:00</option>
                <option value="0900">09:00</option>
                <option value="0930">09:30</option>
                <option value="1000">10:00</option>
                <option value="1030">10:30</option>
                <option value="1100">11:00</option>
                <option value="1230">12:30</option>
                <option value="1300">13:00</option>
                <option value="1330">13:30</option>
                <option value="1400">14:00</option>
                <option value="1430">14:30</option>
                <option value="1500">15:00</option>
                <option value="1530">15:30</option>
              </select>
            </div>

            {/* Dock Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dock Number
              </label>
              <input
                type="text"
                name="dock_number"
                value={formData.dock_number}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., A1, B2, etc."
              />
            </div>

            {/* Driver Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Driver Name
              </label>
              <input
                type="text"
                name="driver_name"
                value={formData.driver_name}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Driver Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Driver Phone
              </label>
              <input
                type="text"
                name="driver_phone"
                value={formData.driver_phone}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Carrier Name */}
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

            {/* Trailer Number */}
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

            {/* Trailer Length */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trailer Length
              </label>
              <input
                type="text"
                name="trailer_length"
                value={formData.trailer_length}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* ── Optional Fields ── */}

            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                name="customer"
                value={formData.customer}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="Customer name"
              />
            </div>

            {/* Requested Ship Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Requested Ship Date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                name="requested_ship_date"
                value={formData.requested_ship_date}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Ship To City */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ship To City <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                name="ship_to_city"
                value={formData.ship_to_city}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="City"
              />
            </div>

            {/* Ship To State */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ship To State <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                name="ship_to_state"
                value={formData.ship_to_state}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select state...</option>
                {US_STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>

            {/* Carrier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Carrier <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                name="carrier"
                value={formData.carrier}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="Carrier"
              />
            </div>

            {/* Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mode <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                name="mode"
                value={formData.mode}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select mode...</option>
                {MODES.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </div>

            {/* Notes — full width */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional notes..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
