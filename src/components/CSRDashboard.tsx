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
    }, 60000); // Update every minute

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

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }
    
    fetchCheckIns();
    
    const setupSubscription = async () => {
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const supabase = getSupabase();
        
        const subscription = supabase
          .channel('check_ins_changes')
          .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'check_ins' },
            () => {
              fetchCheckIns();
            }
          )
          .subscribe();

        return () => {
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error('Subscription error:', err);
      }
    };

    setupSubscription();
  }, []);

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

  const handleLogout = () => {
    sessionStorage.removeItem('csr_auth');
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

          {/* Compact Stats in One Line */}
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

        {/* Check-ins Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Carrier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trailer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Check-in Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Appointment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dwell Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {checkIns.map((checkIn) => (
                  <tr key={checkIn.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{checkIn.driver_name}</div>
                      <div className="text-sm text-gray-500">{checkIn.phone_number}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {checkIn.carrier_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {checkIn.trailer_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatInTimeZone(parseISO(checkIn.check_in_time), TIMEZONE, 'h:mm a')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {checkIn.appointment_time ? (
                        <div>
                          <div className="text-sm text-gray-900">
                            {formatInTimeZone(parseISO(checkIn.appointment_time), TIMEZONE, 'h:mm a')}
                          </div>
                          {isEarlyArrival(checkIn) && (
                            <span className="text-xs text-orange-600 font-semibold">Early</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">No appointment</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm ${getDwellTimeColor(checkIn)}`}>
                        {calculateDwellTime(checkIn)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {checkIn.dock_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={checkIn.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        {checkIn.status === 'pending' && (
                          <button
                            onClick={() => {
                              setSelectedCheckIn(checkIn);
                              setNotes(checkIn.notes || '');
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Assign Dock
                          </button>
                        )}
                        {checkIn.status === 'assigned' && (
                          <button
                            onClick={() => updateStatus(checkIn.id, 'loading')}
                            className="text-purple-600 hover:text-purple-900"
                          >
                            Start Loading
                          </button>
                        )}
                        {checkIn.status === 'loading' && (
                          <button
                            onClick={() => updateStatus(checkIn.id, 'completed')}
                            className="text-green-600 hover:text-green-900"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assign Dock Modal */}
        {selectedCheckIn && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">Assign Dock</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Driver: {selectedCheckIn.driver_name}
                  </label>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trailer: {selectedCheckIn.trailer_number}
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dock Number
                  </label>
                  <input
                    type="text"
                    value={dockNumber}
                    onChange={(e) => setDockNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter dock number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Appointment Time (Optional)
                  </label>
                  <select
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">No appointment</option>
                    {timeSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.display}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Add any notes..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={assignDock}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
                  >
                    Assign
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCheckIn(null);
                      setDockNumber('');
                      setAppointmentTime('');
                      setNotes('');
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
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
