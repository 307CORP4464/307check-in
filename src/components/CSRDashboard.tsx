'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { CheckIn, CheckInStatus } from '@/types';
import { format, parseISO, isBefore, differenceInMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { RefreshCw, Clock, Truck, Package, CheckCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';

const TIMEZONE = 'America/Indiana/Indianapolis';

export default function CSRDashboard() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckIn | null>(null);
  const [dockNumber, setDockNumber] = useState<string>('');
  const [appointmentTime, setAppointmentTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const router = useRouter();
  const hanfleLogout = async () => {
    try{
      await aupabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Update current time every minute for live dwell time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Generate appointment time options (8 AM to 3:30 PM in 30-minute intervals)
  const generateTimeSlots = useCallback(() => {
    const slots: { value: string; display: string }[] = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 15 && minute > 30) continue;
        const time = `${hour.toString().padStart(2, '0')}:${minute
          .toString()
          .padStart(2, '0')}`;
        const display = format(new Date(`2000-01-01T${time}`), 'h:mm a');
        slots.push({ value: time, display });
      }
    }
    return slots;
  }, []);

  const timeSlots = useMemo(() => generateTimeSlots(), [generateTimeSlots]);

  const fetchCheckIns = async () => {
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', today.toISOString())
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      setCheckIns(data || []);
    } catch (err) {
      console.error('Error fetching check-ins:', err);
      setError('Failed to load check-ins');
    } finally {
      setLoading(false);
    }
  };

  // Initialize: config and subscription
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    fetchCheckIns();

    let subscription: any;

    const setupSubscription = async () => {
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const supabase = getSupabase();

        subscription = supabase
          .channel('check_ins_changes')
          .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'check_ins' },
            () => {
              fetchCheckIns();
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Subscription error:', err);
      }
    };

    setupSubscription();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Update status
  const updateStatus = async (id: string, status: CheckInStatus) => {
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();

      const { error } = await supabase
        .from('check_ins')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      fetchCheckIns();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  // Assign or update dock
  const assignDock = async () => {
    if (!selectedCheckIn || !dockNumber) {
      alert('Please select a dock number');
      return;
    }

    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();

      let appointmentDateTime: string | null = null;
      if (appointmentTime) {
        const today = formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd');
        appointmentDateTime = `${today}T${appointmentTime}:00`;
      }

      const { error } = await supabase
        .from('check_ins')
        .update({ 
          dock_number: dockNumber,
          appointment_time: appointmentDateTime,
          status: 'assigned',
          notes: notes || selectedCheckIn.notes
        })
        .eq('id', selectedCheckIn.id);

      if (error) throw error;

      setSelectedCheckIn(null);
      setDockNumber('');
      setAppointmentTime('');
      setNotes('');
      fetchCheckIns();
    } catch (error) {
      console.error('Error assigning dock:', error);
      alert('Failed to assign dock');
    }
  };

  // Logout
  const handleLogout = async () => {
    const { signOut } = await import('@/lib/auth');
    await signOut();
    router.push('/dashboard/login');
  };

  // Helpers
  const isEarlyArrival = (checkIn: CheckIn) => {
    if (!checkIn.appointment_time) return false;
    const checkInTime = parseISO(checkIn.check_in_time);
    const appointmentTime = parseISO(checkIn.appointment_time);
    return isBefore(checkInTime, appointmentTime);
  };

  const calculateDwellTime = (checkIn: CheckIn) => {
    const checkInTime = parseISO(checkIn.check_in_time);
    const dwellMinutes = differenceInMinutes(currentTime, checkInTime);
    return formatDwellTime(dwellMinutes);
  };

  const formatDwellTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const getDwellTimeColor = (checkIn: CheckIn) => {
    const checkInTime = parseISO(checkIn.check_in_time);
    const dwellMinutes = differenceInMinutes(currentTime, checkInTime);

    if (dwellMinutes < 60) return 'text-green-600 font-semibold';
    if (dwellMinutes < 120) return 'text-yellow-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  // Derived stats
  const stats = useMemo(() => ({
    pending: checkIns.filter(c => c.status === 'pending').length,
    assigned: checkIns.filter(c => c.status === 'assigned').length,
    loading: checkIns.filter(c => c.status === 'loading').length,
    completed: checkIns.filter(c => c.status === 'completed').length,
  }), [checkIns]);

  // Close modal on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCheckIn) {
        setSelectedCheckIn(null);
        setDockNumber('');
        setAppointmentTime('');
        setNotes('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCheckIn]);

  // Optional: prevent body scroll when modal open
  useEffect(() => {
    if (selectedCheckIn) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedCheckIn]);

  // focus management note: you may want to set focus to a modal element when opened

  // Early return on error
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Configuration Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Quick header panel with date/time and actions */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CSR Dashboard</h1>
              <p className="text-sm text-gray-600">
                {formatInTimeZone(new Date(), TIMEZONE, 'EEEE, MMMM d, yyyy - h:mm a zzz')}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchCheckIns}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Clock className="text-yellow-600" size={20} />
              <div>
                <span className="text-sm text-gray-600">Pending: </span>
                <span className="text-lg font-bold text-yellow-600">{stats.pending}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Package className="text-blue-600" size={20} />
              <div>
                <span className="text-sm text-gray-600">Assigned: </span>
                <span className="text-lg font-bold text-blue-600">{stats.assigned}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="text-purple-600" size={20} />
              <div>
                <span className="text-sm text-gray-600">Loading: </span>
                <span className="text-lg font-bold text-purple-600">{stats.loading}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="text-green-600" size={20} />
              <div>
                <span className="text-sm text-gray-600">Completed: </span>
                <span className="text-lg font-bold text-green-600">{stats.completed}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Assign Dock Modal (inline, shown when editing/assigning) */}
        {selectedCheckIn && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            aria-modal="true"
            role="dialog"
            aria-label="Assign Dock"
          >
            <div className="bg-white rounded-lg w-full max-w-3xl shadow-xl relative" style={{ maxHeight: '90vh', overflow: 'auto' }}>
              <div className="absolute top-2 right-2 text-gray-500 cursor-pointer" onClick={() => {
                setSelectedCheckIn(null);
                setDockNumber('');
                setAppointmentTime('');
                setNotes('');
              }} aria-label="Close">
                ✕
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4 text-gray-900" id="modal-title">
                  {selectedCheckIn.dock_number ? 'Edit Assignment' : 'Assign Dock'}
                </h3>

                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Pickup Number</p>
                        <p className="font-semibold text-gray-900">{selectedCheckIn.pickup_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Trailer</p>
                        <p className="font-semibold text-gray-900">{selectedCheckIn.trailer_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Carrier</p>
                        <p className="font-medium text-gray-900">{selectedCheckIn.carrier_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Driver</p>
                        <p className="font-medium text-gray-900">{selectedCheckIn.driver_name}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Checked In</p>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {format(new Date(selectedCheckIn.check_in_time), 'h:mm a')}
                          </p>
                          {isEarlyArrival(selectedCheckIn) && (
                            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                              <CheckCircle size={14} />
                              Early Arrival
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dock Number <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={dockNumber}
                        onChange={(e) => setDockNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="">Select a dock...</option>
                        {Array.from({ length: 70 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={String(d)}>
                            Dock {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Appointment Time (Optional)
                      </label>
                      <select
                        value={appointmentTime}
                        onChange={(e) => setAppointmentTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">No appointment time</option>
                        {timeSlots.map((slot) => (
                          <option key={slot.value} value={slot.value}>
                            {slot.display}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Set if driver had a scheduled appointment
                      </p>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notes (Optional)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                        placeholder="Add any special instructions or notes..."
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2 flex-wrap">
                    <button
                      onClick={assignDock}
                      disabled={!dockNumber}
                      className="flex-1 min-w-[120px] bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {selectedCheckIn.dock_number ? 'Update' : 'Assign Dock'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedCheckIn(null);
                        setDockNumber('');
                        setAppointmentTime('');
                        setNotes('');
                      }}
                      className="flex-1 min-w-[120px] bg-gray-200 text-gray-800 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

       {/* Section: List of check-ins */}
<div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {checkIns.map((ci) => {
    const dwell = calculateDwellTime(ci);
    const dwellColor = getDwellTimeColor(ci);
    return (
      <div key={ci.id} className="bg-white border rounded-lg p-4 shadow-sm flex flex-col">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">Check-in #{ci.id.slice(0, 8)}</div>
            <div className="text-sm text-gray-600">
              Check-in: {format(parseISO(ci.check_in_time), 'yyyy-MM-dd HH:mm')}
            </div>
          </div>
          <StatusBadge status={ci.status} />
        </div>


                <div className="mt-2 text-sm text-gray-700">
                  Dock: {ci.dock_number ?? 'Unassigned'}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <span className={`font-semibold ${dwellColor}`}>{dwell}</span>
                  <span className="text-xs text-gray-500">Dwell time</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    onClick={() => updateStatus(ci.id, 'completed')}
                  >
                    Complete
                  </button>
                  <button
                    className="flex-1 px-3 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
                    onClick={() => {
                      setSelectedCheckIn(ci);
                      setDockNumber(ci.dock_number ?? '');
                      setAppointmentTime(
                        ci.appointment_time
                          ? formatInTimeZone(parseISO(ci.appointment_time), TIMEZONE, 'HH:mm')
                          : ''
                      );
                      setNotes(ci.notes ?? '');
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {checkIns.length === 0 && (
          <div className="text-center py-12 text-gray-500">No check-ins found for today</div>
        )}
      </div>
    </div>
  );
}
