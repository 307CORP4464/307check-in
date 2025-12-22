// src/components/CSRDashboard.tsx

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckIn, CheckInStatus } from '@/types';
import { format } from 'date-fns';
import { RefreshCw, Clock, Truck, Package } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function CSRDashboard() {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckIn | null>(null);
  const [dockNumber, setDockNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchCheckIns();
    
    // Subscribe to real-time updates
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
  }, []);

  const fetchCheckIns = async () => {
    try {
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
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: CheckInStatus) => {
    try {
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
    if (!selectedCheckIn || !dockNumber) return;

    try {
      const { error } = await supabase
        .from('check_ins')
        .update({ 
          dock_number: dockNumber,
          status: 'assigned',
          notes: notes || selectedCheckIn.notes
        })
        .eq('id', selectedCheckIn.id);

      if (error) throw error;
      
      setSelectedCheckIn(null);
      setDockNumber('');
      setNotes('');
      fetchCheckIns();
    } catch (error) {
      console.error('Error assigning dock:', error);
      alert('Failed to assign dock');
    }
  };

  const stats = {
    pending: checkIns.filter(c => c.status === 'pending').length,
    assigned: checkIns.filter(c => c.status === 'assigned').length,
    loading: checkIns.filter(c => c.status === 'loading').length,
    completed: checkIns.filter(c => c.status === 'completed').length,
  };

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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                    Driver
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Destination
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(checkIn.check_in_time), 'h:mm a')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {checkIn.pickup_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {checkIn.carrier_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{checkIn.driver_name}</div>
                      <div className="text-gray-500">{checkIn.driver_phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {checkIn.destination_city}, {checkIn.destination_state}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {checkIn.dock_number || '-'}
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
                            setNotes(checkIn.notes || '');
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Assign
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assign Dock Modal */}
        {selectedCheckIn && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Assign Dock</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Pickup Number</p>
                  <p className="font-semibold">{selectedCheckIn.pickup_number}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dock Number
                  </label>
                  <input
                    type="text"
                    value={dockNumber}
                    onChange={(e) => setDockNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., A-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                      setNotes('');
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300"
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
