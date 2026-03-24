'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { triggerCheckInEmail } from '@/lib/emailTriggers';
import { Plus, Minus, CheckCircle, Clock, Truck, AlertCircle, Loader2 } from 'lucide-react';

interface FormData {
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  carrierName: string;
  trailerNumber: string;
  trailerLength: string;
  loadType: 'inbound' | 'outbound';
  emailConsent: boolean;
}

interface CheckInRecord {
  id: string;
  driver_name: string;
  driver_phone: string;
  driver_email: string;
  carrier_name: string;
  trailer_number: string;
  reference_number: string;
  load_type: string;
  status: string;
  dock_number: string | null;
  status_note: string | null;
  check_in_time: string;
}

const INITIAL_FORM_DATA: FormData = {
  driverName: '',
  driverPhone: '',
  driverEmail: '',
  carrierName: '',
  trailerNumber: '',
  trailerLength: '',
  loadType: 'outbound',
  emailConsent: false,
};

// SITE CONFIGURATION - Crawfordsville, IN
const SITE_COORDINATES = {
  latitude: 40.37260025266849,
  longitude: -86.82089938420066,
  radiusMeters: 300
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

// Status configuration — extend as needed
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  pending: {
    label: 'Checked In — Awaiting Assignment',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    icon: <Clock className="w-5 h-5 text-amber-500" />,
  },
  dock_assigned: {
    label: 'Dock Assigned',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    icon: <Truck className="w-5 h-5 text-blue-500" />,
  },
  loading: {
    label: 'Loading in Progress',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    icon: <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />,
  },
  unloading: {
    label: 'Unloading in Progress',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    icon: <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />,
  },
  complete: {
    label: 'Load Complete — Ready to Depart',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  on_hold: {
    label: 'On Hold',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
  },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    icon: <Clock className="w-5 h-5 text-gray-500" />,
  };

const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createBrowserClient(url, key);
};

const REFERENCE_NUMBER_PATTERNS = [
  /^2\d{6}$/,
  /^4\d{6}$/,
  /^44\d{8}$/,
  /^48\d{8}$/,
  /^8\d{7}$/,
  /^TLNA-SO-0\d{5}$/,
  /^\d{6}$/,
  /^[A-Za-z]{4}\d{7}$/,
  /^T\d{5}$/
];

const validateReferenceNumber = (value: string): boolean => {
  if (!value) return false;
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  return REFERENCE_NUMBER_PATTERNS.some(pattern => pattern.test(cleaned));
};

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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
  if (day === 0 || day === 6) {
    return { allowed: false, message: 'Check-in is only available Monday through Friday' };
  }
  if (hour < 6) {
    return { allowed: false, message: 'Check-in is not available before 6:00 AM' };
  }
  if (hour >= 17) {
    return { allowed: false, message: 'Check-in is not available after 5:00 PM' };
  }
  return { allowed: true };
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const validateGeofence = (): Promise<{ valid: boolean; message?: string; distance?: number }> => {
  return new Promise((resolve) => {
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
          resolve({ valid: true, distance });
        } else {
          resolve({
            valid: false,
            message: `You must be on-site to check in. You are ${Math.round(distance)} meters away (${Math.round(distance * 3.28084)} feet)`,
            distance
          });
        }
      },
      (error) => {
        let message = 'Unable to verify your location. ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message += 'Please enable location permissions in your browser.'; break;
          case error.POSITION_UNAVAILABLE:
            message += 'Location information is unavailable.'; break;
          case error.TIMEOUT:
            message += 'Location request timed out.'; break;
          default:
            message += 'An unknown error occurred.';
        }
        resolve({ valid: false, message });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};

// ── Real-Time Status Screen ────────────────────────────────────────────────

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
    // Subscribe to real-time changes for this specific check-in row
    const channel = supabase
      .channel(`check_in_status_${initialRecord.id}`)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialRecord.id, supabase]);

  const statusConfig = getStatusConfig(record.status);
  const checkInTime = new Date(record.check_in_time).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-blue-600 text-white p-6 text-center">
          <div className="text-green-300 text-5xl mb-3">✓</div>
          <h2 className="text-2xl font-bold">Checked In</h2>
          <p className="text-blue-100 text-sm mt-1">
            Welcome, {record.driver_name}!
          </p>
        </div>

        {/* Live Status Banner */}
        <div className={`mx-4 mt-4 p-4 rounded-lg border-2 ${statusConfig.bgColor} ${statusConfig.borderColor}`}>
          <div className="flex items-center gap-2 mb-1">
            {statusConfig.icon}
            <span className={`font-semibold text-sm ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>

          {/* Dock Number — prominently shown when assigned */}
          {record.dock_number && (
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Dock Assignment</p>
              <p className="text-4xl font-extrabold text-blue-700">{record.dock_number}</p>
            </div>
          )}

          {/* Optional note from the team */}
          {record.status_note && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Note from Office</p>
              <p className="text-sm text-gray-700">{record.status_note}</p>
            </div>
          )}
        </div>

        {/* Check-in Details */}
        <div className="mx-4 mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-2">
          {referenceNumbers.filter(r => r.trim()).length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Reference(s)</span>
              <span className="font-medium text-gray-800 text-right max-w-[60%]">
                {referenceNumbers.filter(r => r.trim()).join(', ')}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Carrier</span>
            <span className="font-medium text-gray-800">{record.carrier_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Trailer</span>
            <span className="font-medium text-gray-800">{record.trailer_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Load Type</span>
            <span className="font-medium text-gray-800 capitalize">{record.load_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Checked In At</span>
            <span className="font-medium text-gray-800">{checkInTime}</span>
          </div>
        </div>

        {/* Parking instructions */}
        <div className="mx-4 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          🅿️ Please park in the <strong>angled parking spaces</strong> in front of the office until your dock is assigned. Keep this screen open for updates.
        </div>

        {/* Connection status + last updated */}
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
          {lastUpdated && (
            <span>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>

        {/* New check-in button */}
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

// ── Main Form Component ────────────────────────────────────────────────────

export default function DriverCheckInForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(['']);
  const [referenceErrors, setReferenceErrors] = useState<(string | null)[]>([null]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInRecord, setCheckInRecord] = useState<CheckInRecord | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'valid' | 'invalid' | null>(null);
  const [timeRestrictionWarning, setTimeRestrictionWarning] = useState<string | null>(null);

  useEffect(() => {
    const checkTimeRestrictions = () => {
      const timeCheck = isWithinAllowedTime();
      setTimeRestrictionWarning(timeCheck.allowed ? null : (timeCheck.message || 'Check-in not available at this time'));
    };
    checkTimeRestrictions();
    const interval = setInterval(checkTimeRestrictions, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleReferenceChange = useCallback((index: number, value: string) => {
    setReferenceNumbers(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
    setReferenceErrors(prev => {
      const updated = [...prev];
      if (value && !validateReferenceNumber(value)) {
        updated[index] =
          'Invalid format. Must match: 2xxxxxx, 4xxxxxx, 44xxxxxxxx, 48xxxxxxxx, ' +
          '8xxxxxxx, TLNA-SO-0xxxxx or xxxxxx';
      } else {
        updated[index] = null;
      }
      return updated;
    });
  }, []);

  const addReferenceNumber = useCallback(() => {
    setReferenceNumbers(prev => [...prev, '']);
    setReferenceErrors(prev => [...prev, null]);
  }, []);

  const removeReferenceNumber = useCallback((index: number) => {
    setReferenceNumbers(prev => prev.filter((_, i) => i !== index));
    setReferenceErrors(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleInputChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const processedValue = name === 'driverPhone' ? formatPhoneNumber(value) : value;
    setFormData(prev => ({ ...prev, [name]: processedValue }));
    if (name === 'driverEmail') {
      setEmailError(value && !validateEmail(value) ? 'Please enter a valid email address' : null);
    }
  }, []);

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setReferenceNumbers(['']);
    setReferenceErrors([null]);
    setEmailError(null);
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
        setError(timeCheck.message || 'Check-in not available at this time');
        setLoading(false);
        setLocationStatus(null);
        return;
      }

      const geofenceCheck = await validateGeofence();
      if (!geofenceCheck.valid) {
        setError(geofenceCheck.message || 'You must be on-site to check in');
        setLoading(false);
        setLocationStatus('invalid');
        return;
      }
      setLocationStatus('valid');

      if (!validateEmail(formData.driverEmail)) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      if (!formData.emailConsent) {
        setError('You must consent to email communications to proceed');
        setLoading(false);
        return;
      }

      const filledRefs = referenceNumbers.map(r => r.trim()).filter(r => r !== '');

      if (filledRefs.length === 0) {
        setError('Please provide at least one reference number');
        setLoading(false);
        return;
      }

      const invalidRef = filledRefs.find(r => !validateReferenceNumber(r));
      if (invalidRef) {
        setError(`Reference number "${invalidRef}" has an invalid format`);
        setLoading(false);
        return;
      }

      const hasBlankEntry = referenceNumbers.some(
        (r, i) => r.trim() === '' && i < referenceNumbers.length - 1
      );
      if (hasBlankEntry) {
        setError('Please fill in all reference number fields or remove empty ones');
        setLoading(false);
        return;
      }

      const referenceNumberValue = filledRefs.join(', ');

      const { data: checkInData, error: insertError } = await supabase
        .from('check_ins')
        .insert({
          driver_name: formData.driverName,
          driver_phone: formData.driverPhone,
          driver_email: formData.driverEmail,
          carrier_name: formData.carrierName,
          trailer_number: formData.trailerNumber,
          trailer_length: formData.trailerLength || null,
          load_type: formData.loadType,
          reference_number: referenceNumberValue,
          status: 'pending',
          check_in_time: new Date().toISOString(),
          email_consent: formData.emailConsent,
          dock_number: null,
          status_note: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (checkInData && formData.emailConsent && formData.driverEmail) {
        try {
          await triggerCheckInEmail({
            driverName: formData.driverName,
            driverEmail: formData.driverEmail,
            carrierName: formData.carrierName,
            trailerNumber: formData.trailerNumber,
            referenceNumber: referenceNumberValue,
            loadType: formData.loadType,
            checkInTime: new Date().toISOString(),
          });
        } catch (emailErr) {
          console.error('Email trigger failed (non-fatal):', emailErr);
        }
      }

      // Store the full record and switch to status screen
      setCheckInRecord(checkInData as CheckInRecord);

    } catch (err: any) {
      console.error('Driver check-in error:', err);
      setError(err.message || 'Failed to submit check-in. Please try again.');
      setLocationStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Render status screen after successful check-in ─────────────────────

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
          {/* Header */}
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="driverEmail"
                    value={formData.driverEmail}
                    onChange={handleInputChange}
                    required
                    placeholder="driver@example.com"
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${emailError ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  {emailError && <p className="text-red-500 text-xs mt-1">{emailError}</p>}
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
                      title="Add another reference number"
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {referenceNumbers.map((ref, index) => (
                      <div key={index}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ref}
                            onChange={e => handleReferenceChange(index, e.target.value)}
                            required={index === 0}
                            placeholder={index === 0 ? 'e.g., 2xxxxxx or 4xxxxxx or 8xxxxxxx' : `Reference #${index + 1}`}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${referenceErrors[index] ? 'border-red-400' : 'border-gray-300'}`}
                          />
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
                    {TRAILER_LENGTHS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Email Consent */}
            <div className="border-b pb-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="emailConsent"
                  checked={formData.emailConsent}
                  onChange={handleCheckboxChange}
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">
                  I consent to receiving email communications regarding my check-in status,
                  dock assignment, and other relevant updates. <span className="text-red-500">*</span>
                </span>
              </label>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3">
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
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-200">
              <p className="mb-1">
                <strong>Operating Hours:</strong> Monday - Friday, 7:00 AM - 5:00 PM
              </p>
              <p className="mb-1">
                <strong>Location Verification:</strong> You must be on-site to complete check-in
              </p>
              <p>
                For assistance, contact the shipping office at{' '}
                <a href="tel:+17654742512" className="text-blue-600 hover:underline">
                  (765) 474-2512
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
