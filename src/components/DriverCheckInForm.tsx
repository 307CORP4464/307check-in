'use client';

import { useState, useCallback, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

interface FormData {
  driverName: string;
  driverPhone: string;
  carrierName: string;
  trailerNumber: string;
  trailerLength: string;
  pickupNumber: string;
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
  pickupNumber: '',
  loadType: 'inbound',
  destinationCity: '',
  destinationState: '',
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

// Utility function to get Supabase client
const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createBrowserClient(url, key);
};

// Validation patterns for pickup numbers
const PICKUP_NUMBER_PATTERNS = [
  /^2\d{6}$/,           // 2xxxxxx
  /^4\d{6}$/,           // 4xxxxxx
  /^44\d{8}$/,          // 44xxxxxxxx
  /^8\d{7}$/,           // 8xxxxxxx
  /^TLNA-SO-00\d{4}$/, // TLNA-SO-00xxxx
  /^\d{6}$/             // xxxxxx
];

const validatePickupNumber = (value: string): boolean => {
  if (!value) return false;
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  return PICKUP_NUMBER_PATTERNS.some(pattern => pattern.test(cleaned));
};

// Format phone number as user types
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

export default function DriverCheckInForm() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);

  const handleInputChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    // Format phone number as user types
    const processedValue = name === 'driverPhone' 
      ? formatPhoneNumber(value) 
      : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    // Validate pickup number in real-time
    if (name === 'pickupNumber') {
      if (value && !validatePickupNumber(value)) {
        setPickupError(
          'Invalid format. Must match: 2xxxxxx, 4xxxxxx, 44xxxxxxxx, ' +
          '8xxxxxxx, TLNA-SO-00xxxx, or xxxxxx'
        );
      } else {
        setPickupError(null);
      }
    }
  }, []);

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setPickupError(null);
    setError(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validate pickup number
    if (!validatePickupNumber(formData.pickupNumber)) {
      setError('Invalid pickup number format');
      setLoading(false);
      return;
    }

    // Validate phone number (should have 10 digits)
    const phoneDigits = formData.driverPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      setError('Phone number must be 10 digits');
      setLoading(false);
      return;
    }

    try {
      const checkInTime = new Date().toISOString();

      const { data, error: insertError } = await supabase
        .from('check_ins')
        .insert([
          {
            driver_name: formData.driverName.trim(),
            driver_phone: phoneDigits, // Store only digits
            carrier_name: formData.carrierName.trim(),
            trailer_number: formData.trailerNumber.trim().toUpperCase(),
            trailer_length: formData.trailerLength,
            pickup_number: formData.pickupNumber.trim().toUpperCase(),
            load_type: formData.loadType,
            destination_city: formData.destinationCity.trim(),
            destination_state: formData.destinationState,
            check_in_time: checkInTime,
            status: 'pending',
          }
        ])
        .select();

      if (insertError) throw insertError;

      setSuccess(true);
      resetForm();

      // Auto-hide success message after 5 seconds
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
        </div>

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
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="inbound">Inbound Delivery</option>
              <option value="outbound">Outbound Pickup</option>
            </select>
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
              required
              maxLength={100}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Enter driver name"
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
              required
              maxLength={14}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="(555) 123-4567"
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
              required
              maxLength={100}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Enter carrier name"
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
              required
              maxLength={50}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Enter trailer number"
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
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              {TRAILER_LENGTHS.map(({ value, label }) => (
                <option key={value || 'empty'} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Pickup Number */}
          <div>
            <label 
              htmlFor="pickupNumber" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Pickup Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="pickupNumber"
              name="pickupNumber"
              value={formData.pickupNumber}
              onChange={handleInputChange}
              required
              maxLength={20}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                pickupError ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter pickup number"
            />
            {pickupError && (
              <p className="mt-1 text-sm text-red-600">{pickupError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Formats: 2xxxxxx, 4xxxxxx, 44xxxxxxxx, 8xxxxxxx, TLNA-SO-00xxxx, or xxxxxx
            </p>
          </div>

          {/* Destination City */}
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
              required
              maxLength={100}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              placeholder="Enter destination city"
            />
          </div>

          {/* Destination State */}
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
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="">Select state</option>
              {US_STATES.map(state => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !!pickupError}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg 
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Checking In...
              </>
            ) : (
              'Check In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
