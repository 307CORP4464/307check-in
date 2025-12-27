'use client';

import { useState } from 'react';
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
}

export default function DriverCheckInForm() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [formData, setFormData] = useState<FormData>({
    driverName: '',
    driverPhone: '',
    carrierName: '',
    trailerNumber: '',
    trailerLength: '',
    pickupNumber: '',
    loadType: 'inbound',
    destinationCity: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { data, error: insertError } = await supabase
        .from('check_ins')
        .insert([
          {
            driver_name: formData.driverName,
            driver_phone: formData.driverPhone,
            carrier_name: formData.carrierName,
            trailer_number: formData.trailerNumber,
            trailer_length: formData.trailerLength,
            pickup_number: formData.pickupNumber,
            load_type: formData.loadType,
            destination_city: formData.destinationCity,
            check_in_time: new Date().toISOString(),
            status: 'pending',
          }
        ])
        .select();

      if (insertError) throw insertError;

      setSuccess(true);
      setFormData({
        driverName: '',
        driverPhone: '',
        carrierName: '',
        trailerNumber: '',
        trailerLength: '',
        pickupNumber: '',
        loadType: 'inbound',
        destinationCity: '',
      });

      setTimeout(() => {
        setSuccess(false);
      }, 5000);

    } catch (err) {
      console.error('Error checking in:', err);
      setError(err instanceof Error ? err.message : 'Failed to check in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 text-center">Driver Check-In</h1>
          <p className="text-gray-600 text-center mt-2">Please fill out all required information</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Success!</p>
            <p>You have been checked in successfully. Please wait for dock assignment.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Load Type */}
          <div>
            <label htmlFor="loadType" className="block text-sm font-medium text-gray-700 mb-2">
              Load Type <span className="text-red-500">*</span>
            </label>
            <select
              id="loadType"
              name="loadType"
              value={formData.loadType}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="inbound">Inbound Delivery</option>
              <option value="outbound">Outbound Pickup</option>
            </select>
          </div>

          {/* Driver Name */}
          <div>
            <label htmlFor="driverName" className="block text-sm font-medium text-gray-700 mb-2">
              Driver Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="driverName"
              name="driverName"
              value={formData.driverName}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter driver name"
            />
          </div>

          {/* Driver Phone */}
          <div>
            <label htmlFor="driverPhone" className="block text-sm font-medium text-gray-700 mb-2">
              Driver Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              id="driverPhone"
              name="driverPhone"
              value={formData.driverPhone}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Carrier Name */}
          <div>
            <label htmlFor="carrierName" className="block text-sm font-medium text-gray-700 mb-2">
              Carrier Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="carrierName"
              name="carrierName"
              value={formData.carrierName}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter carrier name"
            />
          </div>

          {/* Trailer Number */}
          <div>
            <label htmlFor="trailerNumber" className="block text-sm font-medium text-gray-700 mb-2">
              Trailer Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="trailerNumber"
              name="trailerNumber"
              value={formData.trailerNumber}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter trailer number"
            />
          </div>

          {/* Trailer Length */}
          <div>
            <label htmlFor="trailerLength" className="block text-sm font-medium text-gray-700 mb-2">
              Trailer Length <span className="text-red-500">*</span>
            </label>
            <select
              id="trailerLength"
              name="trailerLength"
              value={formData.trailerLength}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select trailer length</option>
              <option value="Box">Box Truck</option>
              <option value="20">20 ft</option>
              <option value="40">40 ft</option>
              <option value="48">48 ft</option>
              <option value="53">53 ft</option>
            </select>
          </div>

          {/* Pickup Number */}
          <div>
            <label htmlFor="pickupNumber" className="block text-sm font-medium text-gray-700 mb-2">
              Pickup Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="pickupNumber"
              name="pickupNumber"
              value={formData.pickupNumber}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 2xxxxxx, 4xxxxxx, 8xxxxxxx, TLNA-SO-00XXXX or XXXXXX"
            />
            <p className="mt-1 text-sm text-gray-500">Format: PU12345 or 123456</p>
          </div>

          {/* Destination City */}
          <div>
            <label htmlFor="destinationCity" className="block text-sm font-medium text-gray-700 mb-2">
              Destination City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="destinationCity"
              name="destinationCity"
              value={formData.destinationCity}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter destination city"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>After checking in, please wait for dock assignment notification.</p>
        </div>
      </div>
    </div>
  );
}
