'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface StatusChangeModalProps {
  checkIn: {
    id: string;
    reference_number?: string;
    driver_name?: string;
    end_time?: string | null;
    status?: string;
    carrier_name?: string;
    trailer_number?: string;
    destination_city?: string;
    destination_state?: string;
    check_in_time?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

type StatusAction = 'complete' | 'rejected' | 'turned_away' | 'driver_left';
type ResolutionAction = 'correct_and_return' | 'new_trailer';
type ModalTab = 'change' | 'undo';

const REJECTION_REASONS = [
  'Evidence of odor',
  'Debris on floor or in corners',
  'Evidence of insect or rodent activity',
  'Previous product residue',
  'Splintered sidewalls, ceiling, or floor that could damage bags',
  'Broken glass or metal shavings',
  'Nails or other objects protruding from the floors or sidewalls',
  'Holes in ceiling, sidewalls or floors',
  'Evidence of leaks, standing water, moisture, mold or mildew',
  'Problems with latches or doors working properly',
  'Unable to seal trailer',
];

const RESOLUTION_OPTIONS: { value: ResolutionAction; label: string; description: string }[] = [
  {
    value: 'correct_and_return',
    label: 'Correct & Return',
    description: 'The trailer can be corrected and the driver may check back in after the issue(s) have been resolved.',
  },
  {
    value: 'new_trailer',
    label: 'New Trailer Required',
    description: 'This trailer will not be loaded. A new, clean trailer must be provided.',
  },
];

// Statuses that are considered "terminal" and can be undone
const UNDOABLE_STATUSES = ['checked_out', 'rejected', 'turned_away', 'driver_left'];

const STATUS_LABELS: Record<string, string> = {
  checked_out: 'Complete',
  rejected: 'Rejected',
  turned_away: 'Turned Away',
  driver_left: 'Driver Left',
};

const STATUS_COLORS: Record<string, string> = {
  checked_out: 'text-green-700 bg-green-100 border-green-300',
  rejected: 'text-red-700 bg-red-100 border-red-300',
  turned_away: 'text-orange-700 bg-orange-100 border-orange-300',
  driver_left: 'text-gray-700 bg-gray-100 border-gray-300',
};

export default function StatusChangeModal({ checkIn, onClose, onSuccess }: StatusChangeModalProps) {
  const canUndo = checkIn.status ? UNDOABLE_STATUSES.includes(checkIn.status) : false;

  const [activeTab, setActiveTab] = useState<ModalTab>('change');
  const [endTime, setEndTime] = useState(
    checkIn.end_time
      ? new Date(checkIn.end_time).toISOString().slice(0, 16)
      : (() => {
          const now = new Date();
          const offset = now.getTimezoneOffset() * 60000;
          return new Date(now.getTime() - offset).toISOString().slice(0, 16);
        })()
  );
  const [statusAction, setStatusAction] = useState<StatusAction>('complete');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rejection-specific state
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [resolutionAction, setResolutionAction] = useState<ResolutionAction | null>(null);

  // Undo state
  const [undoConfirmed, setUndoConfirmed] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const isRejectionValid =
    statusAction !== 'rejected' ||
    (selectedReasons.length > 0 && resolutionAction !== null);

  const isNotesRequired = statusAction === 'turned_away';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (statusAction === 'rejected' && selectedReasons.length === 0) {
      setError('Please select at least one rejection reason.');
      return;
    }
    if (statusAction === 'rejected' && !resolutionAction) {
      setError('Please select what the driver should do next.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endTimeISO = endTime ? new Date(endTime).toISOString() : null;

      let status = 'checked_out';
      if (statusAction === 'rejected') status = 'rejected';
      else if (statusAction === 'turned_away') status = 'turned_away';
      else if (statusAction === 'driver_left') status = 'driver_left';

      const updateData: Record<string, any> = { status };

      if (endTimeISO) updateData.end_time = endTimeISO;

      if (statusAction === 'rejected') {
        updateData.rejection_reasons = selectedReasons;
        updateData.resolution_action = resolutionAction;
        updateData.status_note = notes.trim() || null;
        updateData.denial_reason = null;
      } else if (statusAction === 'turned_away') {
        updateData.denial_reason = notes.trim() || null;
        updateData.status_note = null;
        updateData.rejection_reasons = null;
        updateData.resolution_action = null;
      } else {
        updateData.status_note = notes.trim() || null;
        updateData.rejection_reasons = null;
        updateData.resolution_action = null;
        updateData.denial_reason = null;
      }

      const { data, error: updateError } = await supabase
        .from('check_ins')
        .update(updateData)
        .eq('id', checkIn.id)
        .select();

      if (updateError) throw new Error(`Database error: ${updateError.message}`);
      if (!data || data.length === 0) throw new Error('No rows were updated. Check if the record exists.');

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    setLoading(true);
    setError(null);

    try {
      const updateData: Record<string, any> = {
        status: 'checked_in',
        end_time: null,
        status_note: null,
        rejection_reasons: null,
        resolution_action: null,
        denial_reason: null,
      };

      const { data, error: updateError } = await supabase
        .from('check_ins')
        .update(updateData)
        .eq('id', checkIn.id)
        .select();

      if (updateError) throw new Error(`Database error: ${updateError.message}`);
      if (!data || data.length === 0) throw new Error('No rows were updated. Check if the record exists.');

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error undoing status:', err);
      setError(err instanceof Error ? err.message : 'Failed to undo status change');
    } finally {
      setLoading(false);
    }
  };

  const currentStatusLabel = checkIn.status ? (STATUS_LABELS[checkIn.status] ?? checkIn.status) : 'Unknown';
  const currentStatusColor = checkIn.status ? (STATUS_COLORS[checkIn.status] ?? 'text-gray-700 bg-gray-100 border-gray-300') : '';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-6 my-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Status Management</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          <button
            onClick={() => { setActiveTab('change'); setError(null); setUndoConfirmed(false); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'change'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Change Status
          </button>
          {canUndo && (
            <button
              onClick={() => { setActiveTab('undo'); setError(null); setUndoConfirmed(false); }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'undo'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Undo Status
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Check-in Info */}
        <div className="mb-4 p-3 bg-gray-50 rounded flex gap-6 flex-wrap">
          <div>
            <p className="text-sm text-gray-600">Reference Number:</p>
            <p className="font-semibold">{checkIn.reference_number || 'N/A'}</p>
          </div>
          {checkIn.driver_name && (
            <div>
              <p className="text-sm text-gray-600">Driver:</p>
              <p className="font-semibold">{checkIn.driver_name}</p>
            </div>
          )}
          {checkIn.trailer_number && (
            <div>
              <p className="text-sm text-gray-600">Trailer:</p>
              <p className="font-semibold">{checkIn.trailer_number}</p>
            </div>
          )}
          {checkIn.status && (
            <div>
              <p className="text-sm text-gray-600">Current Status:</p>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${currentStatusColor}`}>
                {currentStatusLabel}
              </span>
            </div>
          )}
        </div>

        {/* ── CHANGE STATUS TAB ── */}
        {activeTab === 'change' && (
          <form onSubmit={handleSubmit}>
            {/* End Time */}
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Load End Time *</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Defaults to current time, click to edit</p>
            </div>

            {/* Status Action */}
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Status Action *</label>
              <div className="flex flex-wrap gap-3">
                {(['complete', 'rejected', 'turned_away', 'driver_left'] as StatusAction[]).map((action) => {
                  const labels: Record<StatusAction, string> = {
                    complete: 'Complete',
                    rejected: 'Rejected',
                    turned_away: 'Turned Away',
                    driver_left: 'Driver Left',
                  };
                  const colors: Record<StatusAction, string> = {
                    complete: 'border-green-500 bg-green-50 text-green-800',
                    rejected: 'border-red-500 bg-red-50 text-red-800',
                    turned_away: 'border-orange-500 bg-orange-50 text-orange-800',
                    driver_left: 'border-gray-400 bg-gray-50 text-gray-700',
                  };
                  const selected = statusAction === action;
                  return (
                    <label
                      key={action}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                        selected ? colors[action] + ' font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        value={action}
                        checked={selected}
                        onChange={(e) => {
                          setStatusAction(e.target.value as StatusAction);
                          setSelectedReasons([]);
                          setResolutionAction(null);
                          setNotes('');
                        }}
                        className="sr-only"
                      />
                      {labels[action]}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ── REJECTION SECTION ── */}
            {statusAction === 'rejected' && (
              <div className="border-2 border-red-200 rounded-lg p-4 mb-4 bg-red-50">
                <h3 className="text-red-800 font-bold text-sm mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Reason(s) for Rejection <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-red-600 mb-3">Select all that apply — these will be shown to the driver on their status screen.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                  {REJECTION_REASONS.map((reason) => {
                    const checked = selectedReasons.includes(reason);
                    return (
                      <label
                        key={reason}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all text-sm ${
                          checked
                            ? 'border-red-400 bg-white text-red-800 font-medium'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-red-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleReason(reason)}
                          className="mt-0.5 accent-red-500 shrink-0"
                        />
                        <span>{reason}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Resolution */}
                <h3 className="text-red-800 font-bold text-sm mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  What Should the Driver Do Next? <span className="text-red-500">*</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {RESOLUTION_OPTIONS.map((opt) => {
                    const selected = resolutionAction === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selected
                            ? opt.value === 'correct_and_return'
                              ? 'border-amber-500 bg-amber-50 text-amber-900'
                              : 'border-red-500 bg-red-100 text-red-900'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="resolutionAction"
                          value={opt.value}
                          checked={selected}
                          onChange={() => setResolutionAction(opt.value)}
                          className="mt-1 shrink-0"
                        />
                        <div>
                          <p className="font-semibold text-sm">{opt.label}</p>
                          <p className="text-xs mt-0.5 leading-relaxed opacity-80">{opt.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                {statusAction === 'rejected' ? 'Additional Notes (Optional)' : 'Notes'}
                {isNotesRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder={
                  statusAction === 'rejected'
                    ? 'Any additional details for the driver (optional)...'
                    : isNotesRequired
                    ? 'Enter reason for turning away...'
                    : 'Additional notes (optional)...'
                }
                required={isNotesRequired}
              />
            </div>

            {/* Rejection Preview */}
            {statusAction === 'rejected' && (selectedReasons.length > 0 || resolutionAction) && (
              <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Driver Will See</p>
                {selectedReasons.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-semibold text-gray-700">Rejection reason(s):</p>
                    <ol className="mt-1 space-y-0.5">
                      {selectedReasons.map((r, i) => (
                        <li key={r} className="text-sm text-gray-600 flex gap-2">
                          <span className="font-bold text-red-500 shrink-0">{i + 1}.</span>
                          {r}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {resolutionAction && (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-gray-700">Required action:</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {resolutionAction === 'correct_and_return'
                        ? 'Correct the issue and return for re-inspection.'
                        : 'Return with a new trailer.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || (statusAction === 'rejected' && !isRejectionValid)}
                className={`flex-1 text-white py-2 rounded-lg font-medium transition-colors ${
                  statusAction === 'complete'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                } disabled:bg-gray-400 disabled:cursor-not-allowed`}
              >
                {loading
                  ? 'Updating...'
                  : statusAction === 'complete'
                  ? 'Mark as Complete'
                  : statusAction === 'rejected'
                  ? 'Mark as Rejected'
                  : statusAction === 'driver_left'
                  ? 'Mark as Driver Left'
                  : 'Mark as Turned Away'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── UNDO STATUS TAB ── */}
        {activeTab === 'undo' && (
          <div>
            {/* What will be undone */}
            <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-amber-800 font-semibold text-sm mb-1">This will undo the current status</p>
                  <p className="text-amber-700 text-sm">
                    The check-in is currently marked as{' '}
                    <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded border ${currentStatusColor}`}>
                      {currentStatusLabel}
                    </span>
                    . Undoing will restore it to <span className="font-semibold">In Progress</span> and return the dock assignment to active.
                  </p>
                </div>
              </div>
            </div>

            {/* What will be cleared */}
            <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fields that will be cleared</p>
              <ul className="space-y-1">
                {[
                  'End time',
                  'Status notes',
                  'Rejection reasons (if any)',
                  'Resolution action (if any)',
                  'Denial reason (if any)',
                ].map((field) => (
                  <li key={field} className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {field}
                  </li>
                ))}
              </ul>
            </div>

            {/* Confirm checkbox */}
            <label className="flex items-start gap-3 mb-5 cursor-pointer group">
              <input
                type="checkbox"
                checked={undoConfirmed}
                onChange={(e) => setUndoConfirmed(e.target.checked)}
                className="mt-0.5 accent-amber-500 w-4 h-4 shrink-0"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                I understand this will restore the check-in to <span className="font-semibold">In Progress</span> and clear all status data.
              </span>
            </label>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleUndo}
                disabled={loading || !undoConfirmed}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                {loading ? 'Restoring...' : 'Undo Status Change'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
