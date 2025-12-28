'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { startOfDay, endOfDay } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';
import { saveAs } from 'file-saver';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string | null | undefined): string => {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';

    return new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    console.error('Error formatting time', e);
    return isoString;
  }
};

export default function DailyLog() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const today = getCurrentDateInIndianapolis();
      const start = zonedTimeToUtc(startOfDay(today), TIMEZONE);
      const end = zonedTimeToUtc(endOfDay(today), TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', start.toISOString())
        .lte('check_in_time', end.toISOString())
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentDateInIndianapolis = () => {
    const now = new Date();
    // convert to Indiana timezone by using toLocaleString and parsing back to Date
    const s = now.toLocaleString('en-US', { timeZone: TIMEZONE });
    return new Date(s);
  };

  const exportToCSV = () => {
    const rows = [
      ['Check-in Time (EST/EDT)', 'Driver', 'Pickup Number', 'Carrier', 'Trailer']
    ];

    logs.forEach((l) => {
      rows.push([
        formatTimeInIndianapolis(l.check_in_time),
        l.driver_name || '-',
        l.pickup_number || '-',
        l.carrier_name || '-',
        l.trailer_number || '-'
      ]);
    });

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `daily-log-${new Date().toISOString()}.csv`);
  };

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Daily Check-ins (EST/EDT)</h2>
        <button
          onClick={exportToCSV}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time (EST/EDT)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pickup</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carrier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTimeInIndianapolis(l.check_in_time)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{l.driver_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{l.pickup_number || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{l.carrier_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{l.trailer_number || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateInEastern());
  const [selectedForStatusChange, setSelectedForStatusChange] = useState<CheckIn | null>(null);
  const [isStatusChangeModalOpen, setIsStatusChangeModalOpen] = useState(false);

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
      
      // Convert selected date to Eastern timezone, then to UTC for querying
      const startOfDayEastern = zonedTimeToUtc(`${selectedDate} 00:00:00`, TIMEZONE);
      const endOfDayEastern = zonedTimeToUtc(`${selectedDate} 23:59:59`, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', startOfDayEastern.toISOString())
        .lte('check_in_time', endOfDayEastern.toISOString())
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

  const handleStatusChange = (checkIn: CheckIn) => {
    setSelectedForStatusChange(checkIn);
    setIsStatusChangeModalOpen(true);
  };

  const handleStatusChangeSuccess = () => {
    fetchCheckInsForDate();
  };

  const exportToCSV = () => {
    const headers = [
      'Type',
      'Appointment Time',
      'Check-in Time (EST/EDT)',
      'Pickup Number',
      'Carrier Name',
      'Trailer Number',
      'Trailer Length',
      'Driver Name',
      'Driver Phone',
      'Destination',
      'Dock Number',
      'Start Time',
      'End Time',
      'Status',
      'Notes'
    ];

    const rows = checkIns.map(ci => [
      ci.load_type === 'inbound' ? 'I' : 'O',
      formatAppointmentTime(ci.appointment_time),
      formatTimeInEastern(ci.check_in_time, true),
      ci.pickup_number || '',
      ci.carrier_name || '',
      ci.trailer_number || '',
      ci.trailer_length || '',
      ci.driver_name || '',
      ci.driver_phone || '',
      ci.destination_city && ci.destination_state ? `${ci.destination_city}, ${ci.destination_state}` : '',
      ci.dock_number || '',
      ci.start_time ? formatTimeInEastern(ci.start_time, true) : '',
      ci.end_time ? formatTimeInEastern(ci.end_time, true) : ci.check_out_time ? formatTimeInEastern(ci.check_out_time, true) : '',
      ci.status,
      ci.notes || ''
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
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Check-in Log (EST/EDT)</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
              <p className="text-xs text-gray-500">Current time: {formatTimeInEastern(new Date().toISOString())}</p>
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

      <div className="max-w-7xl mx-auto p-4">
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
                onClick={() => setSelectedDate(getCurrentDateInEastern())}
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

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            {checkIns.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No check-ins found for {format(parseISO(selectedDate), 'MMMM d, yyyy')}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time (EST/EDT)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pickup Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carrier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {checkIns.map((checkIn) => (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                          checkIn.load_type === 'inbound' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          isOnTime(checkIn.check_in_time, checkIn.appointment_time)
                            ? 'bg-green-100 text-green-800 ring-2 ring-green-300'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {formatAppointmentTime(checkIn.appointment_time)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatTimeInEastern(checkIn.check_in_time, true)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {checkIn.pickup_number || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.carrier_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.trailer_number ? `${checkIn.trailer_number}${checkIn.trailer_length ? ` (${checkIn.trailer_length}')` : ''}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{checkIn.driver_name || '-'}</div>
                        {checkIn.driver_phone && (
                          <div className="text-gray-500 text-xs mt-1">{checkIn.driver_phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.dock_number || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          checkIn.status === 'checked_out' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {checkIn.status === 'checked_out' ? 'Checked Out' : 'Checked In'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleStatusChange(checkIn)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View/Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {isStatusChangeModalOpen && selectedForStatusChange && (
        <StatusChangeModal
          checkIn={selectedForStatusChange}
          onClose={() => {
            setIsStatusChangeModalOpen(false);
            setSelectedForStatusChange(null);
          }}
          onSuccess={handleStatusChangeSuccess}
        />
      )}
    </div>
  );
}
