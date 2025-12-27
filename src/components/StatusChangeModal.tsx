'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface StatusChangeModalProps {
  checkIn: {
    id: string;
    pickup_number?: string;
    driver_name?: string;
    start_time?: string | null;
    end_time?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function StatusChangeModal({ checkIn, onClose, onSuccess }: StatusChangeModalProps) {
  const [startTime, setStartTime] = useState(
    checkIn.start_time 
      ? new Date(checkIn.start_time).toISOString().slice(0, 16) 
      : ''
  );
  const [endTime, setEndTime] = useState(
    checkIn.end_time 
      ? new Date(checkIn.end_time).toISOString().slice(0, 16) 
      : ''
  );
  const [statusAction, setStatusAction] = useState<'complete' | 'rejected' | 'turned_away'>('complete');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const startTimeISO = startTime ? new Date(startTime).toISOString() : null;
      const endTimeISO = endTime ? new Date(endTime).toISOString() : null;

      let status = 'checked_out';
      if (statusAction === 'rejected') {
        status = 'rejected';
      } else if (statusAction === 'turned_away') {
        status = 'turned_away';
      }

      const { error: updateError } = await supabase
        .from('check_ins')
        .update({
          start_time: startTimeISO,
          end_time: endTimeISO,
          check_out_time: new Date().toISOString(),
          status: status,
          notes: notes || null,
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Change Status</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">Pickup Number:</p>
          <p className="font-semibold">{checkIn.pickup_number || 'N/A'}</p>
          {checkIn.driver_name && (
            <>
              <p className="text-sm text-gray-600 mt-2">Driver:</p>
              <p className="font-semibold">{checkIn.driver_name}</p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Load Start Time *
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Load End Time *
            </label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Status Action *
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="complete"
                  checked={statusAction === 'complete'}
                  onChange={(e) => setStatusAction(e.target.value as any)}
                  className="mr-2"
                />
                <span>Complete Loading</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="rejected"
                  checked={statusAction === 'rejected'}
                  onChange={(e) => setStatusAction(e.target.value as any)}
                  className="mr-2"
                />
                <span>Rejected</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="turned_away"
                  checked={statusAction === 'turned_away'}
                  onChange={(e) => setStatusAction(e.target.value as any)}
                  className="mr-2"
                />
                <span>Turned Away</span>
              </label>
            </div>
          </div>

          {(statusAction === 'rejected' || statusAction === 'turned_away') && (
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Notes {statusAction !== 'complete' && '*'}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Enter reason for rejection or turning away..."
                required={statusAction !== 'complete'}
              />
            </div>
          )}

          {statusAction === 'complete' && (
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Additional notes..."
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 text-white py-2 rounded-lg font-medium ${
                statusAction === 'complete'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-red-500 hover:bg-red-600'
              } disabled:bg-gray-400`}
            >
              {loading ? 'Updating...' : 
                statusAction === 'complete' ? 'Complete Loading' :
                statusAction === 'rejected' ? 'Mark as Rejected' :
                'Mark as Turned Away'
              }
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
