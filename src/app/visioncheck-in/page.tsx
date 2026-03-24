'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Minus, CheckCircle, Clock, Truck, AlertCircle, Loader2, XCircle, Package } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface FormData {
  driverName: string;
  driverPhone: string;
  carrierName: string;
  trailerNumber: string;
  trailerLength: string;
  loadType: 'inbound' | 'outbound';
}

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
  rejection_reasons: string[] | null;
  resolution_action: 'correct_and_return' | 'new_trailer' | null;
  check_in_time: string;
  end_time: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CARRIER_NAME = 'Vision';

const INITIAL_FORM_DATA: FormData = {
  driverName: 'Alex',
  driverPhone: '(815) 216-3975',
  carrierName: CARRIER_NAME,
  trailerNumber: '',
  trailerLength: '',
  loadType: 'outbound',
};

const SITE_COORDINATES = {
  latitude: 40.37260025266849,
  longitude: -86.82089938420066,
  radiusMeters: 300,
};

const TRAILER_LENGTHS = [
  { value: '', label: 'Select trailer length' },
  { value: 'Box/Van', label: 'Box Truck or Van' },
  { value: '20', label: '20 ft' },
  { value: '40', label: '40 ft' },
  { value: '45', label: '45 ft' },
  { value: '48', label: '48 ft' },
  { value: '53', label: '53 ft' },
] as const;

const REFERENCE_NUMBER_PATTERNS = [
  /^2\d{6}$/,
  /^4\d{6}$/,
  /^44\d{8}$/,
  /^48\d{8}$/,
  /^8\d{7}$/,
  /^TLNA-SO-0\d{5}$/,
  /^\d{6}$/,
  /^[A-Za-z]{4}\d{7}$/,
  /^T\d{5}$/,
];

// ── Status configuration ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  headerBg: string;
  badgeBg: string;
  badgeText: string;
  icon: React.ReactNode;
}> = {
  pending: {
    label: 'Awaiting Assignment',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    headerBg: 'bg-amber-500',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
    icon: <Clock className="w-5 h-5 text-amber-500" />,
  },
  dock_assigned: {
    label: 'Dock Assigned',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    headerBg: 'bg-blue-600',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
    icon: <Truck className="w-5 h-5 text-blue-500" />,
  },
  loading: {
    label: 'Loading',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    headerBg: 'bg-purple-600',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-700',
    icon: <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />,
  },
  unloading: {
    label: 'Unloading',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    headerBg: 'bg-purple-600',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-700',
    icon: <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />,
  },
  complete: {
    label: 'Complete',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    headerBg: 'bg-green-600',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  on_hold: {
    label: 'On Hold',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    headerBg: 'bg-red-600',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
  },
  rejected: {
    label: 'Denied',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    headerBg: 'bg-red-700',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    icon: <XCircle className="w-5 h-5 text-red-500" />,
  },
  check_in_denial: {
    label: 'Denied',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    headerBg: 'bg-red-700',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    icon: <XCircle className="w-5 h-5 text-red-500" />,
  },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    headerBg: 'bg-gray-600',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-700',
    icon: <Package className="w-5 h-5 text-gray-500" />,
  };

const RESOLUTION_LABELS: Record<string, string> = {
  correct_and_return: 'Correct the issue and return for re-inspection',
  new_trailer: 'Return with a new trailer',
};

// ── Helpers ────────────────────────────────────────────────────────────────

const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createBrowserClient(url, key);
};

const validateReferenceNumber = (value: string): boolean => {
  if (!value) return false;
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  return REFERENCE_NUMBER_PATTERNS.some((p) => p.test(cleaned));
};

const formatPhoneNumber = (value: string): string => {
  const cleaned = value.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (!match) return value;
  const [, areaCode, prefix, lineNumber] = match;
  if (lineNumber) return `(${areaCode}) ${prefix}-${lineNumber}`;
  if (prefix) return `(${areaCode}) ${prefix}`;
  if (areaCode) return `(${areaCode}`;
  return value;
};

const getTodayDateTime = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

const getNextWorkingDayAt0600 = (): string => {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  if (next.getDay() === 6) next.setDate(next.getDate() + 2);
  if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  next.setHours(6, 0, 0, 0);
  const offset = next.getTimezoneOffset() * 60000;
  return new Date(next.getTime() - offset).toISOString().slice(0, 16);
};

/** Returns today's date boundaries in UTC for Supabase range query */
const getTodayUTCRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

// ── Carrier Daily Check-In List ────────────────────────────────────────────

function CarrierCheckInList({
  supabase,
  currentRecordId,
}: {
  supabase: ReturnType<typeof getSupabaseClient>;
  currentRecordId?: string;
}) {
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    const { start, end } = getTodayUTCRange();
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .ilike('carrier_name', CARRIER_NAME)
      .gte('check_in_time', start)
      .lte('check_in_time', end)
      .order('check_in_time', { ascending: true });

    if (!error && data) setRecords(data as CheckInRecord[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchRecords();

    // Subscribe to any changes for Vision check-ins today
    const channel = supabase
      .channel('vision_checkins_today')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins' },
        () => { fetchRecords(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchRecords, supabase]);

  if (loading) {
    return (
      <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200 text-center text-sm text-gray-400">
        Loading today's check-ins...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200 text-center text-sm text-gray-400">
        No Vision check-ins recorded today yet.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Today's Vision Check-Ins ({records.length})
      </h3>
      <div className="space-y-3">
        {records.map((r) => {
          const cfg = getStatusConfig(r.status);
          const isCurrentRecord = r.id === currentRecordId;
          return (
            <div
              key={r.id}
              className={`bg-white rounded-lg border-2 p-4 transition-all ${
                isCurrentRecord ? 'border-indigo-400 shadow-md' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800 truncate">{r.driver_name}</span>
                    {isCurrentRecord && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>
                      <span className="font-medium">Ref:</span> {r.reference_number}
                    </div>
                    <div>
                      <span className="font-medium">Trailer:</span> {r.trailer_number}
                      {r.trailer_length ? ` (${r.trailer_length})` : ''}
                      {' · '}
                      <span className="capitalize">{r.load_type}</span>
                    </div>
                    <div>
                      <span className="font-medium">Checked in:</span> {formatTime(r.check_in_time)}
                    </div>
                    {r.dock_number && (
                      <div className="text-blue-700 font-semibold">
                        Dock: {r.dock_number}
                      </div>
                    )}
                    {r.status_note && (
                      <div className="text-gray-600 italic">"{r.status_note}"</div>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${cfg.badgeBg} ${cfg.badgeText}`}>
                  {cfg.icon}
                  {cfg.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status Screen ──────────────────────────────────────────────────────────

function StatusScreen({
  initialRecord,
  referenceNumbers,
  supabase,
  onNewCheckIn,
}: {
  initialRecord: CheckInRecord;
  referenceNumbers: string[];
  supabase: ReturnType<typeof getSupabaseClient>;
  onNewCheckIn: () => void;
}) {
  const [record, setRecord] = useState<CheckInRecord>(initialRecord);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const channel = supabase
      .channel(`check_in_${initialRecord.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'check_ins',
          filter: `id=eq.${initialRecord.id}`,
        },
        (payload) => {
          setRecord(payload.new as CheckInRecord);
          setLastUpdated(new Date());
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('error');
      });

    return () => { supabase.removeChannel(channel); };
  }, [initialRecord.id, supabase]);

  const cfg = getStatusConfig(record.status);
  const isDenied = record.status === 'rejected' || record.status === 'check_in_denial';
  const isComplete = record.status === 'complete';
  const isDockAssigned = record.status === 'dock_assigned';
  const filledRefs = referenceNumbers.filter((r) => r.trim());

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-0">

        {/* Status card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">

          {/* Header */}
          <div className={`${cfg.headerBg} text-white p-6 text-center transition-colors duration-500`}>
            <div className="text-5xl mb-3">{isDenied ? '✕' : '✓'}</div>
            <h2 className="text-2xl font-bold">{isDenied ? 'Check-In Denied' : 'Checked In'}</h2>
            <p className="text-white/80 text-sm mt-1">Welcome, {record.driver_name}!</p>
          </div>

          {/* Live Status Banner */}
          <div className={`mx-4 mt-4 p-4 rounded-lg border-2 ${cfg.bgColor} ${cfg.borderColor} transition-all duration-500`}>
            <div className="flex items-center gap-2">
              {cfg.icon}
              <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
            </div>

            {record.dock_number && (
              <div className="mt-3 text-center py-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Dock Assignment</p>
                <p className="text-5xl font-extrabold text-blue-700">{record.dock_number}</p>
              </div>
            )}

            {record.appointment_time && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Appointment Time</p>
                <p className="text-sm font-medium text-gray-800">{formatDateTime(record.appointment_time)}</p>
              </div>
            )}

            {isComplete && record.end_time && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Completed At</p>
                <p className="text-sm font-medium text-gray-800">{formatDateTime(record.end_time)}</p>
              </div>
            )}

            {isDenied && record.rejection_reasons && record.rejection_reasons.length > 0 && (
              <div className="mt-3 pt-3 border-t border-red-200">
                <p className="text-xs text-red-600 uppercase tracking-wide mb-1 font-semibold">Reason(s) for Denial</p>
                <ul className="space-y-1">
                  {record.rejection_reasons.map((reason, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                      <span className="mt-0.5 text-red-400">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isDenied && record.resolution_action && (
              <div className="mt-3 pt-3 border-t border-red-200">
                <p className="text-xs text-red-600 uppercase tracking-wide mb-0.5 font-semibold">Required Action</p>
                <p className="text-sm font-medium text-red-800">
                  {RESOLUTION_LABELS[record.resolution_action] ?? record.resolution_action}
                </p>
              </div>
            )}

            {record.status_note && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Note from Office</p>
                <p className="text-sm text-gray-700">{record.status_note}</p>
              </div>
            )}
          </div>

          {/* Check-in details */}
          <div className="mx-4 mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-2">
            {filledRefs.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Reference(s)</span>
                <span className="font-medium text-gray-800 text-right max-w-[60%]">{filledRefs.join(', ')}</span>
              </div>
            )}
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
              <span className="text-gray-500">Checked In At</span>
              <span className="font-medium text-gray-800">{formatTime(record.check_in_time)}</span>
            </div>
          </div>

          {!isDockAssigned && !isComplete && !isDenied && (
            <div className="mx-4 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              🅿️ Park in the <strong>angled spaces</strong> in front of the office. Keep this screen open — your dock will appear here.
            </div>
          )}

          {/* Connection indicator */}
          <div className="mx-4 mt-3 mb-4 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' :
                connectionStatus === 'error' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
              }`} />
              <span>
                {connectionStatus === 'connected' ? 'Live updates active' :
                 connectionStatus === 'error' ? 'Connection error — refresh page' :
                 'Connecting...'}
              </span>
            </div>
            {lastUpdated && <span>Updated {formatTime(lastUpdated.toISOString())}</span>}
          </div>

          <div className="px-4 pb-6">
            <button
              onClick={onNewCheckIn}
              className="w-full py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              New Check-In
            </button>
          </div>
        </div>

        {/* Today's Vision check-ins below the status card */}
        <CarrierCheckInList supabase={supabase} currentRecordId={record.id} />

      </div>
    </div>
  );
}

// ── Main Form ──────────────────────────────────────────────────────────────

export default function CarrierEarlyCheckInForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [scheduledDateTimeError, setScheduledDateTimeError] = useState<string | null>(null);
  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(['']);
  const [referenceErrors, setReferenceErrors] = useState<(string | null)[]>([null]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInRecord, setCheckInRecord] = useState<CheckInRecord | null>(null);

  const handleScheduledDateTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setScheduledDateTime(value);
      setScheduledDateTimeError(value ? null : 'Please select a scheduled check-in date and time');
    },
    []
  );

  const handleReferenceChange = useCallback((index: number, value: string) => {
    setReferenceNumbers((prev) => { const u = [...prev]; u[index] = value; return u; });
    setReferenceErrors((prev) => {
      const u = [...prev];
      u[index] = value && !validateReferenceNumber(value)
        ? 'Invalid format. Must match: 2xxxxxx, 4xxxxxx, 44xxxxxxxx, 48xxxxxxxx, 8xxxxxxx, TLNA-SO-0xxxxx or xxxxxx'
        : null;
      return u;
    });
  }, []);

  const addReferenceNumber = useCallback(() => {
    setReferenceNumbers((p) => [...p, '']);
    setReferenceErrors((p) => [...p, null]);
  }, []);

  const removeReferenceNumber = useCallback((index: number) => {
    setReferenceNumbers((p) => p.filter((_, i) => i !== index));
    setReferenceErrors((p) => p.filter((_, i) => i !== index));
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'driverPhone' ? formatPhoneNumber(value) : value,
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setReferenceNumbers(['']);
    setReferenceErrors([null]);
    setScheduledDateTime('');
    setScheduledDateTimeError(null);
    setError(null);
    setCheckInRecord(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!scheduledDateTime) {
        setError('Please select a scheduled check-in date and time');
        return;
      }

      const filledRefs = referenceNumbers.map((r) => r.trim()).filter(Boolean);
      if (filledRefs.length === 0) { setError('Please provide at least one reference number'); return; }

      const invalidRef = filledRefs.find((r) => !validateReferenceNumber(r));
      if (invalidRef) { setError(`Reference number "${invalidRef}" has an invalid format`); return; }

      const hasBlankEntry = referenceNumbers.some((r, i) => r.trim() === '' && i < referenceNumbers.length - 1);
      if (hasBlankEntry) { setError('Please fill in all reference number fields or remove empty ones'); return; }

      const scheduledDate = new Date(scheduledDateTime);

      const { data: checkInData, error: insertError } = await supabase
        .from('check_ins')
        .insert({
          driver_name: formData.driverName,
          driver_phone: formData.driverPhone,
          carrier_name: formData.carrierName,
          trailer_number: formData.trailerNumber,
          trailer_length: formData.trailerLength || null,
          load_type: formData.loadType,
          reference_number: filledRefs.join(', '),
          status: 'pending',
          check_in_time: scheduledDate.toISOString(),
          dock_number: null,
          status_note: null,
          appointment_time: null,
          rejection_reasons: null,
          resolution_action: null,
          end_time: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setCheckInRecord(checkInData as CheckInRecord);
    } catch (err: any) {
      console.error('Early check-in error:', err);
      setError(err.message || 'Failed to submit check-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render status screen after check-in ───────────────────────────────────

  if (checkInRecord) {
    return (
      <StatusScreen
        initialRecord={checkInRecord}
        referenceNumbers={referenceNumbers}
        supabase={supabase}
        onNewCheckIn={resetForm}
      />
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">

          <div className="bg-indigo-600 text-white p-6">
            <h1 className="text-2xl font-bold">Vision Check-In</h1>
            <p className="text-indigo-100 mt-1">Submit your scheduled arrival</p>
          </div>

          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* Scheduled Arrival */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Scheduled Arrival</h2>

              <div className="flex gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => { setScheduledDateTime(getTodayDateTime()); setScheduledDateTimeError(null); }}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold text-sm transition-all ${
                    scheduledDateTime && scheduledDateTime.slice(0, 10) === getTodayDateTime().slice(0, 10)
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  📅 Today
                </button>
                <button
                  type="button"
                  onClick={() => { setScheduledDateTime(getNextWorkingDayAt0600()); setScheduledDateTimeError(null); }}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold text-sm transition-all ${
                    scheduledDateTime === getNextWorkingDayAt0600()
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  🌅 Tomorrow (6:00 AM)
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Check-In Date & Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={handleScheduledDateTimeChange}
                  required
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    scheduledDateTimeError ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {scheduledDateTimeError && (
                  <p className="text-red-500 text-xs mt-1">{scheduledDateTimeError}</p>
                )}
                <p className="text-gray-400 text-xs mt-1">
                  Select the date and time you expect to arrive on-site
                </p>
              </div>
            </div>

            {/* Driver Information */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Driver Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="driverName"
                    value={formData.driverName}
                    onChange={handleInputChange}
                    required
                    placeholder="John"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="driverPhone"
                    value={formData.driverPhone}
                    onChange={handleInputChange}
                    required
                    placeholder="(555) 555-5555"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Load Information */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Load Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Load Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="loadType"
                    value={formData.loadType}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="outbound">Outbound Pickup</option>
                    <option value="inbound">Inbound Delivery</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Reference Number(s) <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addReferenceNumber}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {referenceNumbers.map((ref, index) => (
                      <div key={index}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ref}
                            onChange={(e) => handleReferenceChange(index, e.target.value)}
                            required={index === 0}
                            placeholder={index === 0 ? 'e.g., 2xxxxxx or 4xxxxxx' : `Reference #${index + 1}`}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${referenceErrors[index] ? 'border-red-400' : 'border-gray-300'}`}
                          />
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => removeReferenceNumber(index)}
                              className="flex-shrink-0 text-red-500 hover:text-red-700 transition-colors"
                            >
                              <Minus size={18} />
                            </button>
                          )}
                        </div>
                        {referenceErrors[index] && (
                          <p className="text-red-500 text-xs mt-1">{referenceErrors[index]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Carrier & Trailer */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Carrier & Trailer</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Carrier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="carrierName"
                    value={formData.carrierName}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g., Vision"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trailer Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="trailerNumber"
                    value={formData.trailerNumber}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g., TRL-12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trailer Length <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="trailerLength"
                    value={formData.trailerLength}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {TRAILER_LENGTHS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || !!scheduledDateTimeError}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                  loading || scheduledDateTimeError
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : 'Submit Check-In'}
              </button>

              {(formData.trailerNumber || referenceNumbers[0]) && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-200">
              <p className="mb-1"><strong>Operating Hours:</strong> Monday – Friday, 7:00 AM – 5:00 PM</p>
              <p>
                For assistance, contact the shipping office at{' '}
                <a href="tel:+17654742512" className="text-indigo-600 hover:underline">(765) 474-2512</a>
              </p>
            </div>
          </form>
        </div>

        {/* Show today's Vision check-ins below the form too */}
        <CarrierCheckInList supabase={supabase} />

      </div>
    </div>
  );
}
