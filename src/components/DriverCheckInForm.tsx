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

const INITIAL_FORM_DATA: FormData = {
  driverName: '',
  driverPhone: '',
  carrierName: '',
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
  icon: React.ReactNode;
}> = {
  pending: {
    label: 'Checked In — Awaiting Assignment',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    headerBg: 'bg-amber-500',
    icon: <Clock className="w-5 h-5 text-amber-500" />,
  },
  dock_assigned: {
    label: 'Dock Assigned — Please Proceed',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    headerBg: 'bg-blue-600',
    icon: <Truck className="w-5 h-5 text-blue-500" />,
  },
  loading: {
    label: 'Loading in Progress',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    headerBg: 'bg-purple-600',
    icon: <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />,
  },
  unloading: {
    label: 'Unloading in Progress',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    headerBg: 'bg-purple-600',
    icon: <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />,
  },
  complete: {
    label: 'Load Complete — Ready to Depart',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    headerBg: 'bg-green-600',
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  on_hold: {
    label: 'On Hold',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    headerBg: 'bg-red-600',
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
  },
  rejected: {
    label: 'Check-In Denied',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    headerBg: 'bg-red-700',
    icon: <XCircle className="w-5 h-5 text-red-500" />,
  },
  check_in_denial: {
    label: 'Check-In Denied',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    headerBg: 'bg-red-700',
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

const isWithinAllowedTime = (): { allowed: boolean; message?: string } => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0 || day === 6)
    return { allowed: false, message: 'Check-in is only available Monday through Friday' };
  if (hour < 6)
    return { allowed: false, message: 'Check-in is not available before 6:00 AM' };
  if (hour >= 17)
    return { allowed: false, message: 'Check-in is not available after 5:00 PM' };
  return { allowed: true };
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const validateGeofence = (): Promise<{ valid: boolean; message?: string }> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ valid: false, message: 'Geolocation is not supported by your device' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const distance = calculateDistance(
          position.coords.latitude,
          position.coords.longitude,
          SITE_COORDINATES.latitude,
          SITE_COORDINATES.longitude
        );
        if (distance <= SITE_COORDINATES.radiusMeters) {
          resolve({ valid: true });
        } else {
          resolve({
            valid: false,
            message: `You must be on-site to check in. You are ${Math.round(distance)}m (${Math.round(distance * 3.28084)} ft) away.`,
          });
        }
      },
      (error) => {
        let message = 'Unable to verify your location. ';
        switch (error.code) {
          case error.PERMISSION_DENIED: message += 'Please enable location permissions in your browser.'; break;
          case error.POSITION_UNAVAILABLE: message += 'Location information is unavailable.'; break;
          case error.TIMEOUT: message += 'Location request timed out.'; break;
          default: message += 'An unknown error occurred.';
        }
        resolve({ valid: false, message });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">

        {/* Header — color shifts with status */}
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

          {/* Dock number — large when assigned */}
          {record.dock_number && (
            <div className="mt-3 text-center py-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Dock Assignment</p>
              <p className="text-5xl font-extrabold text-blue-700">{record.dock_number}</p>
            </div>
          )}

          {/* Appointment time — from dock_assignment email */}
          {record.appointment_time && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Appointment Time</p>
              <p className="text-sm font-medium text-gray-800">{formatDateTime(record.appointment_time)}</p>
            </div>
          )}

          {/* Completion time — from status_change endTime */}
          {isComplete && record.end_time && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Completed At</p>
              <p className="text-sm font-medium text-gray-800">{formatDateTime(record.end_time)}</p>
            </div>
          )}

          {/* Rejection reasons — from check_in_denial / status_change emails */}
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

          {/* Resolution action — correct_and_return / new_trailer */}
          {isDenied && record.resolution_action && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <p className="text-xs text-red-600 uppercase tracking-wide mb-0.5 font-semibold">Required Action</p>
              <p className="text-sm font-medium text-red-800">
                {RESOLUTION_LABELS[record.resolution_action] ?? record.resolution_action}
              </p>
            </div>
          )}

          {/* Notes — maps to status_note / notes field from all email types */}
          {record.status_note && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Note from Office</p>
              <p className="text-sm text-gray-700">{record.status_note}</p>
            </div>
          )}
        </div>

        {/* Check-in details — all fields surfaced in original emails */}
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

        {/* Parking instruction — shown until dock is assigned or denied */}
        {!isDockAssigned && !isComplete && !isDenied && (
          <div className="mx-4 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            🅿️ Park in the <strong>angled spaces</strong> in front of the office. Keep this screen open — your dock will appear here.
          </div>
        )}

        {/* Connection indicator + last updated */}
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
    </div>
  );
}

// ── Main Form ──────────────────────────────────────────────────────────────

export default function DriverCheckInForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(['']);
  const [referenceErrors, setReferenceErrors] = useState<(string | null)[]>([null]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInRecord, setCheckInRecord] = useState<CheckInRecord | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'valid' | 'invalid' | null>(null);
  const [timeRestrictionWarning, setTimeRestrictionWarning] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const t = isWithinAllowedTime();
      setTimeRestrictionWarning(t.allowed ? null : t.message ?? 'Check-in not available at this time');
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
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
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'driverPhone' ? formatPhoneNumber(value) : value,
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setReferenceNumbers(['']);
    setReferenceErrors([null]);
    setError(null);
    setLocationStatus(null);
    setCheckInRecord(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLocationStatus('checking');

    try {
      const timeCheck = isWithinAllowedTime();
      if (!timeCheck.allowed) {
        setError(timeCheck.message ?? 'Check-in not available at this time');
        return;
      }

      const geofenceCheck = await validateGeofence();
      if (!geofenceCheck.valid) {
        setError(geofenceCheck.message ?? 'You must be on-site to check in');
        setLocationStatus('invalid');
        return;
      }
      setLocationStatus('valid');

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
          check_in_time: new Date().toISOString(),
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
      console.error('Driver check-in error:', err);
      setError(err.message || 'Failed to submit check-in. Please try again.');
      setLocationStatus(null);
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

          <div className="bg-blue-600 text-white p-6">
            <h1 className="text-2xl font-bold">Driver Check-In</h1>
            <p className="text-blue-100 mt-1">Please fill out all required fields to check in</p>
          </div>

          {timeRestrictionWarning && (
            <div className="mx-6 mt-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
              ⚠️ {timeRestrictionWarning}
            </div>
          )}

          {locationStatus === 'checking' && (
            <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Verifying your location...
            </div>
          )}

          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
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
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${referenceErrors[index] ? 'border-red-400' : 'border-gray-300'}`}
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
                    placeholder="e.g., J.B. Hunt"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                disabled={loading || !!timeRestrictionWarning}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                  loading || timeRestrictionWarning
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
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
                ) : 'Check In'}
              </button>

              {(formData.driverName || formData.carrierName) && (
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
              <p className="mb-1"><strong>Location Verification:</strong> You must be on-site to complete check-in</p>
              <p>
                For assistance, contact the shipping office at{' '}
                <a href="tel:+17654742512" className="text-blue-600 hover:underline">(765) 474-2512</a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
