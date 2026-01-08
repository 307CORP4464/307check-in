'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';

const TIMEZONE = 'America/Indiana/Indianapolis';

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
      }
    };
    checkUser();
  }, [supabase, router]);

  useEffect(() => {
    fetchTrackingData();
  }, [startDate, endDate, supabase]);

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
        const dockCounts: { [key: string]: number } = {};
        checkIns.forEach(checkIn => {
          if (checkIn.dock_number) {
            dockCounts[checkIn.dock_number] = (dockCounts[checkIn.dock_number] || 0) + 1;
          }
        });

        let mostUsedDock = 'N/A';
        let dockUsageCount = 0;
        Object.entries(dockCounts).forEach(([dock, count]) => {
          if (count > dockUsageCount) {
            mostUsedDock = dock;
            dockUsageCount = count;
          }
        });

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

      setDailyStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const csvRows = [];
    
    // Header
    csvRows.push([
      'Date',
      'Total Check-Ins',
      'Inbound',
      'Outbound',
      'On-Time Count',
      'On-Time %',
      'Most Used Dock',
      'Dock Usage Count',
      'Detention Loads'
    ].join(','));

    // Data rows
    dailyStats.forEach(stat => {
      csvRows.push([
        stat.date,
        stat.totalCheckedIn,
        stat.totalInbound,
        stat.totalOutbound,
        stat.onTimeCount,
        `${stat.onTimePercentage}%`,
        stat.mostUsedDock,
        stat.dockUsageCount,
        stat.detentionLoads.length
      ].join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracking-report-${startDate}-to-${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading tracking data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-800">Daily Tracking Report</h1>
          <Link 
		href="/appointments" 
                className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium"
>
                Appointments
              </Link>  

<Link
                href="/dock-status"
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                Dock Status
              </Link>    

<Link
                href="/dashboard"
                className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium"
              >
                Dashboard
              </Link>
<Link
                href="/logs"
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium"
              >
                Daily Logs
              </Link>
<Link
                href="/tracking"
                className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors font-medium"
              >
                Tracking
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Logout
              </button>
        </div>

        {/* Date Range Selection */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={exportToCSV}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition"
            >
              Export to CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
      </div>

      {/* Daily Stats Cards */}
      {dailyStats.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No data available for the selected date range.
        </div>
      ) : (
        <div className="space-y-6">
          {dailyStats.map((stat) => (
            <div key={stat.date} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Date Header */}
              <div className="bg-blue-600 text-white px-6 py-4">
                <h2 className="text-2xl font-bold">
                  {new Date(stat.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </h2>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{stat.totalCheckedIn}</div>
                  <div className="text-sm text-gray-600">Total Check-Ins</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{stat.totalInbound}</div>
                  <div className="text-sm text-gray-600">Inbound</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{stat.totalOutbound}</div>
                  <div className="text-sm text-gray-600">Outbound</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {stat.onTimePercentage}%
                  </div>
                  <div className="text-sm text-gray-600">
                    On-Time ({stat.onTimeCount})
                  </div>
                </div>
              </div>

              {/* Dock Usage */}
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold mb-3">Most Used Dock</h3>
                <div className="bg-gray-50 rounded p-4">
                  <div className="text-2xl font-bold text-gray-800">
                    Dock {stat.mostUsedDock}
                  </div>
                  <div className="text-sm text-gray-600">
                    Used {stat.dockUsageCount} times
                  </div>
                </div>
              </div>

              {/* Half-Hour Breakdown */}
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold mb-3">Check-Ins by Half-Hour</h3>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  {Object.entries(stat.halfHourBreakdown)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([time, count]) => (
                      <div key={time} className="bg-gray-50 rounded p-2 text-center">
                        <div className="text-xs text-gray-600">{time}</div>
                        <div className="text-lg font-bold text-blue-600">{count}</div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Detention Loads */}
              {stat.detentionLoads.length > 0 && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-3 text-red-600">
                    Detention Loads ({stat.detentionLoads.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Driver</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Carrier</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">PU #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Detention Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {stat.detentionLoads.map((load, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm">{load.driver_name}</td>
                            <td className="px-4 py-2 text-sm">{load.carrier_name}</td>
                            <td className="px-4 py-2 text-sm">{load.pickup_number}</td>
                            <td className="px-4 py-2 text-sm font-semibold text-red-600">
                              {load.detention_time}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
