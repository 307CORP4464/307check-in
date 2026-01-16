'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

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

      const checkInTime = new Date().toISOString();

      // Insert with status = 'pending' (NOT 'checked_in')
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
            status: 'pending'  // Changed from 'checked_in' to 'pending'
          }
        ])
        .select()
        .single();

      if (insertError) {
        console.error('Error checking in:', insertError);
        throw insertError;
      }

      setSuccess(true);
      
      // Reset form after 3 seconds
      setTimeout(() => {
        resetForm();
      }, 3000);

    } catch (err) {
      console.error('Error checking in:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during check-in');
      setLocationStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Driver Check-In
            </h1>
            <p className="text-gray-600">
              Please complete all required fields
            </p>
            {timeRestrictionWarning && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">⚠️ {timeRestrictionWarning}</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">✓ Check-in successful! Form will reset shortly...</p>
            </div>
          )}

          {locationStatus === 'checking' && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">📍 Verifying your location...</p>
            </div>
          )}

          {locationStatus === 'valid' && !success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">✓ Location verified</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Driver Name */}
            <div>
              <label htmlFor="driverName" className="block text-sm font-medium text-gray-700 mb-2">
                Driver Name *
              </label>
              <input
                type="text"
                id="driverName"
                name="driverName"
                value={formData.driverName}
                onChange={handleInputChange}
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Enter driver name"
              />
            </div>

            {/* Driver Phone */}
            <div>
              <label htmlFor="driverPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Driver Phone *
              </label>
              <input
                type="tel"
                id="driverPhone"
                name="driverPhone"
                value={formData.driverPhone}
                onChange={handleInputChange}
                required
                maxLength={14}
                disabled={loading || success}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="(555) 555-5555"
              />
            </div>

            {/* Carrier Name */}
            <div>
              <label htmlFor="carrierName" className="block text-sm font-medium text-gray-700 mb-2">
                Carrier Name *
              </label>
              <input
                type="text"
                id="carrierName"
                name="carrierName"
                value={formData.carrierName}
                onChange={handleInputChange}
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Enter carrier name"
              />
            </div>

            {/* Trailer Number */}
            <div>
              <label htmlFor="trailerNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Trailer Number *
              </label>
              <input
                type="text"
                id="trailerNumber"
                name="trailerNumber"
                value={formData.trailerNumber}
                onChange={handleInputChange}
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Enter trailer number"
              />
            </div>

            {/* Trailer Length */}
            <div>
              <label htmlFor="trailerLength" className="block text-sm font-medium text-gray-700 mb-2">
                Trailer Length *
              </label>
              <select
                id="trailerLength"
                name="trailerLength"
                value={formData.trailerLength}
                onChange={handleInputChange}
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {TRAILER_LENGTHS.map((length) => (
                  <option key={length.value} value={length.value}>
                    {length.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label htmlFor="referenceNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Reference Number *
              </label>
              <input
                type="text"
                id="referenceNumber"
                name="referenceNumber"
                value={formData.referenceNumber}
                onChange={handleInputChange}
                required
                disabled={loading || success}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed ${
                  referenceError ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter reference number"
              />
              {referenceError && (
                <p className="mt-1 text-sm text-red-600">{referenceError}</p>
              )}
            </div>

            {/* Load Type */}
            <div>
              <label htmlFor="loadType" className="block text-sm font-medium text-gray-700 mb-2">
                Load Type *
              </label>
              <select
                id="loadType"
                name="loadType"
                value={formData.loadType}
                onChange={handleInputChange}
                required
                disabled={loading || success}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="inbound">Inbound Delivery</option>
                <option value="outbound">Outbound Pickup</option>
              </select>
            </div>

            {/* Destination Fields (for outbound only) */}
            {formData.loadType === 'outbound' && (
              <>
                <div>
                  <label htmlFor="destinationCity" className="block text-sm font-medium text-gray-700 mb-2">
                    Destination City *
                  </label>
                  <input
                    type="text"
                    id="destinationCity"
                    name="destinationCity"
                    value={formData.destinationCity}
                    onChange={handleInputChange}
                    required={formData.loadType === 'outbound'}
                    disabled={loading || success}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="Enter destination city"
                  />
                </div>

                <div>
                  <label htmlFor="destinationState" className="block text-sm font-medium text-gray-700 mb-2">
                    Destination State *
                  </label>
                  <select
                    id="destinationState"
                    name="destinationState"
                    value={formData.destinationState}
                    onChange={handleInputChange}
                    required={formData.loadType === 'outbound'}
                    disabled={loading || success}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              disabled={loading || !!referenceError || !!timeRestrictionWarning || success}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Checking In...' : success ? 'Check-In Complete!' : 'Check In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
