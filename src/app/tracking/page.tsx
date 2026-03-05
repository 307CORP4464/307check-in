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
    if (isNaN(date.getTime())) return 'Invalid Date';
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (e) {
    console.error('Time formatting error:', e, isoString);
    return isoString;
  }
};

const CUSTOMERS = ['TATE', 'PRIM', 'XARC', 'BAGS', 'TRAX', 'ADM'] as const;
type CustomerName = typeof CUSTOMERS[number];

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  carrier_name?: string;
  trailer_number?: string;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  end_time?: string | null;
  destination_city?: string;
  destination_state?: string;
  customer?: string; // 👈 add this if not present, or rename to match your DB field
}

interface CustomerBreakdown {
  customer: CustomerName;
  inbound: number;
  outbound: number;
  total: number;
}

interface DetentionInstance {
  reference_number: string;
  check_in_time: string;
  appointment_time: string;
  end_time: string;
  detention_minutes: number;
  driver_name: string;
  carrier_name: string;
}

// Dock sets definition
const DOCK_SETS: { label: string; docks: number[] }[] = [
  { label: '64-70', docks: [64, 65, 66, 67, 68, 69, 70] },
  { label: '1-7',   docks: [1, 2, 3, 4, 5, 6, 7] },
  { label: '8-14',  docks: [8, 9, 10, 11, 12, 13, 14] },
  { label: '15-21', docks: [15, 16, 17, 18, 19, 20, 21] },
  { label: '22-28', docks: [22, 23, 24, 25, 26, 27, 28] },
  { label: '29-35', docks: [29, 30, 31, 32, 33, 34, 35] },
  { label: '36-42', docks: [36, 37, 38, 39, 40, 41, 42] },
  { label: '43-49', docks: [43, 44, 45, 46, 47, 48, 49] },
  { label: '50-56', docks: [50, 51, 52, 53, 54, 55, 56] },
  { label: '57-63', docks: [57, 58, 59, 60, 61, 62, 63] },
];

interface DailyStats {
  date: string;
  totalInbound: number;
  totalOutbound: number;
  totalCheckedIn: number;
  onTimeCount: number;
  onTimePercentage: number;
  detentionInstances: DetentionInstance[];
  halfHourBreakdown: { [key: string]: number };
  dockSetUsage: { label: string; count: number }[];
  customerBreakdown: CustomerBreakdown[]; // 👈 new
}

const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (
    !appointmentTime ||
    appointmentTime === 'work_in' ||
    appointmentTime === 'paid_to_load' ||
    appointmentTime === 'paid_charge_customer'
  ) {
    return false;
  }

  // Support both 4-digit (e.g. "0800") and HH:MM formats
  let appointmentHour: number;
  let appointmentMinute: number;

  if (/^\d{4}$/.test(appointmentTime)) {
    appointmentHour = parseInt(appointmentTime.substring(0, 2));
    appointmentMinute = parseInt(appointmentTime.substring(2, 4));
  } else if (/^\d{1,2}:\d{2}$/.test(appointmentTime)) {
    const [h, m] = appointmentTime.split(':').map(Number);
    appointmentHour = h;
    appointmentMinute = m;
  } else {
    return false;
  }

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

  return checkInTotalMinutes - appointmentTotalMinutes <= 0;
};

const calculateDetention = (
  checkIn: CheckIn
): { hasDetention: boolean; minutes: number } => {
  if (!checkIn.appointment_time || !checkIn.end_time) {
    return { hasDetention: false, minutes: 0 };
  }

  if (
    checkIn.appointment_time === 'work_in' ||
    checkIn.appointment_time === 'paid_to_load' ||
    checkIn.appointment_time === 'paid_charge_customer'
  ) {
    return { hasDetention: false, minutes: 0 };
  }

  if (!isOnTime(checkIn.check_in_time, checkIn.appointment_time)) {
    return { hasDetention: false, minutes: 0 };
  }

  let appointmentHour: number;
  let appointmentMinute: number;

  if (/^\d{4}$/.test(checkIn.appointment_time)) {
    appointmentHour = parseInt(checkIn.appointment_time.substring(0, 2));
    appointmentMinute = parseInt(checkIn.appointment_time.substring(2, 4));
  } else if (/^\d{1,2}:\d{2}$/.test(checkIn.appointment_time)) {
    const [h, m] = checkIn.appointment_time.split(':').map(Number);
    appointmentHour = h;
    appointmentMinute = m;
  } else {
    return { hasDetention: false, minutes: 0 };
  }

  const endTime = new Date(checkIn.end_time);
  const checkInDate = new Date(checkIn.check_in_time);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(checkInDate);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');

  // Build appointment datetime in local time then convert to UTC-equivalent
  const appointmentDate = new Date(checkInDate);
  appointmentDate.setFullYear(year, month, day);
  appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);

  const timeSinceAppointmentMs = endTime.getTime() - appointmentDate.getTime();
  const minutesSinceAppointment = Math.floor(timeSinceAppointmentMs / (1000 * 60));
  const detentionMinutes = Math.max(0, minutesSinceAppointment - 120);

  return { hasDetention: detentionMinutes > 0, minutes: detentionMinutes };
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

/** Given a dock_number string, find which dock set it belongs to */
const getDockSetLabel = (dockNumber: string | undefined): string | null => {
  if (!dockNumber) return null;
  const num = parseInt(dockNumber, 10);
  if (isNaN(num)) return null;
  const set = DOCK_SETS.find(s => s.docks.includes(num));
  return set ? set.label : null;
};

const getCustomerBreakdown = (checkIns: CheckIn[]): CustomerBreakdown[] => {
  const breakdown: Record<CustomerName, CustomerBreakdown> = {} as Record<
    CustomerName,
    CustomerBreakdown
  >;

  CUSTOMERS.forEach((customer) => {
    breakdown[customer] = {
      customer,
      inbound: 0,
      outbound: 0,
      total: 0,
    };
  });

  checkIns.forEach((checkIn) => {
    const rawCustomer = (checkIn.customer ?? '').toString().trim().toUpperCase(); // 👈 uses customer
    if (CUSTOMERS.includes(rawCustomer as CustomerName)) {
      const key = rawCustomer as CustomerName;
      if (checkIn.load_type === 'inbound') {
        breakdown[key].inbound += 1;
      } else if (checkIn.load_type === 'outbound') {
        breakdown[key].outbound += 1;
      }
      breakdown[key].total += 1;
    }
  });

  return CUSTOMERS.map((c) => breakdown[c]);
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
  const [expandedDetention, setExpandedDetention] = useState<{ [date: string]: boolean }>({});
  const [expandedCustomerBreakdown, setExpandedCustomerBreakdown] = useState<{ [date: string]: boolean }>({});
  
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
  }, [startDate, endDate]);

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

    // Group by Indianapolis date
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

      if (!statsByDate[dateKey]) statsByDate[dateKey] = [];
      statsByDate[dateKey].push(checkIn);
    });

    // Build stats for each date — checkIns is correctly scoped here
    const statsArray: DailyStats[] = Object.entries(statsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, checkIns]) => {
        const totalInbound = checkIns.filter(c => c.load_type === 'inbound').length;
        const totalOutbound = checkIns.filter(c => c.load_type === 'outbound').length;
        const totalCheckedIn = checkIns.length;

        const onTimeCount = checkIns.filter(c =>
          isOnTime(c.check_in_time, c.appointment_time)
        ).length;

        const onTimePercentage =
          totalCheckedIn > 0 ? Math.round((onTimeCount / totalCheckedIn) * 100) : 0;

        const detentionInstances: DetentionInstance[] = checkIns
          .map(c => {
            const { hasDetention, minutes } = calculateDetention(c);
            if (!hasDetention) return null;
            return {
              reference_number: c.reference_number || 'N/A',
              check_in_time: c.check_in_time,
              appointment_time: c.appointment_time || '',
              end_time: c.end_time || '',
              detention_minutes: minutes,
              driver_name: c.driver_name || 'N/A',
              carrier_name: c.carrier_name || 'N/A',
            };
          })
          .filter((d): d is DetentionInstance => d !== null);

        const halfHourBreakdown: { [key: string]: number } = {};
        checkIns.forEach(c => {
          const slot = getHalfHourSlot(c.check_in_time);
          halfHourBreakdown[slot] = (halfHourBreakdown[slot] || 0) + 1;
        });

        const dockSetCounts: { [label: string]: number } = {};
        checkIns.forEach(c => {
          const label = getDockSetLabel(c.dock_number);
          if (label) {
            dockSetCounts[label] = (dockSetCounts[label] || 0) + 1;
          }
        });
        const dockSetUsage = DOCK_SETS.map(s => ({
          label: s.label,
          count: dockSetCounts[s.label] || 0,
        }));

        // ✅ customerBreakdown is called here, AFTER checkIns is defined
        const customerBreakdown = getCustomerBreakdown(checkIns);

        return {
          date: dateKey,
          totalInbound,
          totalOutbound,
          totalCheckedIn,
          onTimeCount,
          onTimePercentage,
          detentionInstances,
          halfHourBreakdown,
          dockSetUsage,
          customerBreakdown,
        };
      });

    setDailyStats(statsArray);
  } catch (err) {
    console.error('Error fetching tracking data:', err);
    setError('Failed to load tracking data.');
  } finally {
    setLoading(false);
  }
};


  const toggleDetention = (date: string) => {
    setExpandedDetention(prev => ({ ...prev, [date]: !prev[date] }));
  };

return (
  <div className="min-h-screen bg-gray-50">
    {/* Header */}
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Tracking</h1>
            {userEmail && (
              <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
            )}
            <p className="text-xs text-gray-500">
              Current time: {formatTimeInIndianapolis(new Date().toISOString())}
            </p>
          </div>
          <div className="flex gap-3">
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
            
            <Link
              href="/check-in"
              className="bg-yellow-500 text-white px-6 py-2 rounded-lg hover:bg-yellow-600 transition-colors font-medium"
            >
              Check-In Form
            </Link>
          </div>
        </div>
      </div>
    </div>


      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Date range picker */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={fetchTrackingData}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!loading && !error && dailyStats.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No data found for the selected date range.
          </div>
        )}

        {!loading && dailyStats.map(stat => (
          <div key={stat.date} className="bg-white rounded-lg shadow mb-8 overflow-hidden">
            {/* Date header */}
            <div className="bg-blue-700 text-white px-6 py-3">
              <h2 className="text-lg font-semibold">{stat.date}</h2>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 border-b">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">Total Check-Ins</p>
                <p className="text-3xl font-bold text-gray-900">{stat.totalCheckedIn}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">Inbound</p>
                <p className="text-3xl font-bold text-green-700">{stat.totalInbound}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">Outbound</p>
                <p className="text-3xl font-bold text-blue-700">{stat.totalOutbound}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">On-Time Check-Ins</p>
                <p className="text-3xl font-bold text-purple-700">{stat.onTimeCount}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.onTimePercentage}% on time</p>
              </div>
            </div>

            {/* Dock Set Usage */}
            <div className="p-6 border-b">
              <h3 className="text-base font-semibold text-gray-700 mb-3">Dock Set Usage</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {stat.dockSetUsage.map(ds => (
                  <div
                    key={ds.label}
                    className={`rounded-lg p-3 text-center border ${
                      ds.count > 0
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <p className="text-xs text-gray-500 font-medium">Docks {ds.label}</p>
                    <p className={`text-2xl font-bold ${ds.count > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>
                      {ds.count}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Half-hour breakdown */}
            {Object.keys(stat.halfHourBreakdown).length > 0 && (
              <div className="p-6 border-b">
                <h3 className="text-base font-semibold text-gray-700 mb-3">
                  Check-Ins by Half Hour
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stat.halfHourBreakdown)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([slot, count]) => (
                      <div
                        key={slot}
                        className="bg-gray-100 rounded px-3 py-1 text-sm"
                      >
                        <span className="font-medium">{slot}</span>
                        <span className="text-gray-500 ml-1">({count})</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

{/* Check-ins by Customer - Always Visible */}
<div style={{ marginTop: '12px' }}>
  <p style={{ 
    color: '#1a56db', 
    fontWeight: '600', 
    marginBottom: '6px',
    fontSize: '13px' 
  }}>
    Check-ins by Customer
  </p>
  <table style={{ 
    width: '100%', 
    borderCollapse: 'collapse', 
    fontSize: '12px' 
  }}>
    <thead>
      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
        <th style={{ 
          textAlign: 'left', 
          padding: '4px 8px', 
          color: '#1a56db',
          fontWeight: '600'
        }}>
          Customer
        </th>
        <th style={{ 
          textAlign: 'center', 
          padding: '4px 8px', 
          color: '#1a56db',
          fontWeight: '600'
        }}>
          Inbound
        </th>
        <th style={{ 
          textAlign: 'center', 
          padding: '4px 8px', 
          color: '#1a56db',
          fontWeight: '600'
        }}>
          Outbound
        </th>
        <th style={{ 
          textAlign: 'center', 
          padding: '4px 8px', 
          color: '#1a56db',
          fontWeight: '600'
        }}>
          Total
        </th>
      </tr>
    </thead>
    <tbody>
      {stat.customerBreakdown.map((row) => (
        <tr key={row.customer} style={{ borderBottom: '1px solid #f3f4f6' }}>
          <td style={{ padding: '4px 8px' }}>{row.customer}</td>
          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{row.inbound}</td>
          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{row.outbound}</td>
          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{row.total}</td>
        </tr>
      ))}
      {/* Totals Row */}
      <tr style={{ 
        borderTop: '2px solid #e5e7eb', 
        fontWeight: '600',
        backgroundColor: '#f9fafb'
      }}>
        <td style={{ padding: '4px 8px' }}>Totals</td>
        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
          {stat.customerBreakdown.reduce((sum, row) => sum + row.inbound, 0)}
        </td>
        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
          {stat.customerBreakdown.reduce((sum, row) => sum + row.outbound, 0)}
        </td>
        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
          {stat.customerBreakdown.reduce((sum, row) => sum + row.total, 0)}
        </td>
      </tr>
    </tbody>
  </table>
</div>

            
{/* Detention Section */}
<div className="p-6">
  <div className="flex items-center mb-3">
    <h3 className="text-base font-semibold text-gray-700">
      Detention{' '}
      <span className="ml-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
        {stat.detentionInstances.length}
      </span>
    </h3>
  </div>

  {stat.detentionInstances.length === 0 && (
    <p className="text-sm text-gray-400">No detention instances for this day.</p>
  )}

  {stat.detentionInstances.length > 0 && (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-red-50 text-left">
            <th className="px-4 py-2 border border-red-100 font-semibold text-gray-600">
              Reference #
            </th>
            <th className="px-4 py-2 border border-red-100 font-semibold text-gray-600">
              Carrier
            </th>
            <th className="px-4 py-2 border border-red-100 font-semibold text-gray-600">
              Appt Time
            </th>
            <th className="px-4 py-2 border border-red-100 font-semibold text-gray-600">
              Check-In Time
            </th>
            <th className="px-4 py-2 border border-red-100 font-semibold text-gray-600">
              End Time
            </th>
            <th className="px-4 py-2 border border-red-100 font-semibold text-gray-600">
              Detention
            </th>
          </tr>
        </thead>
        <tbody>
          {stat.detentionInstances.map((d, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}>
              <td className="px-4 py-2 border border-red-100 font-mono text-gray-800">
                {d.reference_number}
              </td>
              <td className="px-4 py-2 border border-red-100 text-gray-700">
                {d.carrier_name}
              </td>
              <td className="px-4 py-2 border border-red-100 text-gray-700">
                {d.appointment_time}
              </td>
              <td className="px-4 py-2 border border-red-100 text-gray-700">
                {formatTimeInIndianapolis(d.check_in_time)}
              </td>
              <td className="px-4 py-2 border border-red-100 text-gray-700">
                {formatTimeInIndianapolis(d.end_time)}
              </td>
              <td className="px-4 py-2 border border-red-100 font-semibold text-red-700">
                {d.detention_minutes} min
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>


          </div>
        ))}
      </main>
    </div>
  );
}
