'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { triggerCheckInEmail } from '@/lib/emailTriggers';
import { Plus, Minus } from 'lucide-react';

interface FormData {
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  carrierName: string;
  trailerNumber: string;
  trailerLength: string;
  loadType: 'inbound' | 'outbound';
  destinationCity: string;
  destinationState: string;
  emailConsent: boolean;
}

const INITIAL_FORM_DATA: FormData = {
  driverName: '',
  driverPhone: '',
  driverEmail: '',
  carrierName: '',
  trailerNumber: '',
  trailerLength: '',
  loadType: 'inbound',
  destinationCity: '',
  destinationState: '',
  emailConsent: false,
};

// SITE CONFIGURATION - Crawfordsville, IN
const SITE_COORDINATES = {
  latitude: 40.37260025266849,
  longitude: -86.82089938420066,
  radiusMeters: 300
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
] as const;

const TRAILER_LENGTHS = [
  { value: '', label: 'Select trailer length' },
  { value: 'Box', label: 'Box Truck' },
  { value: '20', label: '20 ft' },
  { value: '40', label: '40 ft' },
  { value: '45', label: '45 ft' },
  { value: '48', label: '48 ft' },
  { value: '53', label: '53 ft' },
] as const;

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
  /^[A-Za-z]{4}\d{7}$/
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
        switch(error.code) {
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

export default function DriverCheckInForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);

  // Reference numbers as a separate array — starts with one empty field
  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(['']);
  // Per-field validation errors for reference numbers
  const [referenceErrors, setReferenceErrors] = useState<(string | null)[]>([null]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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

  // ── Reference number handlers ──────────────────────────────────────────────

  const handleReferenceChange = useCallback((index: number, value: string) => {
    setReferenceNumbers(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });

    // Validate the changed field
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

  // ── General input handler ──────────────────────────────────────────────────

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
    setSuccess(false);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setLocationStatus('checking');

    try {
      // Time restriction check
      const timeCheck = isWithinAllowedTime();
      if (!timeCheck.allowed) {
        setError(timeCheck.message || 'Check-in not available at this time');
        setLoading(false);
        setLocationStatus(null);
        return;
      }

      // Geofence check
      const geofenceCheck = await validateGeofence();
      if (!geofenceCheck.valid) {
        setError(geofenceCheck.message || 'You must be on-site to check in');
        setLoading(false);
        setLocationStatus('invalid');
        return;
      }
      setLocationStatus('valid');

      // Email validation
      if (!validateEmail(formData.driverEmail)) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      // Email consent
      if (!formData.emailConsent) {
        setError('You must consent to email communications to proceed');
        setLoading(false);
        return;
      }

      // Build and validate reference numbers
      const filledRefs = referenceNumbers.map(r => r.trim()).filter(r => r !== '');

      if (filledRefs.length === 0) {
        setError('Please provide at least one reference number');
        setLoading(false);
        return;
      }

      // Check all filled refs pass format validation
      const invalidRef = filledRefs.find(r => !validateReferenceNumber(r));
      if (invalidRef) {
        setError(`Reference number "${invalidRef}" has an invalid format`);
        setLoading(false);
        return;
      }

      // Check for any blank intermediate fields
      const hasBlankEntry = referenceNumbers.some(
        (r, i) => r.trim() === '' && i < referenceNumbers.length - 1
      );
      if (hasBlankEntry) {
        setError('Please fill in all reference number fields or remove empty ones');
        setLoading(false);
        return;
      }

      // Join multiple ref numbers comma-separated for DB storage
      const referenceNumberValue = filledRefs.join(', ');

      // Insert check-in record
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
          destination_city: formData.destinationCity || null,
          destination_state: formData.destinationState || null,
          status: 'pending',
          check_in_time: new Date().toISOString(),
          email_consent: formData.emailConsent,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Trigger confirmation email
      if (checkInData && formData.emailConsent && formData.driverEmail) {
        try {
         await triggerCheckInEmail({
  driverName: formData.driverName,
  driverEmail: formData.driverEmail,
  carrierName: formData.carrierName,
  trailerNumber: formData.trailerNumber,
  referenceNumber: referenceNumbers.filter(r => r).join(', '), // or however you handle this
  loadType: formData.loadType,
  checkInTime: new Date().toISOString(), // or however you get this
  destinationCity: formData.destinationCity,   // ← ADD THIS
  destinationState: formData.destinationState, // ← ADD THIS
});

        } catch (emailErr) {
          console.error('Email trigger failed (non-fatal):', emailErr);
        }
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Driver check-in error:', err);
      setError(err.message || 'Failed to submit check-in. Please try again.');
      setLocationStatus(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Check-In Successful!</h2>
          <p className="text-gray-600 mb-2">
            Welcome, {formData.driverName}! You have been checked in successfully.
          </p>
          {referenceNumbers.filter(r => r.trim()).length > 0 && (
            <p className="text-sm text-gray-500 mb-2">
              <span className="font-medium">Reference(s):</span>{' '}
              {referenceNumbers.filter(r => r.trim()).join(', ')}
            </p>
          )}
          <p className="text-gray-600 mb-6">
            Please park in the angled parking spaces in front of the office. 
            {formData.emailConsent && ' A confirmation has been sent to your email.'}
          </p>
          <button
            onClick={resetForm}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Check-In
          </button>
        </div>
      </div>
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

          {/* Time restriction warning */}
          {timeRestrictionWarning && (
            <div className="mx-6 mt-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
              ⚠️ {timeRestrictionWarning}
            </div>
          )}

          {/* Location status indicator */}
          {locationStatus === 'checking' && (
            <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
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

            {/* ── Driver Information ── */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Driver Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="driverName"
                    value={formData.driverName}
                    onChange={handleInputChange}
                    required
                    placeholder="John Smith"
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
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      emailError ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  {emailError && (
                    <p className="text-red-500 text-xs mt-1">{emailError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Load Information ── */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Load Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Load Type */}
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
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </div>

                {/* Reference Numbers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Reference Number(s) <span className="text-red-500">*</span>
                    </label>
                    {/* Plus button to add another ref number field */}
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
                            placeholder={
                              index === 0
                                ? 'e.g., SO12345 or 2xxxxxx'
                                : `Reference #${index + 1}`
                            }
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              referenceErrors[index] ? 'border-red-400' : 'border-gray-300'
                            }`}
                          />
                          {/* Remove button — only on additional fields */}
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
                        {/* Per-field format error */}
                        {referenceErrors[index] && (
                          <p className="text-red-500 text-xs mt-1">{referenceErrors[index]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* ── Carrier & Trailer ── */}
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

            {/* ── Destination ── */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">Destination</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination City
                  </label>
                  <input
                    type="text"
                    name="destinationCity"
                    value={formData.destinationCity}
                    onChange={handleInputChange}
                    placeholder="e.g., Los Angeles"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination State
                  </label>
                  <select
                    name="destinationState"
                    value={formData.destinationState}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select state</option>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Email Consent ── */}
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

            {/* ── Submit ── */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !!timeRestrictionWarning}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                  loading || timeRestrictionWarning || referenceErrors || emailError
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Check In'
                )}
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

            {/* Additional Info */}
            <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-200">
              <p className="mb-1">
                <strong>Operating Hours:</strong> Monday - Friday, 7:00 AM - 5:00 PM
              </p>
              <p className="mb-1">
                <strong>Location Verification:</strong> You must be on-site to complete check-in
              </p>
              <p>
                For assistance, contact the shipping office at{''}
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
