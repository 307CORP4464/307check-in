'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Minus } from 'lucide-react';

interface ManualCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualCheckInModal({ isOpen, onClose, onSuccess }: ManualCheckInModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [formData, setFormData] = useState({
    load_type: 'outbound' as 'inbound' | 'outbound',
    carrier_name: '',
    trailer_number: '',
    destination_city: '',
    destination_state: '',
    notes: ''
  });

  // Reference numbers managed as a separate array state
  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(['']);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle changes to any reference number input
  const handleReferenceChange = (index: number, value: string) => {
    setReferenceNumbers(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Add a new empty reference number field
  const addReferenceNumber = () => {
    setReferenceNumbers(prev => [...prev, '']);
  };

  // Remove a reference number field by index (never remove the first one)
  const removeReferenceNumber = (index: number) => {
    setReferenceNumbers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Filter out any completely empty extra fields
      const filledRefs = referenceNumbers.map(r => r.trim()).filter(r => r !== '');

      // Validate required fields
      if (!formData.carrier_name || !formData.trailer_number || filledRefs.length === 0) {
        throw new Error('Please fill in all required fields');
      }

      // Check that no ref number field is partially empty (has whitespace only)
      const hasBlankEntry = referenceNumbers.some(r => r.trim() === '' && referenceNumbers.length > 1);
      if (hasBlankEntry) {
        throw new Error('Please fill in all reference number fields or remove empty ones');
      }

      // Join multiple reference numbers as comma-separated string for DB compatibility
      const referenceNumberValue = filledRefs.join(', ');

      // Insert check-in record
      const { error: insertError } = await supabase
        .from('check_ins')
        .insert({
          carrier_name: formData.carrier_name,
          trailer_number: formData.trailer_number,
          load_type: formData.load_type,
          reference_number: referenceNumberValue,
          destination_city: formData.destination_city || null,
          destination_state: formData.destination_state || null,
          notes: formData.notes || null,
          status: 'pending',
          check_in_time: new Date().toISOString()
        });

      if (insertError) throw insertError;

      // Reset form
      setFormData({
        load_type: 'outbound',
        carrier_name: '',
        trailer_number: '',
        destination_city: '',
        destination_state: '',
        notes: ''
      });
      setReferenceNumbers(['']);

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Manual check-in error:', err);
      setError(err.message || 'Failed to create check-in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Manual Check-In</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              disabled={submitting}
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Load Information */}
            <div className="border-b pb-4">
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Load Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Load Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Load Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="load_type"
                    value={formData.load_type}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="outbound">Outbound</option>
                    <option value="inbound">Inbound</option>
                  </select>
                </div>

                {/* Reference Numbers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Reference Number(s) (SO/DO) <span className="text-red-500">*</span>
                    </label>
                    {/* Plus button to add a new ref number field */}
                    <button
                      type="button"
                      onClick={addReferenceNumber}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                      title="Add another reference number"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>

                  {/* Render one input per reference number */}
                  <div className="space-y-2">
                    {referenceNumbers.map((ref, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ref}
                          onChange={e => handleReferenceChange(index, e.target.value)}
                          required={index === 0}
                          placeholder={index === 0 ? 'e.g., SO12345 or DO12345' : `Reference #${index + 1}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {/* Only show remove button for additional fields (not the first) */}
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => removeReferenceNumber(index)}
                            className="flex-shrink-0 text-red-500 hover:text-red-700 transition-colors"
                            title="Remove this reference number"
                          >
                            <Minus size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Carrier & Trailer Information */}
            <div className="border-b pb-4">
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Carrier & Trailer</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Carrier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="carrier_name"
                    value={formData.carrier_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trailer Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="trailer_number"
                    value={formData.trailer_number}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Destination Information */}
            <div className="border-b pb-4">
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Destination</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination City
                  </label>
                  <input
                    type="text"
                    name="destination_city"
                    value={formData.destination_city}
                    onChange={handleChange}
                    placeholder="e.g., Los Angeles"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination State
                  </label>
                  <input
                    type="text"
                    name="destination_state"
                    value={formData.destination_state}
                    onChange={handleChange}
                    placeholder="e.g., CA"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Any additional information..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Check In'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
