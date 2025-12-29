'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { differenceInMinutes } from 'date-fns';
import Link from 'next/link';
import AssignDockModal from './AssignDockModal';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string, includeDate: boolean = false): string => {
  try {
    const date = new Date(isoString);
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', isoString);
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    if (includeDate) {
      options.year = 'numeric';
      options.month = '2-digit';
      options.day = '2-digit';
    }
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const formatted = formatter.format(date);
    
    console.log('Formatting:', {
      input: isoString,
      parsed: date.toISOString(),
      formatted: formatted,
      timezone: TIMEZONE
    });
    
    return formatted;
  } catch (e) {
    console.error('Time formatting error:', e, isoString);
    return isoString;
  }
};

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  carrier_name?: string;
  trailer_number?: string;
  trailer_length?: string;
  load_type?: 'inbound' | 'outbound';
  pickup_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  destination_city?: string;
  destination_state?: string;
}

export default function CSRDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedForDock, setSelectedForDock] = useState<CheckIn | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      }
    };
    getUser();
  }, [supabase]);

  useEffect(() => {
    fetchCheckIns();
    
    const channel = supabase
      .channel('check_ins_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins' },
        () => {
          fetchCheckIns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const fetchCheckIns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .eq('status', 'pending')
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

  const handleAssignDock = (checkIn: CheckIn) => {
    setSelectedForDock(checkIn);
  };

  const handleDockAssignSuccess = () => {
    fetchCheckIns();
    setSelectedForDock(null);
  };

  const calculateWaitTime = (checkIn: CheckIn): string => {
    const start = new Date(checkIn.check_in_time);
    const now = new Date();
    const minutes = differenceInMinutes(now, start);
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getWaitTimeColor = (checkIn: CheckIn): string => {
    const start = new Date(checkIn.check_in_time);
    const now = new Date();
    const minutes = differenceInMinutes(now, start);
    
    if (minutes < 15) return 'text-green-600';
    if (minutes < 30) return 'text-yellow-600';
    return 'text-red-600';
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
        <div className="max-w-full mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CSR Dashboard - Pending Check-ins (EST/EDT)</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
              <p className="text-xs text-gray-500">Current time: {formatTimeInIndianapolis(new Date().toISOString())}</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/logs"
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
              >
                View Logs
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

      <div className="max-w-full mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Pending Check-ins</h3>
            <p className="text-3xl font-bold mt-2 text-orange-600">{checkIns.length}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold">Pending Assignments</h2>
          </div>
          
          {checkIns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-6xl mb-4">✓</div>
              <p className="text-xl">No pending check-ins</p>
              <p className="text-sm mt-2">All check-ins have been processed</p>
            </div>
          ) : (
            <div className="w-full">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-[8%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Appt Time
                    </th>
                    <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check-in
                    </th>
                    <th className="w-[8%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pickup #
                    </th>
                    <th className="w-[15%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Carrier/Trailer
                    </th>
                    <th className="w-[15%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Driver
                    </th>
                    <th className="w-[14%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destination
                    </th>
                    <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Wait Time
                    </th>
                    <th className="w-[10%] px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {checkIns.map((ci) => {
                    const waitTime = calculateWaitTime(ci);
                    const waitTimeColor = getWaitTimeColor(ci);
                    return (
                      <tr key={ci.id} className="hover:bg-gray-50">
                        <td className="px-3 py-4 text-sm">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            ci.load_type === 'inbound' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {ci.load_type === 'inbound' ? 'In' : 'Out'}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          {ci.appointment_time ? formatTimeInIndianapolis(ci.appointment_time) : 'N/A'}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          {formatTimeInIndianapolis(ci.check_in_time)}
                        </td>
                        <td className="px-3 py-4 text-sm">
                          <span className="font-bold text-gray-900">
                            {ci.pickup_number || 'N/A'}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm">
                          <div className="flex flex-col">
                            <span className="text-gray-900">{ci.carrier_name || 'N/A'}</span>
                            <span className="text-gray-500 text-xs">
                              {ci.trailer_number || 'N/A'}
                            </span>
                            {ci.trailer_length && (
                              <span className="text-gray-500 text-xs">
                                {ci.trailer_length}&apos;
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm">
                          <div className="flex flex-col">
                            <span className="text-gray-900">{ci.driver_name || 'N/A'}</span>
                            <span className="text-gray-500 text-xs">
                              {ci.driver_phone || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900">
                          {ci.destination_city && ci.destination_state 
                            ? `${ci.destination_city}, ${ci.destination_state}` 
                            : 'N/A'}
                        </td>
                        <td className={`px-3 py-4 text-sm font-semibold ${waitTimeColor}`}>
                          {waitTime}
                        </td>
                        <td className="px-3 py-4 text-center">
                          <button
                            onClick={() => handleAssignDock(ci)}
                            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm w-full"
                          >
                            Assign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedForDock && (
        <AssignDockModal
          checkIn={selectedForDock}
          onClose={() => setSelectedForDock(null)}
          onSuccess={handleDockAssignSuccess}
        />
      )}
    </div>
  );
}
