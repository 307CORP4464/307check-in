'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Minus, Clock, Truck, XCircle, Package, Search } from 'lucide-react';
import { isHoliday, getHoliday, todayString } from '@/lib/holidays';

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
  companion_reference: string | null;
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
  badgeBg: string;
  badgeText: string;
};

const getStatusMeta = (status: string): StatusMeta => {
  switch (status) {
    case 'pending':
      return {
        headerBg: 'bg-amber-500',
        headerTitle: 'Submitted - Pending Dock Assignment',
        headerIcon: '',
        bannerBg: 'bg-amber-50', bannerBorder: 'border-amber-300', bannerText: 'text-amber-700',
        bannerIcon: <Clock className="w-5 h-5 text-amber-500" />,
        bannerLabel: 'We are processing your check-in, please note this may take several minutes. Please wait in your truck for this page to update.',
        badgeBg: 'bg-amber-100', badgeText: 'text-amber-700',
      };
    case 'checked_in':
      return {
        headerBg: 'bg-blue-600',
        headerTitle: 'Dock Assigned',
        headerIcon: '✓',
        bannerBg: 'bg-blue-50', bannerBorder: 'border-blue-300', bannerText: 'text-blue-700',
        bannerIcon: <Truck className="w-5 h-5 text-blue-500" />,
        bannerLabel: 'Dock Assigned — Please Proceed',
        badgeBg: 'bg-blue-100', badgeText: 'text-blue-700',
      };
    case 'checked_out':
    case 'complete':
      return {
        headerBg: 'bg-orange-500',
        headerTitle: 'Almost Finished — Waiting to Be Sealed',
        headerIcon: '🟡',
        bannerBg: 'bg-orange-50', bannerBorder: 'border-orange-300', bannerText: 'text-orange-700',
        bannerIcon: <Clock className="w-5 h-5 text-orange-500" />,
        bannerLabel: 'Almost Finished — Waiting to Be Sealed',
        badgeBg: 'bg-orange-100', badgeText: 'text-orange-700',
      };
    case 'rejected':
      return {
        headerBg: 'bg-red-700',
        headerTitle: 'Trailer Rejected',
        headerIcon: '⚠️',
        bannerBg: 'bg-red-50', bannerBorder: 'border-red-400', bannerText: 'text-red-700',
        bannerIcon: <XCircle className="w-5 h-5 text-red-500" />,
        bannerLabel: 'Trailer Rejected',
        badgeBg: 'bg-red-100', badgeText: 'text-red-700',
      };
    case 'check_in_denial':
      return {
        headerBg: 'bg-red-700',
        headerTitle: 'Check-In Denied',
        headerIcon: '✕',
        bannerBg: 'bg-red-50', bannerBorder: 'border-red-400', bannerText: 'text-red-700',
        bannerIcon: <XCircle className="w-5 h-5 text-red-500" />,
        bannerLabel: 'Check-In Denied',
        badgeBg: 'bg-red-100', badgeText: 'text-red-700',
      };
    case 'driver_left':
      return {
        headerBg: 'bg-gray-600',
        headerTitle: 'Check-In Closed — Driver Departed',
        headerIcon: '✓',
        bannerBg: 'bg-gray-50', bannerBorder: 'border-gray-300', bannerText: 'text-gray-700',
        bannerIcon: <Package className="w-5 h-5 text-gray-500" />,
        bannerLabel: 'This check-in has been closed.',
        badgeBg: 'bg-gray-100', badgeText: 'text-gray-600',
      };
    default:
      return {
        headerBg: 'bg-gray-600',
        headerTitle: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        headerIcon: '✓',
        bannerBg: 'bg-gray-50', bannerBorder: 'border-gray-300', bannerText: 'text-gray-700',
        bannerIcon: <Package className="w-5 h-5 text-gray-500" />,
        bannerLabel: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        badgeBg: 'bg-gray-100', badgeText: 'text-gray-700',
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

const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getNextWorkingDay = (from: Date): Date => {
  const next = new Date(from);
  next.setHours(0, 0, 0, 0);
  while (true) {
    next.setDate(next.getDate() + 1);
    const dow = next.getDay();
    if (dow === 0 || dow === 6) continue;
    if (isHoliday(toLocalDateString(next))) continue;
    return next;
  }
};

const getTodayDateTime = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const getNextWorkingDayAt0600 = (): string => {
  const next = getNextWorkingDay(new Date());
  next.setHours(6, 0, 0, 0);
  return new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const getTodayAndNextWorkingDayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const nextWorking = getNextWorkingDay(now);
  const end = new Date(
    nextWorking.getFullYear(), nextWorking.getMonth(), nextWorking.getDate(), 23, 59, 59, 999
  );
  return { start: start.toISOString(), end: end.toISOString() };
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

const getLocalDateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' });

const getTodayLabel = (): string =>
  new Date().toLocaleDateString('en-US', { dateStyle: 'long' });

const getNextWorkingDayButtonLabel = (): string => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowStr = toLocalDateString(tomorrow);
  const tomorrowDow = tomorrow.getDay();

  const isWeekend = tomorrowDow === 0 || tomorrowDow === 6;
  const holiday = getHoliday(tomorrowStr);

  if (holiday) return `🌅 Next Working Day (skip ${holiday.name})`;
  if (isWeekend) return `🌅 Next Working Day (6:00 AM)`;
  return `🌅 Next Working Day (6:00 AM)`;
};

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
  const [pulledIds, setPulledIds] = useState<Set<string>>(new Set());
  const [pullingId, setPullingId] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    const { start, end } = getTodayAndNextWorkingDayRange();
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
    const channel = supabase
      .channel('vision_checkins_range')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () => fetchRecords())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRecords, supabase]);

  const handlePulled = useCallback((id: string) => {
    setPullingId(id);
    setPulledIds(prev => new Set([...prev, id]));
    setPullingId(null);
  }, []);

  if (loading) {
    return (
      <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200 text-center text-sm text-gray-400">
        Loading check-ins...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200 text-center text-sm text-gray-400">
        No Vision check-ins recorded for today or the next working day.
      </div>
    );
  }

  const todayLabel = getTodayLabel();
  const nextWorkingLabel = getLocalDateLabel(getNextWorkingDay(new Date()).toISOString());

  const dayHeading = (dateLabel: string): string => {
    if (dateLabel === todayLabel) return `Today — ${dateLabel}`;
    if (dateLabel === nextWorkingLabel) return `Next Working Day — ${dateLabel}`;
    return dateLabel;
  };

  const activeRecords = records.filter(r => !pulledIds.has(r.id));
  const pulledRecords = records.filter(r => pulledIds.has(r.id));

  const activeGrouped: Record<string, CheckInRecord[]> = {};
  for (const r of activeRecords) {
    const label = getLocalDateLabel(r.check_in_time);
    if (!activeGrouped[label]) activeGrouped[label] = [];
    activeGrouped[label].push(r);
  }

  const renderRecord = (r: CheckInRecord, isPulled = false) => {
    const meta = getStatusMeta(r.status);
    const isCurrentRecord = r.id === currentRecordId;
    const dockDisplay = r.dock_number === 'Ramp' ? 'RAMP' : r.dock_number;
    const canMarkPulled = (r.status === 'complete' || r.status === 'checked_out') && !pulledIds.has(r.id);

    return (
      <div key={r.id} className={`bg-white rounded-lg border-2 p-4 transition-all ${
        isPulled ? 'border-gray-200 opacity-70' :
        isCurrentRecord ? 'border-indigo-400 shadow-md' : 'border-gray-200'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isCurrentRecord && !isPulled && (
                <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-1.5 py-0.5 rounded">You</span>
              )}
              {isPulled && (
                <span className="text-xs bg-green-100 text-green-700 font-medium px-1.5 py-0.5 rounded">✓ Pulled</span>
              )}
            </div>
            <div className="text-xs text-gray-500 space-y-0.5">
              <div><span className="font-medium">Ref:</span> {r.reference_number}</div>
              {r.companion_reference && (
                <div><span className="font-medium">Also:</span> {r.companion_reference}</div>
              )}
              <div>
                <span className="font-medium">Trailer:</span> {r.trailer_number}
                {r.trailer_length ? ` (${r.trailer_length})` : ''} · <span className="capitalize">{r.load_type}</span>
              </div>
              <div><span className="font-medium">Scheduled:</span> {formatDateTime(r.check_in_time)}</div>
              {dockDisplay && <div className="text-blue-700 font-semibold">Dock: {dockDisplay}</div>}
              {r.status === 'rejected' && r.rejection_reasons && r.rejection_reasons.length > 0 && (
                <div className="text-red-600 mt-1">
                  <span className="font-semibold">Rejected:</span> {r.rejection_reasons.join(', ')}
                </div>
              )}
              {r.status === 'check_in_denial' && r.denial_reason && (
                <div className="text-red-600 mt-1">
                  <span className="font-semibold">Denied:</span> {r.denial_reason}
                </div>
              )}
              {r.status_note && <div className="text-gray-600 italic">"{r.status_note}"</div>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${meta.badgeBg} ${meta.badgeText}`}>
              {meta.bannerIcon}
              {meta.bannerLabel}
            </div>
            {canMarkPulled && (
              <button
                onClick={() => handlePulled(r.id)}
                disabled={pullingId === r.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white text-xs font-semibold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Truck className="w-3.5 h-3.5" />
                Trailer Pulled
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Vision Check-Ins ({records.length})
      </h3>

      {Object.entries(activeGrouped).map(([dateLabel, dayRecords]) => (
        <div key={dateLabel} className="mb-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
            {dayHeading(dateLabel)}
          </p>
          <div className="space-y-3">
            {dayRecords.map(r => renderRecord(r, false))}
          </div>
        </div>
      ))}

      {pulledRecords.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-green-200" />
            <p className="text-xs font-bold text-green-600 uppercase tracking-widest px-2 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Pulled ({pulledRecords.length})
            </p>
            <div className="flex-1 h-px bg-green-200" />
          </div>
          <div className="space-y-3">
            {pulledRecords.map(r => renderRecord(r, true))}
          </div>
        </div>
      )}
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
    const fetchFull = async () => {
      const { data } = await supabase
        .from('check_ins')
        .select('*')
        .eq('id', initialRecord.id)
        .single();
      if (data) {
        setRecord(data as CheckInRecord);
        setLastUpdated(new Date());
      }
    };

    const channel = supabase
      .channel(`check_in_${initialRecord.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'check_ins', filter: `id=eq.${initialRecord.id}` },
        () => { fetchFull(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('error');
      });
    return () => { supabase.removeChannel(channel); };
  }, [initialRecord.id, supabase]);

  const status = record.status;
  const meta = getStatusMeta(status);
  const filledRefs = referenceNumbers.filter((r) => r.trim());

  const hasDock = !!record.dock_number;
  const dockDisplay = record.dock_number === 'Ramp' ? 'RAMP' : record.dock_number;
  const dockIsAssigned = hasDock || status === 'checked_in';

  const STATUSES_WITHOUT_INSTRUCTIONS = ['checked_out', 'complete', 'rejected', 'check_in_denial', 'driver_left'];
  const showInstructions = dockIsAssigned && !STATUSES_WITHOUT_INSTRUCTIONS.includes(status);

  const isComplete  = status === 'complete' || status === 'checked_out';
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
          🅿️ <strong>Park in the angled spaces</strong> in front of the office and <strong>wait in your truck.</strong> Your dock assignment will appear below — do not leave this page.
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
      <div className="p-4 bg-green-50 border-2 border-green-400 rounded-lg text-sm text-green-900 space-y-2">
        <p className="font-bold">✅ Next Steps — Please Read Carefully:</p>
        <p><strong>Step 1:</strong> Watch for the dock light to change to <strong>GREEN</strong>.</p>
        <p><strong>Step 2:</strong> Once the light turns green, <strong>come to the office for your paperwork.</strong></p>
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
          <p className="text-white/80 text-sm mt-1">Welcome, {record.driver_name}!</p>
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
          {filledRefs.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Reference(s)</span>
              <div className="text-right max-w-[60%]">
                <span className="font-medium text-gray-800">{filledRefs.join(', ')}</span>
                {record.companion_reference && (
                  <div className="text-xs text-gray-500 mt-0.5">Also: {record.companion_reference}</div>
                )}
              </div>
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
            <span className="text-gray-500">Check-In Time</span>
            <span className="font-medium text-gray-800">{formatTime(record.check_in_time)}</span>
          </div>
        </div>

        {/* Connection indicator */}
        <div className="mx-4 mt-3 mb-4 flex items-center justify-between text-xs text-gray-400">
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

        <div className="px-4 pb-6">
          <button
            onClick={onNewCheckIn}
            className="w-full py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            New Check-In
          </button>
        </div>
      </div>

      <CarrierCheckInList supabase={supabase} currentRecordId={record.id} />
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

  const nextWorkingDayLabel = getNextWorkingDayButtonLabel();
  const nextWorkingDayValue = getNextWorkingDayAt0600();

  const handleScheduledDateTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setScheduledDateTime(value);
    setScheduledDateTimeError(value ? null : 'Please select a scheduled check-in date and time');
  }, []);

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
    setFormData((prev) => ({ ...prev, [name]: name === 'driverPhone' ? formatPhoneNumber(value) : value }));
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
      if (!scheduledDateTime) { setError('Please select a scheduled check-in date and time'); return; }

      const filledRefs = referenceNumbers.map((r) => r.trim()).filter(Boolean);
      if (filledRefs.length === 0) { setError('Please provide at least one reference number'); return; }

      const invalidRef = filledRefs.find((r) => !validateReferenceNumber(r));
      if (invalidRef) { setError(`Reference number "${invalidRef}" has an invalid format`); return; }

      const hasBlankEntry = referenceNumbers.some((r, i) => r.trim() === '' && i < referenceNumbers.length - 1);
      if (hasBlankEntry) { setError('Please fill in all reference number fields or remove empty ones'); return; }

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
          check_in_time: new Date(scheduledDateTime).toISOString(),
          dock_number: null,
          status_note: null,
          appointment_time: null,
          appointment_status: null,
          gross_weight: null,
          is_double_booked: null,
          rejection_reasons: null,
          resolution_action: null,
          denial_reason: null,
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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">

          <div className="bg-indigo-600 text-white p-6">
            <h1 className="text-2xl font-bold">Vision Check-In</h1>
            <p className="text-indigo-100 mt-1">Submit your scheduled arrival</p>
          </div>

          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* Scheduled Arrival */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Scheduled Arrival</h2>
              <div className="flex gap-3 mb-3">
                <button type="button"
                  onClick={() => { setScheduledDateTime(getTodayDateTime()); setScheduledDateTimeError(null); }}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold text-sm transition-all ${
                    scheduledDateTime && scheduledDateTime.slice(0, 10) === getTodayDateTime().slice(0, 10)
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                  }`}>
                  📅 Today
                </button>
                <button type="button"
                  onClick={() => { setScheduledDateTime(nextWorkingDayValue); setScheduledDateTimeError(null); }}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-semibold text-sm transition-all ${
                    scheduledDateTime === nextWorkingDayValue
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                  }`}>
                  {nextWorkingDayLabel}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-In Date & Time <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={scheduledDateTime} onChange={handleScheduledDateTimeChange} required
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${scheduledDateTimeError ? 'border-red-400' : 'border-gray-300'}`} />
                {scheduledDateTimeError && <p className="text-red-500 text-xs mt-1">{scheduledDateTimeError}</p>}
                <p className="text-gray-400 text-xs mt-1">Select the date and time you expect to arrive on-site</p>
              </div>
            </div>

            {/* Driver Information */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Driver Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" name="driverName" value={formData.driverName} onChange={handleInputChange} required placeholder="John"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                  <input type="tel" name="driverPhone" value={formData.driverPhone} onChange={handleInputChange} required placeholder="(555) 555-5555"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* Load Information */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Load Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Load Type <span className="text-red-500">*</span></label>
                  <select name="loadType" value={formData.loadType} onChange={handleInputChange} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="outbound">Outbound Pickup</option>
                    <option value="inbound">Inbound Delivery</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Reference Number(s) <span className="text-red-500">*</span></label>
                    <button type="button" onClick={addReferenceNumber} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors">
                      <Plus size={16} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {referenceNumbers.map((ref, index) => (
                      <div key={index}>
                        <div className="flex items-center gap-2">
                          <input type="text" value={ref} onChange={(e) => handleReferenceChange(index, e.target.value)} required={index === 0}
                            placeholder={index === 0 ? 'e.g., 2xxxxxx or 4xxxxxx' : `Reference #${index + 1}`}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${referenceErrors[index] ? 'border-red-400' : 'border-gray-300'}`} />
                          {index > 0 && (
                            <button type="button" onClick={() => removeReferenceNumber(index)} className="flex-shrink-0 text-red-500 hover:text-red-700 transition-colors">
                              <Minus size={18} />
                            </button>
                          )}
                        </div>
                        {referenceErrors[index] && <p className="text-red-500 text-xs mt-1">{referenceErrors[index]}</p>}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Carrier Name <span className="text-red-500">*</span></label>
                  <input type="text" name="carrierName" value={formData.carrierName} onChange={handleInputChange} required placeholder="e.g., Vision"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trailer Number <span className="text-red-500">*</span></label>
                  <input type="text" name="trailerNumber" value={formData.trailerNumber} onChange={handleInputChange} required placeholder="e.g., TRL-12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trailer Length <span className="text-red-500">*</span></label>
                  <select name="trailerLength" value={formData.trailerLength} onChange={handleInputChange} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {TRAILER_LENGTHS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button type="submit" disabled={loading || !!scheduledDateTimeError}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${loading || scheduledDateTimeError ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}>
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
                <button type="button" onClick={resetForm} className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                  Reset
                </button>
              )}
            </div>

            <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-200">
              <p className="mb-1"><strong>Operating Hours:</strong> Monday – Friday, 7:00 AM – 5:00 PM</p>
              <p>For assistance, contact the shipping office at{' '}
                <a href="tel:+17654742512" className="text-indigo-600 hover:underline">(765) 474-2512</a></p>
            </div>
          </form>
        </div>

        <CarrierCheckInList supabase={supabase} />
      </div>
    </div>
  );
}
