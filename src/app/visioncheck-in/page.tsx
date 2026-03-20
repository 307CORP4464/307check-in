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
  emailConsent: boolean;
}

const INITIAL_FORM_DATA: FormData = {
  driverName: 'Alex',
  driverPhone: '(815) 216-3975',
  driverEmail: 'alexmiller11774@gmail.com',
  carrierName: 'Vision',
  trailerNumber: '',
  trailerLength: '',
  loadType: 'outbound',
  emailConsent: false,
};

const TRAILER_LENGTHS = [
  { value: '', label: 'Select trailer length' },
  { value: '20', label: '20 ft' },
  { value: '40', label: '40 ft' },
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
  /^[A-Za-z]{4}\d{7}$/,
  /^T\d{5}$/,
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

/** Returns the local datetime string for <input type="datetime-local"> minimum (now) */
const getMinDateTime = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

/** Returns a datetime-local string for right now (today button) */
const getTodayDateTime = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
};

/** Returns a datetime-local string for next working day at 06:00 local time */
const getNextWorkingDayAt0600 = (): string => {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  // Skip Saturday (6) → Monday, skip Sunday (0) → Monday
  if (next.getDay() === 6) next.setDate(next.getDate() + 2);
  if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  next.setHours(6, 0, 0, 0);
  const offset = next.getTimezoneOffset() * 60000;
  return new Date(next.getTime() - offset).toISOString().slice(0, 16);
};

export default function CarrierEarlyCheckInForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);

  // Scheduled check-in date/time (ISO string from datetime-local input)
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [scheduledDateTimeError, setScheduledDateTimeError] = useState<string | null>(null);

  // Reference numbers
  const [referenceNumbers, setReferenceNumbers] = useState<string[]>(['']);
  const [referenceErrors, setReferenceErrors] = useState<(string | null)[]>([null]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // ── Scheduled date/time handler ────────────────────────────────────────────

  const handleScheduledDateTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setScheduledDateTime(value);

      if (!value) {
        setScheduledDateTimeError('Please select a scheduled check-in date and time');
        return;
      }

      const selected = new Date(value);
      const now = new Date();

      if (selected <= now) {
        setScheduledDateTimeError('Scheduled check-in must be in the future');
      } else {
        setScheduledDateTimeError(null);
      }
    },
    []
  );

  // ── Reference number handlers ──────────────────────────────────────────────

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

  // ── General input handler ──────────────────────────────────────────────────

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      const processedValue = name === 'driverPhone' ? formatPhoneNumber(value) : value;
      setFormData(prev => ({ ...prev, [name]: processedValue }));

      if (name === 'driverEmail') {
        setEmailError(
          value && !validateEmail(value) ? 'Please enter a valid email address' : null
        );
      }
    },
    []
  );

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA); // restores Alex's prefilled info
    setReferenceNumbers(['']);
    setReferenceErrors([null]);
    setScheduledDateTime('');
    setScheduledDateTimeError(null);
    setEmailError(null);
    setError(null);
    setSuccess(false);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Scheduled date/time validation
      if (!scheduledDateTime) {
        setError('Please select a scheduled check-in date and time');
        setLoading(false);
        return;
      }

      const scheduledDate = new Date(scheduledDateTime);
      if (scheduledDate <= new Date()) {
        setError('Scheduled check-in must be in the future');
        setLoading(false);
        return;
      }

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

      // Reference numbers
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

      // Insert early check-in record
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
          status: 'early_check_in',
          check_in_time: scheduledDate.toISOString(),
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
            referenceNumber: referenceNumbers.filter(r => r).join(', '),
            loadType: formData.loadType,
            checkInTime: scheduledDate.toISOString(),
          });
        } catch (emailErr) {
          console.error('Email trigger failed (non-fatal):', emailErr);
        }
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Early check-in error:', err);
      setError(err.message || 'Failed to submit early check-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    const displayDate = scheduledDateTime
      ? new Date(scheduledDateTime).toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Check-In Submitted!</h2>
          <p className="text-gray-600 mb-2">
            Thank you, {formData.driverName}! Your check-in has been recorded.
          </p>
          {displayDate && (
            <p className="text-sm text-blue-700 font-medium bg-blue-50 rounded px-3 py-2 mb-2">
              Scheduled Arrival: {displayDate}
            </p>
          )}
          {referenceNumbers.filter(r => r.trim()).length > 0 && (
            <p className="text-sm text-gray-500 mb-2">
              <span className="font-medium">Reference(s):</span>{' '}
              {referenceNumbers.filter(r => r.trim()).join(', ')}
            </p>
          )}
          <p className="text-gray-600 mb-6">
            The shipping team has been notified of your scheduled arrival.
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
          <div className="bg-indigo-600 text-white p-6">
            <h1 className="text-2xl font-bold">Alex Check-In</h1>
            <p className="text-indigo-100 mt-1">
             Same day and early check-in.
            </p>
          </div>

          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* ── Scheduled Check-In Date & Time ── */}
            <div className="border-b pb-5">
              <h2 className="text-lg font-semibold text-gray-700 mb-4">
                Scheduled Arrival
              </h2>

              {/* Quick-select buttons */}
              <div className="flex gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    const val = getTodayDateTime();
                    setScheduledDateTime(val);
                    setScheduledDateTimeError(null);
                  }}
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
                  onClick={() => {
                    const val = getNextWorkingDayAt0600();
                    setScheduledDateTime(val);
                    setScheduledDateTimeError(null);
                  }}
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
                  min={getMinDateTime()}
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

            {/* ── Driver Information ── */}
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
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="outbound">Outbound Pickup</option>
                    <option value="inbound">Inbound Delivery</option>
                  </select>
                </div>

                {/* Reference Numbers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Reference Number(s) <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addReferenceNumber}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors"
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
                                ? 'e.g., 2xxxxxx or 4xxxxxx or 8xxxxxxx'
                                : `Reference #${index + 1}`
                            }
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              referenceErrors[index] ? 'border-red-400' : 'border-gray-300'
                            }`}
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
                    {TRAILER_LENGTHS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Submit ── */}
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
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Submit Early Check-In'
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
              <p>
                For assistance, contact the shipping office at{' '}
                <a href="tel:+17654742512" className="text-indigo-600 hover:underline">
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
