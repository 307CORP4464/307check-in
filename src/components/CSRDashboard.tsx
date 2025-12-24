'use client';

import { useEffect, useState } from 'react';
import { CheckIn, CheckInStatus } from '@/types';
import { format, parseISO, isBefore } from 'date-fns';
import { RefreshCw, Clock, Truck, Package, CheckCircle, AlertCircle } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function CSRDashboard() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckIn | null>(null);
  const [dockNumber, setDockNumber] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [notes, setNotes] = useState('');

  // Generate appointment time options (6 AM to 6 PM in 30-minute intervals)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 1530; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 15 && minute === 30) break; // Stop at 15:30 PM
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const display = format(new Date(`2000-01-01T${time}`), 'h:mm a');
        slots.push({ value: time, display });
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  useEffect(() => {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }
    
    fetchCheckIns();
    
    // Subscribe to real-time updates
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

      // Combine today's date with selected time
      let appointmentDateTime = null;
      if (appointmentTime) {
        const today = format(new Date(), 'yyyy-MM-dd');
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

  // Check if driver arrived early
  const isEarlyArrival = (checkIn: CheckIn) => {
    if (!checkIn.appointment_time) return false;
    const checkInTime = parseISO(checkIn.check_in_time);
    const appointmentTime = parseISO(checkIn.appointment_time);
    return isBefore(checkInTime, appointmentTime);
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
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">CSR Dashboard</h1>
            <p className="text-gray-600 mt-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <button
            onClick={fetchCheckIns}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="text-yellow-600" size={32} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Assigned</p>
                <p className="text-3xl font-bold text-blue-600">{stats.assigned}</p>
              </div>
              <Package className="text-blue-600" size={32} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Loading</p>
                <p className="text-3xl font-bold text-purple-600">{stats.loading}</p>
              </div>
              <Truck className="text-purple-600" size={32} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <CheckCircle className="text-green-600" size={32} />
            </div>
          </div>
        </div>

        {/* Check-ins Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pickup #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Carrier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trailer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Appt Time
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
                {checkIns.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                      No check-ins today. Drivers can check in at the driver portal.
                    </td>
                  </tr>
                ) : (
                  checkIns.map((checkIn) => (
                    <tr key={checkIn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          {isEarlyArrival(checkIn) && (
                            <span className="flex items-center gap-1 text-green-600" title="Arrived early">
                              <CheckCircle size={16} />
                            </span>
                          )}
                          <span className="text-gray-900">
                            {format(new Date(checkIn.check_in_time), 'h:mm a')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {checkIn.pickup_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.carrier_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.trailer_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{checkIn.driver_name}</div>
                        <div className="text-gray-500">{checkIn.driver_phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {checkIn.destination_city}, {checkIn.destination_state}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {checkIn.appointment_time ? (
                          <div>
                            <div className="text-gray-900 font-medium">
                              {format(parseISO(checkIn.appointment_time), 'h:mm a')}
                            </div>
                            {isEarlyArrival(checkIn) && (
                              <div className="text-xs text-green-600 font-medium">
                                Early ✓
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {checkIn.dock_number ? (
                          <span className="font-semibold text-blue-600">
                            {checkIn.dock_number}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={checkIn.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedCheckIn(checkIn);
                              setDockNumber(checkIn.dock_number || '');
                              setAppointmentTime(
                                checkIn.appointment_time 
                                  ? format(parseISO(checkIn.appointment_time), 'HH:mm')
                                  : ''
                              );
                              setNotes(checkIn.notes || '');
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {checkIn.dock_number ? 'Edit' : 'Assign'}
                          </button>
                          <select
                            value={checkIn.status}
                            onChange={(e) => updateStatus(checkIn.id, e.target.value as CheckInStatus)}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="pending">Pending</option>
                            <option value="assigned">Assigned</option>
                            <option value="loading">Loading</option>
                            <option value="completed">Completed</option>
                            <option value="departed">Departed</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assign Dock Modal */}
        {selectedCheckIn && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-gray-900">
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
                    <option value="1">Dock 1</option>
                    <option value="2">Dock 2</option>
                    <option value="3">Dock 3</option>
                    <option value="4">Dock 4</option>
                    <option value="5">Dock 5</option>
                    <option value="6">Dock 6</option>
                    <option value="7">Dock 7</option>
                    <option value="15">Dock 15</option>
                    <option value="16">Dock 16</option>
                    <option value="17">Dock 17</option>
                    <option value="18">Dock 18</option>
                    <option value="19">Dock 19</option>
                    <option value="20">Dock 20</option>
                    <option value="21">Dock 21</option>
                    <option value="22">Dock 22</option>
                    <option value="23">Dock 23</option>
                    <option value="24">Dock 24</option>
                    <option value="25">Dock 25</option>
                    <option value="26">Dock 26</option>
                    <option value="27">Dock 27</option>
                    <option value="28">Dock 28</option>
                    <option value="29">Dock 29</option>
                    <option value="30">Dock 30</option>
                    <option value="31">Dock 31</option>
                    <option value="32">Dock 32</option>
                    <option value="33">Dock 33</option>
                    <option value="34">Dock 34</option>
                    <option value="35">Dock 35</option>
                    <option value="43">Dock 43</option>
                    <option value="44">Dock 44</option>
                    <option value="45">Dock 45</option>
                    <option value="46">Dock 46</option>
                    <option value="47">Dock 47</option>
                    <option value="48">Dock 48</option>
                    <option value="49">Dock 49</option>
                    <option value="50">Dock 50</option>
                    <option value="51">Dock 51</option>
                    <option value="52">Dock 52</option>
                    <option value="53">Dock 53</option>
                    <option value="54">Dock 54</option>
                    <option value="55">Dock 55</option>
                    <option value="56">Dock 56</option>
                    <option value="57">Dock 57</option>
                    <option value="58">Dock 58</option>
                    <option value="59">Dock 59</option>
                    <option value="64">Dock 64</option>
                    <option value="65">Dock 65</option>
                    <option value="66">Dock 66</option>
                    <option value="67">Dock 67</option>
                    <option value="68">Dock 68</option>
                    <option value="69">Dock 69</option>
                    <option value="70">Dock 70</option>

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
