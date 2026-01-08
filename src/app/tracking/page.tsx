'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(date);
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
  carrier_name?: string;
  trailer_number?: string;
  load_type?: 'inbound' | 'outbound';
  pickup_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  end_time?: string | null;
  destination_city?: string;
  destination_state?: string;
}

interface DailyStats {
  date: string;
  totalInbound: number;
  totalOutbound: number;
  totalCheckedIn: number;
  onTimeCount: number;
  onTimePercentage: number;
  detentionLoads: Array<{
    driver_name: string;
    carrier_name: string;
    pickup_number: string;
    detention_time: string;
  }>;
  halfHourBreakdown: { [key: string]: number };
  mostUsedDock: string;
  dockUsageCount: number;
}

const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'paid_to_load' || appointmentTime === 'paid_charge_customer') {
    return false;
  }

  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const appointmentHour = parseInt(appointmentTime.substring(0, 2));
    const appointmentMinute = parseInt(appointmentTime.substring(2, 4));
    
    const checkInDate = new Date(checkInTime);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    
    const timeString = formatter.format(checkInDate);
    const [checkInHour, checkInMinute] = timeString.split(':').map(Number);
    
    const appointmentTotalMinutes = appointmentHour * 60 + appointmentMinute;
    const checkInTotalMinutes = checkInHour * 60 + checkInMinute;
    
    const difference = checkInTotalMinutes - appointmentTotalMinutes;
    return difference <= 0;
  }
  
  return false;
};

const calculateDetention = (checkIn: CheckIn): { hasDetention: boolean; minutes: number } => {
  if (!checkIn.appointment_time || !checkIn.end_time) {
    return { hasDetention: false, minutes: 0 };
  }

  if (!isOnTime(checkIn.check_in_time, checkIn.appointment_time)) {
    return { hasDetention: false, minutes: 0 };
  }

  if (checkIn.appointment_time === 'work_in' || 
      checkIn.appointment_time === 'paid_to_load' || 
      checkIn.appointment_time === 'paid_charge_customer') {
    return { hasDetention: false, minutes: 0 };
  }

  const endTime = new Date(checkIn.end_time);
  const standardMinutes = 120;
  let detentionMinutes = 0;

  if (checkIn.appointment_time.length === 4 && /^\d{4}$/.test(checkIn.appointment_time)) {
    const appointmentHour = parseInt(checkIn.appointment_time.substring(0, 2));
    const appointmentMinute = parseInt(checkIn.appointment_time.substring(2, 4));
    
    const checkInDate = new Date(checkIn.check_in_time);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    const parts = formatter.formatToParts(checkInDate);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    
    const appointmentDate = new Date(checkInDate);
    appointmentDate.setFullYear(year, month, day);
    appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);
    
    const timeSinceAppointmentMs = endTime.getTime() - appointmentDate.getTime();
    const minutesSinceAppointment = Math.floor(timeSinceAppointmentMs / (1000 * 60));
    
    detentionMinutes = Math.max(0, minutesSinceAppointment - standardMinutes);
  }
  
  return { 
    hasDetention: detentionMinutes > 0, 
    minutes: detentionMinutes 
  };
};

const getHalfHourSlot = (isoString: string): string => {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const timeString = formatter.format(date);
  const [hour, minute] = timeString.split(':').map(Number);
  const halfHour = minute < 30 ? '00' : '30';
  
  return `${hour.toString().padStart(2, '0')}:${halfHour}`;
};

export default function Tracking() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  
  const getCurrentDateInIndianapolis = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState<string>(getCurrentDateInIndianapolis());
  const [endDate, setEndDate] = useState<string>(getCurrentDateInIndianapolis());

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUserEmail(user.email || '');
      }
    };
    checkUser();
  }, [supabase, router]);

  useEffect(() => {
    fetchTrackingData();
  }, [startDate, endDate, supabase]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const fetchTrackingData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const startOfDayIndy = zonedTimeToUtc(`${startDate} 00:00:00`, TIMEZONE);
      const endOfDayIndy = zonedTimeToUtc(`${endDate} 23:59:59`, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', startOfDayIndy.toISOString())
        .lte('check_in_time', endOfDayIndy.toISOString())
        .order('check_in_time', { ascending: true });

      if (error) throw error;

      // Process data by date
      const statsByDate: { [key: string]: CheckIn[] } = {};
      
      (data || []).forEach((checkIn: CheckIn) => {
        const date = new Date(checkIn.check_in_time);
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: TIMEZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const parts = formatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        const dateKey = `${year}-${month}-${day}`;
        
        if (!statsByDate[dateKey]) {
          statsByDate[dateKey] = [];
        }
        statsByDate[dateKey].push(checkIn);
      });

      // Calculate stats for each date
      const stats: DailyStats[] = Object.entries(statsByDate).map(([date, checkIns]) => {
        const totalInbound = checkIns.filter(c => c.load_type === 'inbound').length;
        const totalOutbound = checkIns.filter(c => c.load_type === 'outbound').length;
        const totalCheckedIn = checkIns.length;
        
        const onTimeCheckIns = checkIns.filter(c => 
          c.appointment_time && 
          c.appointment_time !== 'work_in' && 
          c.appointment_time !== 'paid_to_load' && 
          c.appointment_time !== 'paid_charge_customer' &&
          isOnTime(c.check_in_time, c.appointment_time)
        );
        
        const totalWithAppointments = checkIns.filter(c => 
          c.appointment_time && 
          c.appointment_time !== 'work_in' && 
          c.appointment_time !== 'paid_to_load' && 
          c.appointment_time !== 'paid_charge_customer'
        ).length;
        
        const onTimeCount = onTimeCheckIns.length;
        const onTimePercentage = totalWithAppointments > 0 
          ? Math.round((onTimeCount / totalWithAppointments) * 100) 
          : 0;

        // Detention loads
        const detentionLoads = checkIns
          .map(checkIn => {
            const detention = calculateDetention(checkIn);
            if (detention.hasDetention) {
              return {
                driver_name: checkIn.driver_name || 'N/A',
                carrier_name: checkIn.carrier_name || 'N/A',
                pickup_number: checkIn.pickup_number || 'N/A',
                detention_time: `${detention.minutes} min`
              };
            }
            return null;
          })
          .filter(Boolean) as DailyStats['detentionLoads'];

        // Half-hour breakdown
        const halfHourBreakdown: { [key: string]: number } = {};
        checkIns.forEach(checkIn => {
          const slot = getHalfHourSlot(checkIn.check_in_time);
          halfHourBreakdown[slot] = (halfHourBreakdown[slot] || 0) + 1;
        });

        // Most used dock
        const dockUsage: { [key: string]: number } = {};
        checkIns.forEach(checkIn => {
          if (checkIn.dock_number) {
            dockUsage[checkIn.dock_number] = (dockUsage[checkIn.dock_number] || 0) + 1;
          }
        });

        const mostUsedDockEntry = Object.entries(dockUsage).sort((a, b) => b[1] -[1] - a[1])[0];
        const mostUsedDock = mostUsedDockEntry ? mostUsedDockEntry[0] : 'N/A';
        const dockUsageCount = mostUsedDockEntry ? mostUsedDockEntry[1] : 0;
      }
        

        return {
          date,
          totalInbound,
          totalOutbound,
          totalCheckedIn,
          onTimeCount,
          onTimePercentage,
          detentionLoads,
          halfHourBreakdown,
          mostUsedDock,
          dockUsageCount
        };
      });

      setDailyStats(stats.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Matching Dashboard */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Tracking & Analytics</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
              <p className="text-xs text-gray-500">
                Current time: {formatTimeInIndianapolis(new Date().toISOString())}
              </p>
            </div>
            <div className="flex gap-3">
              <Link 
                href="/" 
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium">
                Dashboard
              </Link>
              <Link 
                href="/appointments" 
                className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium">
                Appointments
              </Link>
              <Link
                href="/dock-status"
                className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium">
                Dock Status
              </Link>
              <Link
                href="/logs"
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium">
                Daily Logs
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors font-medium">
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Date Range Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Select Date Range</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-medium">Error: {error}</p>
          </div>
        )}

        {/* Daily Stats */}
        {dailyStats.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No data available for the selected date range</p>
          </div>
        ) : (
          <div className="space-y-6">
            {dailyStats.map((stats) => (
              <div key={stats.date} className="bg-white rounded-lg shadow">
                {/* Date Header */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-t-lg">
                  <h2 className="text-2xl font-bold">
                    {new Date(stats.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h2>
                </div>

                <div className="p-6">
                  {/* Summary Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                      <p className="text-sm font-medium text-blue-800 mb-1">Total Check-Ins</p>
                      <p className="text-3xl font-bold text-blue-900">{stats.totalCheckedIn}</p>
                    </div>
                    
                    <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                      <p className="text-sm font-medium text-green-800 mb-1">Inbound</p>
                      <p className="text-3xl font-bold text-green-900">{stats.totalInbound}</p>
                    </div>
                    
                    <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded">
                      <p className="text-sm font-medium text-purple-800 mb-1">Outbound</p>
                      <p className="text-3xl font-bold text-purple-900">{stats.totalOutbound}</p>
                    </div>
                    
                    <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
                      <p className="text-sm font-medium text-yellow-800 mb-1">On-Time %</p>
                      <p className="text-3xl font-bold text-yellow-900">{stats.onTimePercentage}%</p>
                      <p className="text-xs text-yellow-700 mt-1">({stats.onTimeCount} loads)</p>
                    </div>
                  </div>

                  {/* Most Used Dock */}
                  <div className="bg-indigo-50 border-2 border-indigo-400 rounded-lg p-4 mb-6">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-2">Most Used Dock</h3>
                    <div className="flex items-center justify-between">
                      <p className="text-2xl font-bold text-indigo-700">Dock #{stats.mostUsedDock}</p>
                      <p className="text-indigo-600">{stats.dockUsageCount} loads</p>
                    </div>
                  </div>

                  {/* Half-Hour Breakdown */}
                  {Object.keys(stats.halfHourBreakdown).length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Check-In Activity by Time</h3>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {Object.entries(stats.halfHourBreakdown)
                            .sort((a, b) => a[0].localeCompare(b[0])
                            .map(([time, count]) => (
                              <div key={time} className="bg-white rounded border border-gray-200 p-3 text-center shadow-sm">
                                <p className="text-xs font-medium text-gray-600 mb-1">{time}</p>
                                <p className="text-xl font-bold text-gray-900">{count}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detention Loads */}
                  {stats.detentionLoads.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        Detention Loads ({stats.detentionLoads.length})
                      </h3>
                      <div className="bg-red-50 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-red-200">
                          <thead className="bg-red-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-red-900 uppercase tracking-wider">
                                Driver
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-red-900 uppercase tracking-wider">
                                Carrier
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-red-900 uppercase tracking-wider">
                                PO Number
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-red-900 uppercase tracking-wider">
                                Detention Time
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-red-100">
                            {stats.detentionLoads.map((load, idx) => (
                              <tr key={idx} className="hover:bg-red-50 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-900">{load.driver_name}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{load.carrier_name}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{load.pickup_number}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-red-700">{load.detention_time}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

