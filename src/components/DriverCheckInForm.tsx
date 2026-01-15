'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

interface FormData {
  driverName: string;
  driverPhone: string;
  carrierName: string;
  trailerNumber: string;
  trailerLength: string;
  referenceNumber: string;
  loadType: 'inbound' | 'outbound';
  destinationCity: string;
  destinationState: string;
}

const INITIAL_FORM_DATA: FormData = {
  driverName: '',
  driverPhone: '',
  carrierName: '',
  trailerNumber: '',
  trailerLength: '',
  referenceNumber: '',
  loadType: 'inbound',
  destinationCity: '',
  destinationState: '',
};

// SITE CONFIGURATION - Crawfordsville, IN
const SITE_COORDINATES = {
  latitude: 40.37260025266849,
  longitude: -86.82089938420066,
  radiusMeters: 100  // 100 meters = ~328 feet
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

// Check if current time is within allowed hours (Mon-Fri, 7:00-17:00)
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
  
  // Check if between 7:00 AM and 5:00 PM
  if (hour < 7) {
    return { 
      allowed: false, 
      message: 'Check-in is not available before 7:00 AM' 
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
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
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
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setReferenceError(null);
    setError(null);
    setLocationStatus(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setLocationStatus('checking');

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

    // Existing validations
    if (!validateReferenceNumber(formData.referenceNumber)) {
      setError('Invalid reference number format');
      setLoading(false);
      return;
    }

    const phoneDigits = formData.driverPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setError('Phone number must be 10 digits');
      setLoading(false);
      return;
    }

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

    try {
      const checkInTime = new Date().toISOString();

      const { data, error: insertError } = await supabase
        .from('check_ins')
        .insert([
          {
            driver_name: formData.driverName.trim(),
            driver_phone: phoneDigits,
            carrier_name: formData.carrierName.trim(),
            trailer_number: formData.trailerNumber.trim().toUpperCase(),
            trailer_length: formData.trailerLength,
            reference_number: formData.referenceNumber.trim().toUpperCase(),
            load_type: formData.loadType,
            destination_city: formData.destinationCity.trim() || null,
            destination_state: formData.destinationState || null,
            check_in_time: checkInTime,
            status: 'pending',
            check_in_location: geofenceCheck.distance 
              ? `${Math.round(geofenceCheck.distance)}m from site` 
              : null,
          }
        ])
        .select();

      if (insertError) throw insertError;

      setSuccess(true);
      resetForm();

      setTimeout(() => {
        setSuccess(false);
      }, 5000);

    } catch (err) {
      console.error('Error checking in:', err);
      setError(
        err instanceof Error 
          ? err.message 
          : 'Failed to check in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            Driver Check-In
          </h1>
          <p className="text-gray-600 text-center mt-2">
            Please fill out all required information
          </p>
          <p className="text-sm text-gray-500 text-center mt-1">
            Available: Monday-Friday, 7:00 AM - 5:00 PM
          </p>
        </div>

        {/* Time Restriction Warning */}
        {timeRestrictionWarning && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-bold">Check-In Not Available</p>
                <p>{timeRestrictionWarning}</p>
              </div>
            </div>
          </div>
        )}

        {/* Location Status */}
        {locationStatus === 'checking' && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="ml-3">
                <p>Verifying your location...</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 relative">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="font-bold">Error</p>
                <p>{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-auto flex-shrink-0 text-red-500 hover:text-red-700"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6 relative">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-bold">Success!</p>
                <p>You have been checked in successfully. Please wait for dock assignment.</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Load Type */}
          <div>
            <label 
              htmlFor="loadType" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Load Type <span className="text-red-500">*</span>
            </label>
            <select
              id="loadType"
              name="loadType"
              value={formData.loadType}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={!!timeRestrictionWarning}
            >
              <option value="inbound">Inbound Delivery</option>
              <option value="outbound">Outbound Pickup</option>
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label 
              htmlFor="referenceNumber" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Reference Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="referenceNumber"
              name="referenceNumber"
              value={formData.referenceNumber}
              onChange={handleInputChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                referenceError ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter reference number"
              required
              disabled={!!timeRestrictionWarning}
            />
            {referenceError && (
              <p className="mt-1 text-sm text-red-600">{referenceError}</p>
            )}
          </div>

          {/* Driver Name */}
          <div>
            <label 
              htmlFor="driverName" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Driver Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="driverName"
              name="driverName"
              value={formData.driverName}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your full name"
              required
              disabled={!!timeRestrictionWarning}
            />
          </div>

          {/* Driver Phone */}
          <div>
            <label 
              htmlFor="driverPhone" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Driver Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              id="driverPhone"
              name="driverPhone"
              value={formData.driverPhone}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="(555) 555-5555"
              required
              disabled={!!timeRestrictionWarning}
            />
          </div>

          {/* Carrier Name */}
          <div>
            <label 
              htmlFor="carrierName" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Carrier Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="carrierName"
              name="carrierName"
              value={formData.carrierName}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter carrier company name"
              required
              disabled={!!timeRestrictionWarning}
            />
          </div>

          {/* Trailer Number */}
          <div>
            <label 
              htmlFor="trailerNumber" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Trailer Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="trailerNumber"
              name="trailerNumber"
              value={formData.trailerNumber}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter trailer number"
              required
              disabled={!!timeRestrictionWarning}
            />
          </div>

          {/* Trailer Length */}
          <div>
            <label 
              htmlFor="trailerLength" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Trailer Length <span className="text-red-500">*</span>
            </label>
            <select
              id="trailerLength"
              name="trailerLength"
              value={formData.trailerLength}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={!!timeRestrictionWarning}
            >
              {TRAILER_LENGTHS.map((length) => (
                <option key={length.value} value={length.value}>
                  {length.label}
                </option>
              ))}
            </select>
          </div>

          {/* Destination Fields (Outbound Only) */}
          {formData.loadType === 'outbound' && (
            <>
              <div>
                <label 
                  htmlFor="destinationCity" 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Destination City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="destinationCity"
                  name="destinationCity"
                  value={formData.destinationCity}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter destination city"
                  required
                  disabled={!!timeRestrictionWarning}
                />
              </div>

              <div>
                <label 
                  htmlFor="destinationState" 
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Destination State <span className="text-red-500">*</span>
                </label>
                <select
                  id="destinationState"
                  name="destinationState"
                  value={formData.destinationState}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={!!timeRestrictionWarning}
                >
                  <option value="">Select state</option>
                  {US_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !!referenceError || !!timeRestrictionWarning}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking In...
              </span>
            ) : (
              'Check In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
