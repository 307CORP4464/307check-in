'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Header from '@/components/Header';

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

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  carrier_name?: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  trailer_number?: string;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  end_time?: string | null;
  destination_city?: string;
  destination_state?: string;
}

interface DetentionInstance {
  reference_number: string;
  check_in_time: string;
  appointment_time: string;
  end_time: string;
  detention_minutes: number;
  carrier_name: string;
}

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
  totalCheckedOut: number;
  onlineCheckIns: number;
  onTimeCount: number;
  onTimePercentage: number;
  detentionInstances: DetentionInstance[];
  halfHourBreakdown: { [key: string]: number };
  dockSetUsage: { label: string; count: number }[];
}

const isOnTime = (checkInTime: string, appointmentTime: string | null | undefined): boolean => {
  if (
    !appointmentTime ||
    appointmentTime === 'work_in' ||
    appointmentTime === 'paid_to_load' ||
    appointmentTime === 'paid_charge_customer'
  ) return false;

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

  return (checkInHour * 60 + checkInMinute) - (appointmentHour * 60 + appointmentMinute) <= 0;
};

const calculateDetention = (checkIn: CheckIn): { hasDetention: boolean; minutes: number } => {
  if (!checkIn.appointment_time || !checkIn.end_time) return { hasDetention: false, minutes: 0 };

  if (
    checkIn.appointment_time === 'work_in' ||
    checkIn.appointment_time === 'paid_to_load' ||
    checkIn.appointment_time === 'paid_charge_customer'
  ) return { hasDetention: false, minutes: 0 };

  if (!isOnTime(checkIn.check_in_time, checkIn.appointment_time)) return { hasDetention: false, minutes: 0 };

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

  const appointmentDate = new Date(checkInDate);
  appointmentDate.setFullYear(year, month, day);
  appointmentDate.setHours(appointmentHour, appointmentMinute, 0, 0);

  const minutesSinceAppointment = Math.floor((endTime.getTime() - appointmentDate.getTime()) / (1000 * 60));
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

const getDockSetLabel = (dockNumber: string | undefined): string | null => {
  if (!dockNumber) return null;
  const num = parseInt(dockNumber, 10);
  if (isNaN(num)) return null;
  const set = DOCK_SETS.find(s => s.docks.includes(num));
  return set ? set.label : null;
};

// ─── Stat Card ───────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number;
  sub?: string;
  accent: string;
  textColor: string;
}

function StatCard({ label, value, sub, accent, textColor }: StatCardProps) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className="px-5 py-4 pl-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
        <p className={`text-4xl font-bold leading-none ${textColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Range Stat Card ──────────────────────────────────────────────────────────
interface RangeCardProps {
  label: string;
  value: number;
  sub?: string;
  accent: string;
  textColor: string;
}

function RangeCard({ label, value, sub, accent, textColor }: RangeCardProps) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent}`} />
      <div className="px-4 py-4 pl-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
        <p className={`text-4xl font-bold leading-none ${textColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────
function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function Tracking() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getCurrentDateInIndianapolis = (): string => {
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

  const getPreviousWorkingDay = (): string => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const candidate = new Date();
    while (true) {
      candidate.setDate(candidate.getDate() - 1);
      const parts = formatter.formatToParts(candidate);
      const y = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const m = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
      const d = parseInt(parts.find(p => p.type === 'day')?.value || '0');
      const dow = new Date(y, m, d).getDay();
      if (dow !== 0 && dow !== 6) {
        const yStr = parts.find(p => p.type === 'year')?.value;
        const mStr = parts.find(p => p.type === 'month')?.value;
        const dStr = parts.find(p => p.type === 'day')?.value;
        return `${yStr}-${mStr}-${dStr}`;
      }
    }
  };

  const formatDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const formatDateShort = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const today = getCurrentDateInIndianapolis();
  const yesterday = getPreviousWorkingDay();

  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push('/login');
    };
    checkUser();
  }, [supabase, router]);

  useEffect(() => {
    fetchTrackingData();
  }, [startDate, endDate]);

  const handleToday = () => { setStartDate(today); setEndDate(today); };
  const handleYesterday = () => { setStartDate(yesterday); setEndDate(yesterday); };

  const fetchTrackingData = async () => {
    try {
      setLoading(true);
      setError(null);

      const startOfDayIndy = zonedTimeToUtc(`${startDate} 00:00:00`, TIMEZONE);
      const endOfDayIndy   = zonedTimeToUtc(`${endDate} 23:59:59`, TIMEZONE);

      // ── Paginated fetch to bypass Supabase's 1000-row default limit ──────
      const PAGE_SIZE = 1000;
      let allData: CheckIn[] = [];
      let page = 0;

      while (true) {
        const { data, error } = await supabase
          .from('check_ins')
          .select('*')
          .gte('check_in_time', startOfDayIndy.toISOString())
          .lte('check_in_time', endOfDayIndy.toISOString())
          .order('check_in_time', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allData = [...allData, ...data];
        if (data.length < PAGE_SIZE) break;
        page++;
      }
      // ─────────────────────────────────────────────────────────────────────

      const statsByDate: { [key: string]: CheckIn[] } = {};

      allData.forEach((checkIn: CheckIn) => {
        const date = new Date(checkIn.check_in_time);
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: TIMEZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const parts = formatter.formatToParts(date);
        const year  = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day   = parts.find(p => p.type === 'day')?.value;
        const dateKey = `${year}-${month}-${day}`;
        if (!statsByDate[dateKey]) statsByDate[dateKey] = [];
        statsByDate[dateKey].push(checkIn);
      });

      const stats: DailyStats[] = Object.entries(statsByDate).map(([date, checkIns]) => {
        // Total, inbound, outbound counts are based on checked_out status only
        const checkedOutCheckIns = checkIns.filter(c => c.status === 'checked_out');
        const totalCheckedOut = checkedOutCheckIns.length;
        const totalInbound    = checkedOutCheckIns.filter(c => c.load_type === 'inbound').length;
        const totalOutbound   = checkedOutCheckIns.filter(c => c.load_type === 'outbound').length;

        // Online check-ins, on-time, and detention use all check-ins
        const onlineCheckIns = checkIns.filter(c =>
          c.driver_name && c.driver_name !== 'N/A' &&
          c.driver_phone && c.driver_phone !== 'N/A'
        ).length;

        const checkInsWithAppointments = checkIns.filter(c =>
          c.appointment_time &&
          c.appointment_time !== 'work_in' &&
          c.appointment_time !== 'paid_to_load' &&
          c.appointment_time !== 'paid_charge_customer'
        );

        const onTimeCount = checkInsWithAppointments.filter(c =>
          isOnTime(c.check_in_time, c.appointment_time)
        ).length;

        const onTimePercentage = checkInsWithAppointments.length > 0
          ? Math.round((onTimeCount / checkInsWithAppointments.length) * 100)
          : 0;

        const detentionInstances: DetentionInstance[] = checkIns
          .map(checkIn => {
            const detention = calculateDetention(checkIn);
            if (!detention.hasDetention) return null;
            if (checkIn.carrier_name?.toLowerCase().includes('vision')) return null;
            return {
              reference_number: checkIn.reference_number || '',
              check_in_time:    checkIn.check_in_time,
              appointment_time: checkIn.appointment_time || '',
              end_time:         checkIn.end_time || '',
              detention_minutes: detention.minutes,
              carrier_name:     checkIn.carrier_name || 'N/A'
            };
          })
          .filter((d): d is DetentionInstance => d !== null);

        const halfHourBreakdown: { [key: string]: number } = {};
        checkIns.forEach(c => {
          const slot = getHalfHourSlot(c.check_in_time);
          halfHourBreakdown[slot] = (halfHourBreakdown[slot] || 0) + 1;
        });

        const dockSetCounts: { [label: string]: number } = {};
        DOCK_SETS.forEach(s => { dockSetCounts[s.label] = 0; });
        checkIns.forEach(c => {
          const label = getDockSetLabel(c.dock_number);
          if (label) dockSetCounts[label] = (dockSetCounts[label] || 0) + 1;
        });

        const dockSetUsage = DOCK_SETS.map(s => ({
          label: s.label,
          count: dockSetCounts[s.label] || 0
        }));

        return {
          date,
          totalInbound,
          totalOutbound,
          totalCheckedOut,
          onlineCheckIns,
          onTimeCount,
          onTimePercentage,
          detentionInstances,
          halfHourBreakdown,
          dockSetUsage
        };
      });

      stats.sort((a, b) => b.date.localeCompare(a.date));
      setDailyStats(stats);
    } catch (err) {
      console.error('Error fetching tracking data:', err);
      setError('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  };

  // ── Range totals (only computed when > 1 day of data) ─────────────────────
  const isMultiDay = dailyStats.length > 1;

  const rangeTotals = isMultiDay ? (() => {
    const totalCheckedOut = dailyStats.reduce((s, d) => s + d.totalCheckedOut, 0);
    const totalInbound    = dailyStats.reduce((s, d) => s + d.totalInbound, 0);
    const totalOutbound   = dailyStats.reduce((s, d) => s + d.totalOutbound, 0);
    const onlineCheckIns  = dailyStats.reduce((s, d) => s + d.onlineCheckIns, 0);
    const onTimeCount     = dailyStats.reduce((s, d) => s + d.onTimeCount, 0);
    const totalDetention  = dailyStats.reduce((s, d) => s + d.detentionInstances.length, 0);
    const days            = dailyStats.length;

    const totalWithAppt = dailyStats.reduce((s, d) =>
      s + (d.onTimePercentage > 0 ? Math.round(d.onTimeCount / (d.onTimePercentage / 100)) : 0), 0
    );
    const onTimePercentage = totalWithAppt > 0
      ? Math.round((onTimeCount / totalWithAppt) * 100)
      : 0;

    const dockSetUsage = DOCK_SETS.map(s => ({
      label: s.label,
      count: dailyStats.reduce((sum, d) => {
        const match = d.dockSetUsage.find(ds => ds.label === s.label);
        return sum + (match ? match.count : 0);
      }, 0)
    }));

    const halfHourBreakdown: { [key: string]: number } = {};
    dailyStats.forEach(d => {
      Object.entries(d.halfHourBreakdown).forEach(([slot, count]) => {
        halfHourBreakdown[slot] = (halfHourBreakdown[slot] || 0) + count;
      });
    });

    return { totalCheckedOut, totalInbound, totalOutbound, onlineCheckIns, onTimeCount, onTimePercentage, totalDetention, days, dockSetUsage, halfHourBreakdown };
  })() : null;

  const isToday     = startDate === today     && endDate === today;
  const isYesterday = startDate === yesterday && endDate === yesterday;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Data Tracking" />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* ── Date Range Picker ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleToday}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  isToday
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Today
              </button>
              <button
                onClick={handleYesterday}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  isYesterday
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={fetchTrackingData}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* ── States ── */}
        {loading && (
          <div className="text-center py-16 text-gray-400 text-sm font-medium">Loading…</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
        {!loading && !error && dailyStats.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm font-medium">
            No data found for the selected date range.
          </div>
        )}

        {/* ── Range Totals Banner (multi-day only) ── */}
        {!loading && rangeTotals && (
          <div className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm overflow-hidden">
            <div className="bg-blue-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-base tracking-tight">Range Total</h2>
                <p className="text-blue-200 text-xs mt-0.5">
                  {formatDateShort(startDate)} — {formatDateShort(endDate)}
                </p>
              </div>
              <span className="bg-blue-600 text-blue-100 text-xs font-bold px-3 py-1 rounded-full">
                {rangeTotals.days} days
              </span>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <RangeCard
                  label="Checked Out"
                  value={rangeTotals.totalCheckedOut}
                  sub={`avg ${Math.round(rangeTotals.totalCheckedOut / rangeTotals.days)}/day`}
                  accent="bg-gray-400"
                  textColor="text-gray-800"
                />
                <RangeCard
                  label="Inbound"
                  value={rangeTotals.totalInbound}
                  sub={`avg ${Math.round(rangeTotals.totalInbound / rangeTotals.days)}/day`}
                  accent="bg-emerald-500"
                  textColor="text-emerald-700"
                />
                <RangeCard
                  label="Outbound"
                  value={rangeTotals.totalOutbound}
                  sub={`avg ${Math.round(rangeTotals.totalOutbound / rangeTotals.days)}/day`}
                  accent="bg-blue-500"
                  textColor="text-blue-700"
                />
                <RangeCard
                  label="On-Time"
                  value={rangeTotals.onTimeCount}
                  sub={`${rangeTotals.onTimePercentage}% on time`}
                  accent="bg-violet-500"
                  textColor="text-violet-700"
                />
                <RangeCard
                  label="Online Check-Ins"
                  value={rangeTotals.onlineCheckIns}
                  sub={`${rangeTotals.totalCheckedOut > 0 ? Math.round((rangeTotals.onlineCheckIns / rangeTotals.totalCheckedOut) * 100) : 0}% self-served`}
                  accent="bg-orange-400"
                  textColor="text-orange-600"
                />
                <RangeCard
                  label="Detention"
                  value={rangeTotals.totalDetention}
                  sub={`avg ${Math.round(rangeTotals.totalDetention / rangeTotals.days)}/day`}
                  accent="bg-red-400"
                  textColor="text-red-600"
                />
              </div>
            </div>

            {/* Range — Dock Set Usage */}
            <div className="px-6 pb-5 border-t border-blue-50">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-4 mb-3">Dock Set Usage</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {rangeTotals.dockSetUsage.map(ds => (
                  <div
                    key={ds.label}
                    className={`rounded-lg p-3 text-center border transition-colors ${
                      ds.count > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <p className="text-xs text-gray-400 font-semibold mb-1">Docks {ds.label}</p>
                    <p className={`text-2xl font-bold leading-none ${ds.count > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
                      {ds.count}
                    </p>
                    {ds.count > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        avg {Math.round(ds.count / rangeTotals.days)}/day
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Range — Half-Hour Breakdown */}
            {Object.keys(rangeTotals.halfHourBreakdown).length > 0 && (
              <div className="px-6 pb-6 border-t border-blue-50">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-4 mb-3">Check-Ins by Half Hour</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rangeTotals.halfHourBreakdown)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([slot, count]) => (
                      <div
                        key={slot}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5"
                      >
                        <span className="font-semibold text-gray-700 font-mono">{slot}</span>
                        <span className="text-gray-400 text-xs">({count})</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Day Cards ── */}
        {!loading && dailyStats.map(stat => (
          <div key={stat.date} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Date Header */}
            <div className="bg-blue-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold text-base tracking-tight">{formatDate(stat.date)}</h2>
              <span className="text-blue-200 text-xs font-mono">{stat.date}</span>
            </div>

            {/* Summary Cards */}
            <div className="p-6 border-b border-gray-100">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Summary</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard
                  label="Checked Out"
                  value={stat.totalCheckedOut}
                  accent="bg-gray-400"
                  textColor="text-gray-800"
                />
                <StatCard label="Inbound" value={stat.totalInbound} accent="bg-emerald-500" textColor="text-emerald-700" />
                <StatCard label="Outbound" value={stat.totalOutbound} accent="bg-blue-500" textColor="text-blue-700" />
                <StatCard
                  label="On-Time"
                  value={stat.onTimeCount}
                  sub={`${stat.onTimePercentage}% on time`}
                  accent="bg-violet-500"
                  textColor="text-violet-700"
                />
                <StatCard
                  label="Online Check-Ins"
                  value={stat.onlineCheckIns}
                  sub={`${stat.totalCheckedOut > 0 ? Math.round((stat.onlineCheckIns / stat.totalCheckedOut) * 100) : 0}% self-served`}
                  accent="bg-orange-400"
                  textColor="text-orange-600"
                />
              </div>
            </div>

            {/* Dock Set Usage */}
            <Section title="Dock Set Usage">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {stat.dockSetUsage.map(ds => (
                  <div
                    key={ds.label}
                    className={`rounded-lg p-3 text-center border transition-colors ${
                      ds.count > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <p className="text-xs text-gray-400 font-semibold mb-1">Docks {ds.label}</p>
                    <p className={`text-2xl font-bold leading-none ${ds.count > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
                      {ds.count}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Half-Hour Breakdown */}
            {Object.keys(stat.halfHourBreakdown).length > 0 && (
              <Section title="Check-Ins by Half Hour">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stat.halfHourBreakdown)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([slot, count]) => (
                      <div
                        key={slot}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5"
                      >
                        <span className="font-semibold text-gray-700 font-mono">{slot}</span>
                        <span className="text-gray-400 text-xs">({count})</span>
                      </div>
                    ))}
                </div>
              </Section>
            )}

            {/* Detention */}
            <Section
              title="Detention"
              badge={
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
                  stat.detentionInstances.length > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {stat.detentionInstances.length}
                </span>
              }
            >
              {stat.detentionInstances.length === 0 ? (
                <p className="text-sm text-gray-400">No detention instances for this day.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['Reference #', 'Carrier', 'Appt', 'Check-In', 'End Time', 'Detention'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-gray-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stat.detentionInstances.map((d, i) => (
                        <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-red-50/20'}`}>
                          <td className="px-4 py-2.5 font-mono text-gray-800 text-xs">{d.reference_number}</td>
                          <td className="px-4 py-2.5 text-gray-700">{d.carrier_name}</td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono">{d.appointment_time}</td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono">{formatTimeInIndianapolis(d.check_in_time)}</td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono">{formatTimeInIndianapolis(d.end_time)}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
                              {d.detention_minutes} min
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

          </div>
        ))}
      </main>
    </div>
  );
}
