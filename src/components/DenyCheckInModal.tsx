'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface DenyCheckInModalProps {
  checkIn: {
    id: string;
    driver_name?: string;
    driver_email?: string;
    driver_phone?: string;
    reference_number?: string;
    carrier_name?: string;
    appointment_time?: string | null;
  };
  onClose: () => void;
  onDeny: () => void;
}

type DenialOption =
  | 'invalid_number'
  | 'too_early'
  | 'not_from_1403'
  | 'no_appointment'
  | 'other';

const DENIAL_OPTIONS: { value: DenialOption; label: string }[] = [
  { value: 'invalid_number', label: 'Invalid Number' },
  { value: 'too_early', label: 'Too Early' },
  { value: 'not_from_1403', label: 'Not from 1403' },
  { value: 'no_appointment', label: 'No Appointment Scheduled' },
  { value: 'other', label: 'Other' },
];

export default function DenyCheckInModal({ checkIn, onClose, onDeny }: DenyCheckInModalProps) {
  const [selectedOption, setSelectedOption] = useState<DenialOption | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const getPrewrittenMessage = (option: DenialOption): string => {
    const appointmentTime = checkIn.appointment_time
      ? new Date(checkIn.appointment_time).toLocaleString('en-US', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : 'your appointment time';

    const messages: Record<DenialOption, string> = {
      invalid_number:
        'The number you have provided is the correct format however it does not match any orders in the system. Please contact your dispatch for another number and reattempt check in.',
      too_early: `You have attempted to check in too early for your scheduled appointment time, ${appointmentTime}. We do not have docks available currently. Please resubmit the check in form 1 hour before your appointment time.`,
      not_from_1403:
        'The number you have provided is a valid number however it does not ship from this location. Please contact your dispatch.',
      no_appointment:
        'The number you provided is a valid number however this order does not have an appointment scheduled for today. In order to load today you will need to provide the $204 same day loading fee. This can be paid with cash, verifiable check such as EFS or Comchek, or Venmo. Please see us in the office once you have the payment ready.',
      other: customMessage,
    };

    return messages[option];
  };

  const handleDeny = async () => {
    if (!selectedOption) {
      setError('Please select a reason for denial');
      return;
    }

    if (selectedOption === 'other' && !customMessage.trim()) {
      setError('Please provide a custom message for the denial reason');
      return;
    }

    const denialMessage = getPrewrittenMessage(selectedOption);

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('check_ins')
        .update({
          status: 'check_in_denial',   // matches getStatusMeta in driver screen
          denial_reason: denialMessage, // field the driver screen reads
          end_time: new Date().toISOString(),
          // clear any rejection fields so old data doesn't bleed through
          rejection_reasons: null,
          resolution_action: null,
          status_note: null,
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      onDeny();
      onClose();
    } catch (err) {
      console.error('Error denying check-in:', err);
      setError('Failed to deny check-in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Deny Check-in</h2>

        {/* Driver Info */}
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">
            <strong>Driver:</strong> {checkIn.driver_name || 'N/A'}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Reference:</strong> {checkIn.reference_number || 'N/A'}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Carrier:</strong> {checkIn.carrier_name || 'N/A'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Denial Reason Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason for Denial <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col gap-2">
            {DENIAL_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                  selectedOption === option.value
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="denialReason"
                  value={option.value}
                  checked={selectedOption === option.value}
                  onChange={() => {
                    setSelectedOption(option.value);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="accent-red-600"
                />
                <span className="text-sm font-medium text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Message Preview — shown for all preset options */}
        {selectedOption && selectedOption !== 'other' && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">
              Message shown to driver:
            </p>
            <p className="text-sm text-blue-800 italic leading-relaxed">
              {getPrewrittenMessage(selectedOption)}
            </p>
          </div>
        )}

        {/* Custom Message Box — shown only for "Other" */}
        {selectedOption === 'other' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => {
                setCustomMessage(e.target.value);
                setError(null);
              }}
              placeholder="Type your custom denial message here. This will be shown directly to the driver..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm"
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDeny}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Denying...' : 'Deny Check-in'}
          </button>
        </div>
      </div>
    </div>
  );
}
