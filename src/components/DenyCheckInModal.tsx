'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface DenyCheckInModalProps {
  checkIn: {
    id: string;
    driver_name?: string;
    driver_email?: string; // Add email field
    driver_phone?: string;
    reference_number?: string;
    carrier_name?: string;
  };
  onClose: () => void;
  onDeny: () => void;
}

export default function DenyCheckInModal({ checkIn, onClose, onDeny }: DenyCheckInModalProps) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleDeny = async () => {
    if (!notes.trim()) {
      setError('Please provide a reason for denial');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Update check-in status to denied
      const { error: updateError } = await supabase
        .from('check_ins')
        .update({ 
          status: 'denied',
          notes: `DENIED: ${notes}`
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      // Send email to driver
      const emailBody = {
        to: checkIn.driver_email || '',
        driverName: checkIn.driver_name || 'Driver',
        carrierName: checkIn.carrier_name || 'N/A',
        referenceNumber: checkIn.reference_number || 'N/A',
        notes: notes,
        checkInId: checkIn.id
      };

      // Call your email API endpoint
      const emailResponse = await fetch('/api/send-denial-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailBody),
      });

      if (!emailResponse.ok) {
        console.error('Failed to send email, but check-in was denied');
      }

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

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason for Denial <span className="text-red-500">*</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Please provide the reason for denying this check-in..."
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            disabled={isSubmitting}
          />
        </div>

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
