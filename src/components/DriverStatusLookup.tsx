'use client';

import { useState, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { CheckCircle, Clock, Truck, AlertCircle, Loader2, XCircle, Package, Search } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckInRecord {
  id: string;
  driver_name: string;
  driver_phone: string;
  carrier_name: string;
  trailer_number: string;
  trailer_length: string | null;
  reference_number: string;
  load_type: string;
  status: string;
  dock_number: string | null;
  status_note: string | null;
  appointment_time: string | null;
  appointment_status: string | null;
  gross_weight: string | null;
  is_double_booked: boolean | null;
  rejection_reasons: string[] | null;
  resolution_action: 'correct_and_return' | 'new_trailer' | null;
  denial_reason: string | null;
  check_in_time: string;
  end_time: string | null;
}

// Statuses where the driver needs to be able to re-check in
const NON_REDIRECT_STATUSES = [
  'rejected',
  'check_in_denial',
  'driver_left',
  'complete',
];

// ── Helpers ────────────────────────────────────────────────────────────────

const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createBrowserClient(url, key);
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

// Safely format appointment_time — if it's not a real date (e.g. "Work In"), display as-is
const formatAppointmentTime = (value: string): string => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : formatDateTime(value);
};

const clearActiveCheckIn = () => localStorage.removeItem('activeCheckIn');

// ── Status helpers ─────────────────────────────────────────────────────────

type StatusMeta = {
  headerBg: string;
  headerTitle: string;
  headerIcon: string;
  bannerBg: string;
  bannerBorder: string;
  bannerText: string;
  bannerIcon: React.ReactNode;
  bannerLabel: string;
};

const getStatusMeta = (status: string): StatusMeta => {
  switch (status) {
    case 'pending':
      return {
        headerBg: 'bg-amber-500', headerTitle: 'Submitted - Pending Dock Assignment', headerIcon: '',
        bannerBg: 'bg-amber-50', bannerBorder: 'border-amber-300', bannerText: 'text-amber-700',
        bannerIcon: <Clock className="w-5 h-5 text-amber-500" />, bannerLabel: 'We are processing your check-in, this may take several minutes.',
      };
    case 'checked_in':
      return {
        headerBg: 'bg-blue-600', headerTitle: 'Dock Assigned', headerIcon: '✓',
        bannerBg: 'bg-blue-50', bannerBorder: 'border-blue-300', bannerText: 'text-blue-700',
        bannerIcon: <Truck className="w-5 h-5 text-blue-500" />, bannerLabel: 'Dock Assigned — Please Proceed',
      };
    case 'complete':
      return {
        headerBg: 'bg-green-600', headerTitle: 'Load Complete — Ready to Depart', headerIcon: '✓',
        bannerBg: 'bg-green-50', bannerBorder: 'border-green-300', bannerText: 'text-green-700',
        bannerIcon: <CheckCircle className="w-5 h-5 text-green-500" />, bannerLabel: 'Load Complete — Ready to Depart',
      };
    case 'rejected':
      return {
        headerBg: 'bg-red-700', headerTitle: 'Trailer Rejected', headerIcon: '⚠️',
        bannerBg: 'bg-red-50', bannerBorder: 'border-red-400', bannerText: 'text-red-700',
        bannerIcon: <XCircle className="w-5 h-5 text-red-500" />, bannerLabel: 'Trailer Rejected',
      };
    case 'check_in_denial':
      return {
        headerBg: 'bg-red-700', headerTitle: 'Check-In Denied', headerIcon: '✕',
        bannerBg: 'bg-red-50', bannerBorder: 'border-red-400', bannerText: 'text-red-700',
        bannerIcon: <XCircle className="w-5 h-5 text-red-500" />, bannerLabel: 'Check-In Denied',
      };
    case 'driver_left':
      return {
        headerBg: 'bg-gray-600',
        headerTitle: 'Check-In Closed — Driver Departed',
        headerIcon: '✓',
        bannerBg: 'bg-gray-50', bannerBorder: 'border-gray-300', bannerText: 'text-gray-700',
        bannerIcon: <Package className="w-5 h-5 text-gray-500" />,
        bannerLabel: 'This check-in has been closed.',
      };
    default:
      return {
        headerBg: 'bg-gray-600',
        headerTitle: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        headerIcon: '✓',
        bannerBg: 'bg-gray-50', bannerBorder: 'border-gray-300', bannerText: 'text-gray-700',
        bannerIcon: <Package className="w-5 h-5 text-gray-500" />,
        bannerLabel: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      };
  }
};

// ── Load Instructions ──────────────────────────────────────────────────────

function OutboundInstructions() {
  return (
    <div>
      <p className="text-sm font-bold text-blue-700 mb-3">🚚 Loading Instructions:</p>
      <ol className="space-y-2">
        {[
          'Place 2 load bars or straps in your trailer.',
          'Leave your doors closed. We will open inside the building.',
          'Slide your tandems to the back.',
          'Back into the assigned dock once open.',
          'The light will change to red when you are being loaded.',
          'You will receive an update here when your status changes.',
          'When you are done the light will go back to green. You will also receive an update here.',
        ].map((step, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="font-bold text-blue-600 shrink-0">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function InboundInstructions() {
  return (
    <div>
      <p className="text-sm font-bold text-blue-700 mb-3">📦 Unloading Instructions:</p>
      <ol className="space-y-2">
        {[
          'Do NOT cut your seal.',
          'Slide your tandems to the back.',
          'Back into the assigned dock.',
          'The light will turn red when you are being unloaded.',
          'When you are done the light will turn green.',
          'If you need your paperwork signed please bring a copy to the office when you are unloaded.',
        ].map((step, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="font-bold text-blue-600 shrink-0">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Status Screen ──────────────────────────────────────────────────────────

function StatusScreen({
  initialRecord,
  supabase,
  onBack,
}: {
  initialRecord: CheckInRecord;
  supabase: ReturnType<typeof getSupabaseClient>;
  onBack: () => void;
}) {
  const [record, setRecord] = useState<CheckInRecord>(initialRecord);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const fetchFull = async () => {
      const { data } = await supabase
        .from('check_ins')
        .select('*')
        .eq('id', initialRecord.id)
        .single();
      if (data) {
        setRecord(data as CheckInRecord);
        setLastUpdated(new Date());

        if (NON_REDIRECT_STATUSES.includes(data.status)) {
          clearActiveCheckIn();
        }
      }
    };

    const channel = supabase
      .channel(`lookup_${initialRecord.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'check_ins', filter: `id=eq.${initialRecord.id}` },
        (payload) => {
          if (payload.new) {
            setRecord(payload.new as CheckInRecord);
            setLastUpdated(new Date());
          }
          fetchFull();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('error');
      });
    return () => { supabase.removeChannel(channel); };
  }, [initialRecord.id, supabase]);

  const status = record.status;
  const meta = getStatusMeta(status);

  const hasDock = !!record.dock_number;
  const dockDisplay = record.dock_number === 'Ramp' ? 'RAMP' : record.dock_number;
  const dockIsAssigned = hasDock || status === 'checked_in';

  const STATUSES_WITHOUT_INSTRUCTIONS = ['complete', 'rejected', 'check_in_denial', 'driver_left'];
  const showInstructions = dockIsAssigned && !STATUSES_WITHOUT_INSTRUCTIONS.includes(status);

  const isComplete  = status === 'complete';
  const isRejected  = status === 'rejected';
  const isDenied    = status === 'check_in_denial';

  const rejectionReasons: string[] = (() => {
    const raw = record.rejection_reasons;
    if (!raw) return [];
    if (Array.isArray(raw)) return (raw as string[]).filter(Boolean);
    if (typeof raw === 'string') {
      try { return JSON.parse(raw as string); } catch { return [raw as string]; }
    }
    return [];
  })();

  const actionBox = (() => {
    if (status === 'pending' && !hasDock) {
      return (
        <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg text-sm text-yellow-900">
          🅿️ <strong>Park in the angled spaces</strong> in front of the office and <strong>stay with your truck.</strong> Your dock assignment will appear below — do not leave this page.
        </div>
      );
    }
    if (dockIsAssigned && !STATUSES_WITHOUT_INSTRUCTIONS.includes(status)) {
      return (
        <div className="p-4 bg-blue-50 border-2 border-blue-400 rounded-lg text-sm text-blue-900">
          🚛 <strong>Proceed to Dock {dockDisplay}</strong> now. Follow the {record.load_type === 'inbound' ? 'unloading' : 'loading'} instructions below.
        </div>
      );
    }
    if (isComplete) return (
      <div className="p-4 bg-green-50 border-2 border-green-400 rounded-lg text-sm text-green-900">
        ✅ <strong>You are clear to depart.</strong> Come to the office if you need paperwork signed. Safe travels!
      </div>
    );
    if (isRejected) return (
      <div className="p-4 bg-red-50 border-2 border-red-400 rounded-lg text-sm text-red-900">
        ⚠️ <strong>Your trailer has been rejected.</strong> Review the details below and see us in the office if you have questions.
      </div>
    );
    if (isDenied) return (
      <div className="p-4 bg-red-50 border-2 border-red-400 rounded-lg text-sm text-red-900">
        🚫 <strong>Your check-in has been denied.</strong> Please contact the facility for further assistance.
      </div>
    );
    if (status === 'driver_left') return (
      <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-lg text-sm text-gray-800">
        This check-in is no longer active. If you need to check in again, please use the check-in form or see the office.
      </div>
    );
    return null;
  })();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">

        {/* Top banner */}
        <div className="bg-gray-900 text-white px-5 py-4 text-center">
          <p className="text-xl font-extrabold tracking-tight leading-snug">📱 DO NOT CLOSE</p>
          <p className="text-sm text-gray-300 mt-1">Load updates will appear below</p>
          <p className="text-sm text-gray-300 mt-1">You may need to reload page if you do not see an update.</p>
        </div>

        {/* Status header */}
        <div className={`${meta.headerBg} text-white p-6 text-center transition-colors duration-500`}>
          <div className="text-5xl mb-3">{meta.headerIcon}</div>
          <h2 className="text-2xl font-bold">{meta.headerTitle}</h2>
          <p className="text-white/80 text-sm mt-1">Welcome back, {record.driver_name}!</p>
        </div>

        {/* Status banner */}
        <div className={`mx-4 mt-4 p-4 rounded-lg border-2 ${meta.bannerBg} ${meta.bannerBorder} transition-all duration-500`}>
          <div className="flex items-center gap-2">
            {meta.bannerIcon}
            <span className={`font-semibold text-sm ${meta.bannerText}`}>{meta.bannerLabel}</span>
          </div>
          {dockDisplay && (
            <div className="mt-3 text-center py-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Dock Assignment</p>
              <p className="text-5xl font-extrabold text-blue-700">{dockDisplay}</p>
            </div>
          )}
        </div>

        {/* Detail section */}
        <div className="mx-4 mt-3 space-y-3">

          {actionBox}

          {hasDock && record.is_double_booked && (
            <div className="p-4 bg-orange-50 border-2 border-orange-400 rounded-lg">
              <p className="text-sm font-bold text-orange-800 mb-1">⚠️ Important — Please Wait Before Pulling In</p>
              <p className="text-sm text-orange-800">
                This dock is currently occupied by another truck.{' '}
                <strong>Do not pull into the dock until the first truck has fully pulled out.</strong>{' '}
                Once the dock is clear, proceed with your normal instructions below.
              </p>
            </div>
          )}

          {hasDock && record.gross_weight && (
            <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <p className="text-sm font-bold text-orange-700 mb-1">
                ⚖️ Gross Weight: {Number(record.gross_weight).toLocaleString()} lbs
              </p>
              <p className="text-xs text-yellow-900">
                If you have any concerns or disputes regarding this weight, please see us in the office
                before proceeding to your assigned dock. By continuing to the dock you are accepting this weight.
              </p>
            </div>
          )}

          {record.appointment_time && (
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Appointment Time</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800">
                  {formatAppointmentTime(record.appointment_time)}
                </p>
                {record.appointment_status && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    record.appointment_status === 'On Time' ? 'bg-green-100 text-green-700' :
                    record.appointment_status === 'Early'   ? 'bg-blue-100 text-blue-700' :
                    record.appointment_status === 'Late'    ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {record.appointment_status}
                  </span>
                )}
              </div>
            </div>
          )}

          {showInstructions && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              {record.load_type === 'inbound' ? <InboundInstructions /> : <OutboundInstructions />}
            </div>
          )}

          {isComplete && record.end_time && (
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Completed At</p>
              <p className="text-sm font-medium text-gray-800">{formatDateTime(record.end_time)}</p>
            </div>
          )}

          {isRejected && (
            <>
              {rejectionReasons.length > 0 && (
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                  <p className="text-sm font-bold text-red-700 mb-3">
                    ⚠️ Your trailer has been rejected for the following reason(s):
                  </p>
                  <ol className="space-y-2">
                    {rejectionReasons.map((reason, i) => (
                      <li key={i} className="flex gap-2 text-sm text-red-800">
                        <span className="font-bold text-red-500 shrink-0">{i + 1}.</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className={`p-4 rounded-lg border-2 ${
                record.resolution_action === 'new_trailer' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-orange-400'
              }`}>
                <p className={`text-sm font-bold mb-2 ${
                  record.resolution_action === 'new_trailer' ? 'text-red-700' : 'text-orange-700'
                }`}>
                  {record.resolution_action === 'new_trailer' ? '🚫 Important Notice:' : '🔧 What You Need to Do:'}
                </p>
                <p className={`text-sm leading-relaxed ${
                  record.resolution_action === 'new_trailer' ? 'text-red-800' : 'text-orange-800'
                }`}>
                  {record.resolution_action === 'new_trailer'
                    ? 'This trailer will not be loaded under any circumstances. A new, clean trailer that meets our requirements must be provided in order to proceed with this load.'
                    : 'The trailer issues listed above must be corrected before re-entry. Once the trailer has been cleaned and/or repaired to meet our requirements, you may check back in.'}
                </p>
              </div>
              <p className="text-xs text-center text-gray-500 pb-1">If you have questions, please see us in the office.</p>
            </>
          )}

          {isDenied && (
            <>
              {record.denial_reason && (
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                  <p className="text-xs text-red-600 uppercase tracking-wide mb-1 font-semibold">Reason for Denial</p>
                  <p className="text-sm text-red-800">{record.denial_reason}</p>
                </div>
              )}
              <p className="text-sm text-red-700 text-center pb-1">
                Please contact the facility for further assistance or clarification.
              </p>
            </>
          )}

          {record.status_note && (
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Note from Office</p>
              <p className="text-sm text-gray-700">{record.status_note}</p>
            </div>
          )}

        </div>

        {/* Load info summary */}
        <div className="mx-4 mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Reference(s)</span>
            <span className="font-medium text-gray-800 text-right max-w-[60%]">{record.reference_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Load Type</span>
            <span className="font-medium text-gray-800 capitalize">{record.load_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Carrier</span>
            <span className="font-medium text-gray-800">{record.carrier_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Trailer #</span>
            <span className="font-medium text-gray-800">{record.trailer_number}</span>
          </div>
          {record.trailer_length && (
            <div className="flex justify-between">
              <span className="text-gray-500">Trailer Length</span>
              <span className="font-medium text-gray-800">{record.trailer_length}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Check-In Time</span>
            <span className="font-medium text-gray-800">{formatTime(record.check_in_time)}</span>
          </div>
        </div>

        {/* Connection indicator */}
        <div className="mx-4 mt-3 mb-2 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' :
              connectionStatus === 'error'     ? 'bg-red-400' :
              'bg-yellow-400 animate-pulse'
            }`} />
            <span>
              {connectionStatus === 'connected' ? 'Live updates active' :
               connectionStatus === 'error'     ? 'Connection error — refresh page' :
               'Connecting...'}
            </span>
          </div>
          {lastUpdated && <span>Updated {formatTime(lastUpdated.toISOString())}</span>}
        </div>

        <div className="px-4 pb-6 pt-2">
          <button
            onClick={() => {
              clearActiveCheckIn();
              onBack();
            }}
            className="w-full py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Look Up a Different Reference Number
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lookup Form ────────────────────────────────────────────────────────────

export default function DriverStatusLookup() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [refInput, setRefInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CheckInRecord | null>(null);
  const [multipleResults, setMultipleResults] = useState<CheckInRecord[]>([]);

  // ── On mount: auto-load from ?id= query param (set by check-in form) ─────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    const load = async () => {
      setSearching(true);
      try {
        const { data, error: queryError } = await supabase
          .from('check_ins')
          .select('*')
          .eq('id', id)
          .single();

        if (queryError || !data) {
          setError('Could not load your check-in. Please search by reference number below.');
          return;
        }

        setRecord(data as CheckInRecord);
      } catch (err) {
        console.error('Auto-load error:', err);
        setError('Something went wrong. Please search by reference number below.');
      } finally {
        setSearching(false);
      }
    };

    load();
  }, [supabase]);
  // ─────────────────────────────────────────────────────────────────────────

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = refInput.trim().toUpperCase();
    if (!query) return;

    setSearching(true);
    setError(null);
    setRecord(null);
    setMultipleResults([]);

    try {
      const { data, error: queryError } = await supabase
        .from('check_ins')
        .select('*')
        .ilike('reference_number', `%${query}%`)
        .order('check_in_time', { ascending: false })
        .limit(10);

      if (queryError) throw queryError;

      if (!data || data.length === 0) {
        setError('No check-in found for that reference number. Please check the number and try again, or see the office for help.');
        return;
      }

      const recent = data.filter(r => {
        const daysDiff = (Date.now() - new Date(r.check_in_time).getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
      });

      if (recent.length === 0) {
        setError('No active check-in found for that reference number. Check-ins are only shown for the past 7 days.');
        return;
      }

      if (recent.length === 1) {
        setRecord(recent[0] as CheckInRecord);
        return;
      }

      setMultipleResults(recent as CheckInRecord[]);
    } catch (err: any) {
      console.error('Lookup error:', err);
      setError('Something went wrong. Please try again or see the office for help.');
    } finally {
      setSearching(false);
    }
  };

  // Show loading spinner while auto-loading from ?id=
  if (searching && !refInput) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-10 text-center">
          <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-500 text-sm">Loading your check-in status...</p>
        </div>
      </div>
    );
  }

  if (record) {
    return (
      <StatusScreen
        initialRecord={record}
        supabase={supabase}
        onBack={() => {
          setRecord(null);
          setMultipleResults([]);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  if (multipleResults.length > 1) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">
          <div className="bg-blue-600 text-white p-6 text-center">
            <div className="text-4xl mb-2">🔍</div>
            <h2 className="text-xl font-bold">Multiple Results Found</h2>
            <p className="text-blue-100 text-sm mt-1">Select your check-in below</p>
          </div>
          <div className="p-4 space-y-3">
            {multipleResults.map((r) => {
              const meta = getStatusMeta(r.status);
              return (
                <button
                  key={r.id}
                  onClick={() => setRecord(r)}
                  className="w-full text-left p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-800">{r.driver_name}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bannerBg} ${meta.bannerText} border ${meta.bannerBorder}`}>
                      {meta.bannerLabel}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div><span className="font-medium">Ref:</span> {r.reference_number}</div>
                    <div><span className="font-medium">Carrier:</span> {r.carrier_name} · <span className="capitalize">{r.load_type}</span></div>
                    <div><span className="font-medium">Checked in:</span> {formatDateTime(r.check_in_time)}</div>
                    {r.dock_number && <div className="text-blue-700 font-semibold">Dock: {r.dock_number === 'Ramp' ? 'RAMP' : r.dock_number}</div>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => { setMultipleResults([]); setRefInput(''); }}
              className="w-full py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Search Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">

        <div className="bg-blue-600 text-white p-8 text-center">
          <div className="text-5xl mb-3">🔍</div>
          <h1 className="text-2xl font-bold">Check Your Load Status</h1>
          <p className="text-blue-100 mt-2 text-sm">
            Enter your reference number to see your current dock assignment and load status
          </p>
        </div>

        <form onSubmit={handleSearch} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reference Number
            </label>
            <input
              type="text"
              value={refInput}
              onChange={(e) => { setRefInput(e.target.value); setError(null); }}
              placeholder="e.g., 2xxxxxx, 4xxxxxx, 44xxxxxxxx, 48xxxxxxxx, 8xxxxxxx, TLNA-SO-0xxxxx"
              autoFocus
              className="w-full px-4 py-4 text-lg border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center tracking-wider placeholder:text-xs placeholder:tracking-normal"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={searching || !refInput.trim()}
            className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition-all flex items-center justify-center gap-2 ${
              searching || !refInput.trim()
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
            }`}
          >
            {searching ? (
              <>
                <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Searching...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Find My Status
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-400 pt-2">
            Can't find your status? Contact the shipping office at{' '}
            <a href="tel:+17654742512" className="text-blue-600 hover:underline">(765) 474-2512</a>
          </p>
        </form>
      </div>
    </div>
  );
}
