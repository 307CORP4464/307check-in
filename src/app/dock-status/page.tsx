'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';

interface OrderInfo {
  id: string;
  po_number: string;
  driver_name: string;
  status: string;
  check_in_time: string;
}

interface DockStatus {
  dock_number: string;
  status: 'available' | 'in-use' | 'double-booked' | 'blocked';
  orders: OrderInfo[];
  is_manually_blocked: boolean;
  blocked_reason?: string;
}

const TOTAL_DOCKS = 70;

export default function DockStatusPage() {
  const [dockStatuses, setDockStatuses] = useState<DockStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedDock, setSelectedDock] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'in-use' | 'double-booked' | 'blocked'>('all');

  useEffect(() => {
    initializeDocks();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('dock-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_log'
        },
        () => {
          initializeDocks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const initializeDocks = async () => {
    setLoading(true);
    
    // Step 1: Create all 70 docks with default status
    const allDocks: DockStatus[] = [];
    
    for (let i = 1; i <= TOTAL_DOCKS; i++) {
      allDocks.push({
        dock_number: i.toString(),
        status: 'available',
        orders: [],
        is_manually_blocked: false,
        blocked_reason: undefined
      });
    }

    // Step 2: Get blocked docks from localStorage
    if (typeof window !== 'undefined') {
      try {
        const blockedStr = localStorage.getItem('blocked_docks');
        if (blockedStr) {
          const blocked = JSON.parse(blockedStr);
          Object.keys(blocked).forEach(dockNum => {
            const dockIndex = parseInt(dockNum) - 1;
            if (dockIndex >= 0 && dockIndex < TOTAL_DOCKS) {
              allDocks[dockIndex].status = 'blocked';
              allDocks[dockIndex].is_manually_blocked = true;
              allDocks[dockIndex].blocked_reason = blocked[dockNum].reason;
            }
          });
        }
      } catch (error) {
        console.error('Error loading blocked docks:', error);
      }
    }

    // Step 3: Fetch active orders from daily_log
    try {
      const { data: logs, error } = await supabase
        .from('daily_log')
        .select('*')
        .neq('status', 'complete');

      if (error) {
        console.error('Supabase error:', error);
      }

      // Step 4: Assign orders to docks
      if (logs && logs.length > 0) {
        logs.forEach((log) => {
          if (log.dock_number) {
            const dockNum = parseInt(log.dock_number);
            const dockIndex = dockNum - 1;
            
            if (dockIndex >= 0 && dockIndex < TOTAL_DOCKS) {
              const dock = allDocks[dockIndex];
              
              // Only add orders if not manually blocked
              if (!dock.is_manually_blocked) {
                dock.orders.push({
                  id: log.id,
                  po_number: log.po_number,
                  driver_name: log.driver_name,
                  status: log.status,
                  check_in_time: log.check_in_time
                });

                // Update status based on order count
                if (dock.orders.length === 1) {
                  dock.status = 'in-use';
                } else if (dock.orders.length > 1) {
                  dock.status = 'double-booked';
                }
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }

    console.log('Initialized docks:', allDocks.length);
    setDockStatuses(allDocks);
    setLoading(false);
  };

  const handleBlockDock = (dockNumber: string) => {
    setSelectedDock(dockNumber);
    const dock = dockStatuses.find(d => d.dock_number === dockNumber);
    setBlockReason(dock?.blocked_reason || '');
    setShowBlockModal(true);
  };

  const handleUnblockDock = (dockNumber: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const blockedStr = localStorage.getItem('blocked_docks');
      const blocked = blockedStr ? JSON.parse(blockedStr) : {};
      delete blocked[dockNumber];
      localStorage.setItem('blocked_docks', JSON.stringify(blocked));
      initializeDocks();
    } catch (error) {
      console.error('Error unblocking dock:', error);
    }
  };

  const submitBlockDock = () => {
    if (!selectedDock || !blockReason.trim()) {
      alert('Please enter a reason for blocking this dock');
      return;
    }

    if (typeof window === 'undefined') return;

    try {
      const blockedStr = localStorage.getItem('blocked_docks');
      const blocked = blockedStr ? JSON.parse(blockedStr) : {};
      blocked[selectedDock] = { reason: blockReason.trim() };
      localStorage.setItem('blocked_docks', JSON.stringify(blocked));
      
      setShowBlockModal(false);
      setSelectedDock(null);
      setBlockReason('');
      initializeDocks();
    } catch (error) {
      console.error('Error blocking dock:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'in-use':
        return 'bg-yellow-100 text-yellow-800';
      case 'double-booked':
        return 'bg-red-100 text-red-800';
      case 'blocked':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return '✓';
      case 'in-use':
        return '●';
      case 'double-booked':
        return '⚠';
      case 'blocked':
        return '🚫';
      default:
        return '';
    }
  };

  const filteredDocks = filter === 'all' 
    ? dockStatuses 
    : dockStatuses.filter(dock => dock.status === filter);

  const stats = {
    available: dockStatuses.filter(d => d.status === 'available').length,
    inUse: dockStatuses.filter(d => d.status === 'in-use').length,
    doubleBooked: dockStatuses.filter(d => d.status === 'double-booked').length,
    blocked: dockStatuses.filter(d => d.status === 'blocked').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-600">Loading dock statuses...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dock Status Monitor</h1>
          <p className="mt-2 text-gray-600">
            Real-time dock availability and assignments (Docks 1-70)
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Showing {dockStatuses.length} total docks
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-2xl font-bold text-gray-900">{stats.available}</div>
            <div className="text-sm text-gray-600">Available</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <div className="text-2xl font-bold text-gray-900">{stats.inUse}</div>
            <div className="text-sm text-gray-600">In Use</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="text-2xl font-bold text-gray-900">{stats.doubleBooked}</div>
            <div className="text-sm text-gray-600">Double Booked</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-500">
            <div className="text-2xl font-bold text-gray-900">{stats.blocked}</div>
            <div className="text-sm text-gray-600">Blocked</div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="mb-6 flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
            }`}
          >
            All Docks ({dockStatuses.length})
          </button>
          <button
            onClick={() => setFilter('available')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'available'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
            }`}
          >
            Available ({stats.available})
          </button>
          <button
            onClick={() => setFilter('in-use')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'in-use'
                ? 'bg-yellow-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
            }`}
          >
            In Use ({stats.inUse})
          </button>
          <button
            onClick={() => setFilter('double-booked')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'double-booked'
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
            }`}
          >
            Double Booked ({stats.doubleBooked})
          </button>
          <button
            onClick={() => setFilter('blocked')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'blocked'
                ? 'bg-gray-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow'
            }`}
          >
            Blocked ({stats.blocked})
          </button>
        </div>

        {/* Complete Dock List Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Complete Dock Status List
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dock #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active Orders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No docks match the current filter
                    </td>
                  </tr>
                ) : (
                  filteredDocks.map((dock) => (
                    <tr 
                      key={dock.dock_number} 
                      className={
                        dock.status === 'double-booked' 
                          ? 'bg-red-50' 
                          : dock.status === 'blocked'
                          ? 'bg-gray-50'
                          : ''
                      }
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        Dock {dock.dock_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(dock.status)}`}
                        >
                          <span>{getStatusIcon(dock.status)}</span>
                          <span>{dock.status.replace('-', ' ').toUpperCase()}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {dock.is_manually_blocked ? (
                          <span className="text-gray-500 italic">Blocked</span>
                        ) : (
                          <span className="font-semibold">{dock.orders.length}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {dock.is_manually_blocked ? (
                          <div className="text-gray-700">
                            <span className="font-medium">Reason: </span>
                            {dock.blocked_reason}
                          </div>
                        ) : dock.orders.length > 0 ? (
                          <div className="space-y-1">
                            {dock.orders.map((order) => (
                              <div key={order.id} className="text-xs">
                                <span className="font-medium">PO: {order.po_number}</span> - {order.driver_name}
                                <span className="ml-2 text-gray-400 capitalize">({order.status})</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">No active orders</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {dock.is_manually_blocked ? (
                          <button
                            onClick={() => handleUnblockDock(dock.dock_number)}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            Unblock
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlockDock(dock.dock_number)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Block Dock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Block Dock Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Block Dock {selectedDock}
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              This will mark the dock as blocked for dropped trailers or maintenance. 
              The dock will not accept new orders until unblocked.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for blocking *
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g., Dropped trailer - PO #12345, Maintenance required, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={submitBlockDock}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                Block Dock
              </button>
              <button
                onClick={() => {
                  setShowBlockModal(false);
                  setSelectedDock(null);
                  setBlockReason('');
                }}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
