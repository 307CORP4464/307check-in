'use client';

import { useEffect, useState } from 'react';
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
  const [dockNumber, setDockNumber] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [notes, setNotes] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const router = useRouter();

  // Update current time every minute for live dwell time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Generate appointment time options (8 AM to 3:30 PM in 30-minute intervals)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 15 && minute === 30) {
          const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          const display = format(new Date(`2000-01-01T${time}`), 'h:mm a');
          slots.push({ value: time, display });
          break;
        }
        if (hour > 15) break;
        
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const display = format(new Date(`2000-01-01T${time}`), 'h:mm a');
        slots.push({ value: time, display });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

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
    } catch (error) {
      console.error('Error fetching check-ins:', error);
      setError('Failed to load check-ins');
    } finally {
      setLoading(false);
    }
  };

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

  const assignDock = async () => {
    if (!selectedCheckIn || !dockNumber) {
      alert('Please select a dock number');
      return;
    }

    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();

      let appointmentDateTime = null;
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

 const handleLogout = async () => {
  const { signOut } = await import('@/lib/auth');
  await signOut();
  router.push('/dashboard/login');
};

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
    
    if (hours === 0) {
      return `${mins}m`;
    }
    return `${hours}h ${mins}m`;
  };

  const getDwellTimeColor = (checkIn: CheckIn) => {
    const checkInTime = parseISO(checkIn.check_in_time);
    const dwellMinutes = differenceInMinutes(currentTime, checkInTime);
    
    if (dwellMinutes < 60) return 'text-green-600 font-semibold';
    if (dwellMinutes < 120) return 'text-yellow-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  const stats = {
    pending: checkIns.filter(c => c.status === 'pending').length,
    assigned: checkIns.filter(c => c.status === 'assigned').length,
    loading: checkIns.filter(c => c.status === 'loading').length,
    completed: checkIns.filter(c => c.status === 'completed').length,
  };

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

       <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dock Number <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dockNumber}
                    onChange={(e) => setDockNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a dock...</option>
                    <option value="A-1">Dock A-1</option>
                    <option value="A-2">Dock A-2</option>
                    <option value="A-3">Dock A-3</option>
                    <option value="A-4">Dock A-4</option>
                    <option value="B-1">Dock B-1</option>
                    <option value="B-2">Dock B-2</option>
                    <option value="B-3">Dock B-3</option>
                    <option value="B-4">Dock B-4</option>
                    <option value="C-1">Dock C-1</option>
                    <option value="C-2">Dock C-2</option>
                    <option value="C-3">Dock C-3</option>
                    <option value="C-4">Dock C-4</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Appointment Time (Optional)
                  </label>
                  <select
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Add any special instructions or notes..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={assignDock}
                    disabled={!dockNumber}
                    className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    className="flex-1 bg-gray-200 text-gray-800 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
