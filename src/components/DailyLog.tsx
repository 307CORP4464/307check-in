'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import Link from 'next/link';

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  company?: string;
  carrier_name?: string;
  trailer_number?: string;
  purpose?: string;
  pu_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export default function DailyLog() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      } else {
        router.push('/login');
      }
    };
    getUser();
  }, [supabase, router]);

  useEffect(() => {
    fetchCheckInsForDate();
  }, [selectedDate, supabase]);

  const fetchCheckInsForDate = async () => {
    try {
      setLoading(true);
      const startDate = startOfDay(new Date(selectedDate)).toISOString();
      const endDate = endOfDay(new Date(selectedDate)).toISOString();

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', startDate)
        .lte('check_in_time', endDate)
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      setCheckIns(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Appointment Time',
      'Check-in Time',
      'PU#',
      'Carrier Name',
      'Trailer Number',
      'Driver Name',
      'Driver Phone',
      'Dock Number',
      'Start Time',
      'End Time',
      'Status'
    ];

    const rows = checkIns.map(ci => [
      ci.appointment_time ? format(parseISO(ci.appointment_time), 'yyyy-MM-dd HH:mm') : '',
      format(parseISO(ci.check_in_time), 'yyyy-MM-dd HH:mm'),
      ci.pu_number || '',
      ci.carrier_name || '',
      ci.trailer_number || '',
      ci.driver_name || '',
      ci.driver_phone || '',
      ci.dock_number || '',
      ci.start_time ? format(parseISO(ci.start_time), 'yyyy-MM-dd HH:mm') : '',
      ci.end_time ? format(parseISO(ci.end_time), 'yyyy-MM-dd HH:mm') : ci.check_out_time ? format(parseISO(ci.check_out_time), 'yyyy-MM-dd HH:mm') : '',
      ci.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `check-ins-${selectedDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Check-in Log</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4">
        {/* Date Filter and Actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="font-medium text-gray-700">Select Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
              >
                Today
              </button>
              <button
                onClick={exportToCSV}
                disabled={checkIns.length === 0}
                className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-300"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Check-ins</h3>
            <p className="text-3xl font-bold mt-2">{checkIns.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Checked Out</h3>
            <p className="text-3xl font-bold mt-2 text-blue-600">
              {checkIns.filter(ci => ci.status === 'checked_out').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Still Checked In</h3>
            <p className="text-3xl font-bold mt-2 text-green-600">
              {checkIns.filter(ci => ci.status === 'checked_in').length}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            {checkIns.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No check-ins found for {format(new Date(selectedDate), 'MMMM dd, yyyy')}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Appointment Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check-in Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PU#
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Carrier Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trailer Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Driver Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Driver Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dock Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      End Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {checkIns.map((ci) => (
                    <tr key={ci.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.appointment_time ? format(parseISO(ci.appointment_time), 'HH:mm') : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(parseISO(ci.check_in_time), 'HH:mm')}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {ci.pu_number || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.carrier_name || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.trailer_number || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.driver_name || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.driver_phone || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.dock_number || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.start_time ? format(parseISO(ci.start_time), 'HH:mm') : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ci.end_time 
                          ? format(parseISO(ci.end_time), 'HH:mm')
                          : ci.check_out_time 
                            ? format(parseISO(ci.check_out_time), 'HH:mm')
                            : '-'
                        }
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          ci.status === 'checked_in' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {ci.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
