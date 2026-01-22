'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { sendDriverCheckInEmail } from '@/lib/emailTriggers';

interface FormData {
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  carrierName: string;
  trailerNumber: string;
  trailerLength: string;
  referenceNumber: string;
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
  referenceNumber: '',
  loadType: 'inbound',
  destinationCity: '',
  destinationState: '',
  emailConsent: false,
};

// SITE CONFIGURATION - Crawfordsville, IN
const SITE_COORDINATES = {
  latitude: 40.37260025266849,
  longitude: -86.82089938420066,
  radiusMeters: 300  // 300 meters = ~985 feet
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
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createBrowserClient(url, key);
};

const REFERENCE_NUMBER_PATTERNS = [
  /^2\d{6}$/,
  /^4\d{6}$/,
  /^44\d{8}$/,
  /^8\d{7}$/,
  /^TLNA-SO-0\d{5}$/,
  /^\d{6}$/
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
  
  if (lineNumber) {
    return `(${areaCode}) ${prefix}-${lineNumber}`;
  } else if (prefix) {
    return `(${areaCode}) ${prefix}`;
  } else if (areaCode) {
    return `(${areaCode}`;
  }
  
  return value;
};

// Check if current time is within allowed hours (Mon-Fri, 6:00-17:00)
const isWithinAllowedTime = (): { allowed: boolean; message?: string } => {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const hour = now.getHours();
  
  // Check if Monday-Friday (1-5)
  if (day === 0 || day === 6) {
    return { 
      allowed: false, 
      message: 'Check-in is only available Monday through Friday' 
    };
  }
  
  // Check if between 6:00 AM and 5:00 PM
  if (hour < 6) {
    return { 
      allowed: false, 
      message: 'Check-in is not available before 6:00 AM' 
    };
  }
  
  if (hour >= 17) {
    return { 
      allowed: false, 
      message: 'Check-in is not available after 5:00 PM' 
    };
  }
  
  return { allowed: true };
};

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;

  return distance;
};

// Validate user is within geofence
const validateGeofence = (): Promise<{ valid: boolean; message?: string; distance?: number }> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ 
        valid: false, 
        message: 'Geolocation is not supported by your device' 
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        const distance = calculateDistance(
          userLat,
          userLng,
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
            message += 'Please enable location permissions in your browser.';
            break;
          case error.POSITION_UNAVAILABLE:
            message += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            message += 'Location request timed out.';
            break;
          default:
            message += 'An unknown error occurred.';
        }
        resolve({ valid: false, message });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
};

export default function DriverCheckInForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'valid' | 'invalid' | null>(null);
  const [timeRestrictionWarning, setTimeRestrictionWarning] = useState<string | null>(null);

  // Check time restrictions on mount and set up interval
  useEffect(() => {
    const checkTimeRestrictions = () => {
      const timeCheck = isWithinAllowedTime();
      if (!timeCheck.allowed) {
        setTimeRestrictionWarning(timeCheck.message || 'Check-in not available at this time');
      } else {
        setTimeRestrictionWarning(null);
      }
    };

    checkTimeRestrictions();
    // Check every minute
    const interval = setInterval(checkTimeRestrictions, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleInputChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    const processedValue = name === 'driverPhone' 
      ? formatPhoneNumber(value) 
      : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    if (name === 'referenceNumber') {
      if (value && !validateReferenceNumber(value)) {
        setReferenceError(
          'Invalid format. Must match: 2xxxxxx, 4xxxxxx, 44xxxxxxxx, ' +
          '8xxxxxxx, TLNA-SO-0xxxxx or xxxxxx'
        );
      } else {
        setReferenceError(null);
      }
    }

    if (name === 'driverEmail') {
      if (value && !validateEmail(value)) {
        setEmailError('Please enter a valid email address');
      } else {
        setEmailError(null);
      }
    }
  }, []);

  const handleCheckboxChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setReferenceError(null);
    setEmailError(null);
    setError(null);
    setLocationStatus(null);
    setSuccess(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setLocationStatus('checking');

    try {
      // Check time restrictions
      const timeCheck = isWithinAllowedTime();
      if (!timeCheck.allowed) {
        setError(timeCheck.message || 'Check-in not available at this time');
        setLoading(false);
        setLocationStatus(null);
        return;
      }

      // Check geofence
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

      // Email consent validation
      if (!formData.emailConsent) {
        setError('You must consent to email communications to proceed');
        setLoading(false);
        return;
      }

      // Reference number validation
      if (!validateReferenceNumber(formData.referenceNumber)) {
        setError('Invalid reference number format');
        setLoading(false);
        return;
      }

      // Phone validation
      const phoneDigits = formData.driverPhone.replace(/\D/g, '');
      if (phoneDigits.length !== 10) {
        setError('Phone number must be 10 digits');
        setLoading(false);
        return;
      }

      // Outbound validations
      if (formData.loadType === 'outbound') {
        if (!formData.destinationCity.trim()) {
          setError('Destination city is required for outbound pickups');
          setLoading(false);
          return;
        }
        if (!formData.destinationState) {
          setError('Destination state is required for outbound pickups');
          setLoading(false);
          return;
        }
      }

      const checkInTime = new Date().toISOString();

      // Insert check-in to Supabase
      const { data, error: insertError } = await supabase
        .from('check_ins')
        .insert([
          {
            driver_name: formData.driverName,
            driver_phone: formData.driverPhone,
            driver_email: formData.driverEmail,
            carrier_name: formData.carrierName,
            trailer_number: formData.trailerNumber,
            trailer_length: formData.trailerLength,
            reference_number: formData.referenceNumber,
            load_type: formData.loadType,
            destination_city: formData.destinationCity,
            destination_state: formData.destinationState,
            check_in_time: checkInTime,
            status: 'pending',
            location_latitude: geofenceCheck.distance ? SITE_COORDINATES.latitude : null,
            location_longitude: geofenceCheck.distance ? SITE_COORDINATES.longitude : null,
          }
        ])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // Send confirmation email
      try {
        await sendDriverCheckInEmail({
          driverName: formData.driverName,
          driverEmail: formData.driverEmail,
          carrierName: formData.carrierName,
          trailerNumber: formData.trailerNumber,
          referenceNumber: formData.referenceNumber,
          loadType: formData.loadType,
          checkInTime: new Date(checkInTime).toLocaleString(),
          destinationCity: formData.destinationCity,
          destinationState: formData.destinationState,
        });
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // Don't fail the entire check-in process due to email issues
      }

      setSuccess(true);
      setLocationStatus(null);
      
      // Reset form after successful submission
      setTimeout(() => {
        resetForm();
      }, 3000);

    } catch (err) {
      console.error('Check-in error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during check-in');
      setLocationStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Driver Check-In
            </h1>
            <p className="text-gray-600">
              Crawfordsville Distribution Center
            </p>
          </div>

          {/* Time Restriction Warning */}
          {timeRestrictionWarning && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    {timeRestrictionWarning}
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    Check-in hours: Monday-Friday, 6:00 AM - 5:00 PM
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Location Status Indicator */}
          {locationStatus === 'checking' && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <svg className="animate-spin h-5 w-5 text-blue-600 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-blue-800">Verifying your location...</span>
              </div>
            </div>
          )}

          {locationStatus === 'valid' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-green-600 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-green-800">Location verified - You are on-site</span>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          )}

          {/* Success Alert */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Check-in successful! You will be notified when your dock is ready.
                  </h3>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Load Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Load Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, loadType: 'inbound' }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.loadType === 'inbound'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2"></div>
                    <div className="font-semibold">Inbound</div>
                    <div className="text-sm text-gray-500">Delivering to facility</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, loadType: 'outbound' }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.loadType === 'outbound'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2"></div>
                    <div className="font-semibold">Outbound</div>
                    <div className="text-sm text-gray-500">Picking up from facility</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Driver Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="driverName" className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="driverName"
                  name="driverName"
                  value={formData.driverName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="driverPhone" className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  id="driverPhone"
                  name="driverPhone"
                  value={formData.driverPhone}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                  maxLength={14}
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="driverEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="driverEmail"
                name="driverEmail"
                value={formData.driverEmail}
                onChange={handleInputChange}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  emailError ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="driver@example.com"
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600">{emailError}</p>
              )}
            </div>

            {/* Carrier & Trailer Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="carrierName" className="block text-sm font-medium text-gray-700 mb-1">
                  Carrier Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="carrierName"
                  name="carrierName"
                  value={formData.carrierName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ABC Trucking"
                />
              </div>

              <div>
                <label htmlFor="trailerNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Trailer Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="trailerNumber"
                  name="trailerNumber"
                  value={formData.trailerNumber}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="TRL12345"
                />
              </div>
            </div>

            {/* Trailer Length & Reference Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="trailerLength" className="block text-sm font-medium text-gray-700 mb-1">
                  Trailer Length <span className="text-red-500">*</span>
                </label>
                <select
                  id="trailerLength"
                  name="trailerLength"
                  value={formData.trailerLength}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {TRAILER_LENGTHS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="referenceNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="referenceNumber"
                  name="referenceNumber"
                  value={formData.referenceNumber}
                  onChange={handleInputChange}
                  required
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    referenceError ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="2123456 or 44123456789"
                />
                {referenceError && (
                  <p className="mt-1 text-sm text-red-600">{referenceError}</p>
                )}
              </div>
            </div>

                        {/* Destination (Outbound Only) */}
            {formData.loadType === 'outbound' && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-900 mb-3">
                  Destination Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="destinationCity" className="block text-sm font-medium text-gray-700 mb-1">
                      Destination City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="destinationCity"
                      name="destinationCity"
                      value={formData.destinationCity}
                      onChange={handleInputChange}
                      required={formData.loadType === 'outbound'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Indianapolis"
                    />
                  </div>

                  <div>
                    <label htmlFor="destinationState" className="block text-sm font-medium text-gray-700 mb-1">
                      Destination State <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="destinationState"
                      name="destinationState"
                      value={formData.destinationState}
                      onChange={handleInputChange}
                      required={formData.loadType === 'outbound'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select state</option>
                      {US_STATES.map(state => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Email Consent Disclaimer */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Email Communication Consent
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                By providing your email address, you consent to receive:
              </p>
              <ul className="text-xs text-gray-600 list-disc list-inside space-y-1 mb-3 ml-2">
                <li>Real-time shipment status updates and notifications</li>
                <li>Dock appointment confirmations and schedule changes</li>
                <li>Facility operational updates and safety alerts</li>
                <li>Important delivery and pickup instructions</li>
              </ul>
              <p className="text-xs text-gray-600 mb-3">
                We respect your privacy. Your email will not be sold or shared with third parties 
                for marketing purposes. You may opt out at any time by contacting our facility.
              </p>
              
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="emailConsent"
                  name="emailConsent"
                  checked={formData.emailConsent}
                  onChange={handleCheckboxChange}
                  required
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="emailConsent" className="ml-2 text-sm text-gray-700">
                  I consent to receive email communications as described above. 
                  <span className="text-red-500">*</span>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading || !!timeRestrictionWarning || !!referenceError || !!emailError}
                className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                  loading || timeRestrictionWarning || referenceError || emailError
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
