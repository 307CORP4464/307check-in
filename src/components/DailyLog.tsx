'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

const TIMEZONE = 'America/Indiana/Indianapolis';

interface CheckIn {
  id: string;
  user_id: string;
  check_in_time: string;
  user_name?: string;
  email?: string;
  status?: string;
}

export default function DailyLog() {
  const [selectedDate, setSelectedDate] = useState<string>(
    format(utcToZonedTime(new Date(), TIMEZONE), 'yyyy-MM-dd', { timeZone: TIMEZONE })
  );
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchCheckIns();
  }, [selectedDate]);

  const fetchCheckIns = async () => {
    try {
      setLoading(true);
      setError(null);

      // Create start and end of day in Indiana timezone
      const startOfDayIndy = zonedTimeToUtc(`${selectedDate} 00:00:00`, TIMEZONE);
      const endOfDayIndy = zonedTimeToUtc(`${selectedDate} 23:59:59`, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', startOfDayIndy.toISOString())
        .lte('check_in_time', endOfDayIndy.toISOString())
        .order('check_in_time', { ascending: false });

      if (error) {
        throw error;
      }

      setCheckIns(data || []);
    } catch (err) {
      console.error('Error fetching check-ins:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch check-ins');
    } finally {
      setLoading(false);
    }
  };

  const formatCheckInTime = (utcTime: string) => {
    const zonedTime = utcToZonedTime(new Date(utcTime), TIMEZONE);
    return format(zonedTime, 'HH:mm:ss', { timeZone: TIMEZONE });
  };

  const formatCheckInDateTime = (utcTime: string) => {
    const zonedTime = utcToZonedTime(new Date(utcTime), TIMEZONE);
    return format(zonedTime, 'MMM dd, yyyy HH:mm:ss', { timeZone: TIMEZONE });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const handleToday = () => {
    const today = format(utcToZonedTime(new Date(), TIMEZONE), 'yyyy-MM-dd', { timeZone: TIMEZONE });
    setSelectedDate(today);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Daily Check-In Log</h1>

        {/* Date Selection */}
        <div className="mb-6 flex gap-4 items-center">
          <div className="flex-1">
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            <input
              type="date"
              id="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleToday}
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Today
          </button>
          <button
            onClick={fetchCheckIns}
            className="mt-6 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Loading check-ins...</p>
          </div>
        )}

        {/* Check-Ins Table */}
        {!loading && (
          <>
            <div className="mb-4">
              <p className="text-gray-600">
                Showing {checkIns.length} check-in{checkIns.length !== 1 ? 's' : ''} for{' '}
                <span className="font-semibold">
                  {format(new Date(selectedDate), 'MMMM dd, yyyy')}
                </span>
              </p>
            </div>

            {checkIns.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-md">
                <p className="text-gray-500 text-lg">No check-ins found for this date.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Check-In Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {checkIns.map((checkIn, index) => (
                      <tr key={checkIn.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {checkIn.user_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {checkIn.email || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-semibold">
                            {formatCheckInTime(checkIn.check_in_time)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatCheckInDateTime(checkIn.check_in_time)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              checkIn.status === 'present'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {checkIn.status || 'Checked In'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
