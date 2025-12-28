'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

const TIMEZONE = 'America/Indiana/Indianapolis';

export default function DriverCheckInForm() {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // Get current time in Indiana timezone
      const now = new Date();
      const indianaTime = utcToZonedTime(now, TIMEZONE);
      
      // Convert Indiana time to UTC for storage
      const utcTime = zonedTimeToUtc(indianaTime, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .insert([
          {
            user_name: userName,
            email: userEmail,
            check_in_time: utcTime.toISOString(),
          }
        ])
        .select();

      if (error) throw error;

      const displayTime = format(indianaTime, 'HH:mm:ss', { timeZone: TIMEZONE });
      const displayDate = format(indianaTime, 'MMMM dd, yyyy', { timeZone: TIMEZONE });
      
      setMessage(`✓ Successfully checked in at ${displayTime} on ${displayDate} (Indiana Time)`);
      setMessageType('success');
      setUserName('');
      setUserEmail('');
    } catch (error) {
      console.error('Error checking in:', error);
      setMessage('✗ Error checking in. Please try again.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Driver Check-In</h1>
          <p className="text-gray-600">Please enter your details to check in</p>
        </div>

        <form onSubmit={handleCheckIn} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="John Doe"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="john.doe@example.com"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Checking in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check In Now
              </>
            )}
          </button>

          {message && (
            <div className={`p-4 rounded-lg ${
              messageType === 'success' 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm ${
                messageType === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {message}
              </p>
            </div>
          )}
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-center text-gray-500">
            All times are recorded in Indiana (Eastern) timezone
          </p>
        </div>
      </div>
    </div>
  );
}

