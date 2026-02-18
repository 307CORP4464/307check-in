'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  current_load_id?: string | null;
}

const TOTAL_DOCKS = 70;

export default function DockStatusPage() {
  const router = useRouter();
  const [dockStatuses, setDockStatuses] = useState<DockStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedDock, setSelectedDock] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'in-use' | 'double-booked' | 'blocked'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    initializeDocks();
    
    const channel = supabase
      .channel('dock-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'check_ins'
        },
        () => {
          initializeDocks();
        }
      )
      .subscribe();

    const handleDockChange = () => initializeDocks();
    if (typeof window !== 'undefined') {
      window.addEventListener('dock-assignment-changed', handleDockChange);
    }

    return () => {
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('dock-assignment-changed', handleDockChange);
      }
    };
  }, []);

  const initializeDocks = async () => {
    setLoading(true);
    
    try {
      const allDocks: DockStatus[] = [];
      for (let i = 1; i <= TOTAL_DOCKS; i++) {
        allDocks.push({
          dock_number: i.toString(),
          status: 'available',
          orders: [],
          is_manually_blocked: false,
          blocked_reason: undefined,
          current_load_id: null
        });
      }

      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('*')
        .in('status', ['checked_in', 'pending'])
        .not('dock_number', 'is', null);

      const dockMap = new Map<string, OrderInfo[]>();
      checkIns?.forEach(checkIn => {
        if (checkIn.dock_number && checkIn.dock_number !== 'Ramp') {
          const existing = dockMap.get(checkIn.dock_number) || [];
          existing.push({
            id: checkIn.id,
            po_number: checkIn.reference_number || 'N/A',
            driver_name: checkIn.driver_name || 'N/A',
            status: checkIn.status,
            check_in_time: checkIn.check_in_time
          });
          dockMap.set(checkIn.dock_number, existing);
        }
      });

      let blockedDocks: Record<string, { reason: string }> = {};
      if (typeof window !== 'undefined') {
        const blockedStr = localStorage.getItem('blocked_docks');
        if (blockedStr) {
          blockedDocks = JSON.parse(blockedStr);
        }
      }

      allDocks.forEach(dock => {
        const orders = dockMap.get(dock.dock_number) || [];
        dock.orders = orders;
        
        if (blockedDocks[dock.dock_number]) {
          dock.status = 'blocked';
          dock.is_manually_blocked = true;
          dock.blocked_reason = blockedDocks[dock.dock_number].reason;
        } else if (orders.length > 1) {
          dock.status = 'double-booked';
        } else if (orders.length === 1) {
          dock.status = 'in-use';
        }
      });

      setDockStatuses(allDocks);
    } catch (error) {
      console.error('Error initializing docks:', error);
    }

    setLoading(false);
  };

  const handleBlockDock = (dockNumber: string) => {
    setSelectedDock(dockNumber);
    const dock = dockStatuses.find(d => d.dock_number === dockNumber);
    setBlockReason(dock?.blocked_reason || '');
    setShowBlockModal(true);
  };

  const handleUnblockDock = async (dockNumber: string) => {
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in-use':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'double-booked':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'blocked':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
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

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  const formatCheckInTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return 'N/A';
    }
  };

  const filteredDocks = useMemo(() => {
    if (filter === 'all') return dockStatuses;
    return dockStatuses.filter(d => d.status === filter);
  }, [dockStatuses, filter]);

  const stats = useMemo(() => ({
    available: dockStatuses.filter(d => d.status === 'available').length,
    inUse: dockStatuses.filter(d => d.status === 'in-use').length,
    doubleBooked: dockStatuses.filter(d => d.status === 'double-booked').length,
    blocked: dockStatuses.filter(d => d.status === 'blocked').length,
  }), [dockStatuses]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md border-b-4 border-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl font-bold text-blue-600">🚚</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dock Status Monitor</h1>
                <p className="text-sm text-gray-600">{formatDate(currentTime)} • {formatTime(currentTime)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link 
                href="/appointments" 
                className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium">
                Appointments
              </Link>  
              <Link
                href="/dock-status"
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium">
                Dock Status
              </Link>    
              <Link
                href="/dashboard"
                className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium">
                Dashboard
              </Link>
              <Link
                href="/logs"
                className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium">
                Daily Logs
              </Link>
              <Link
                href="/tracking"
                className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors font-medium">
                Tracking
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Available</p>
                <p className="text-3xl font-bold text-green-700">{stats.available}</p>
              </div>
              <div className="text-4xl">✓</div>
            </div>
          </div>
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600">In Use</p>
                <p className="text-3xl font-bold text-yellow-700">{stats.inUse}</p>
              </div>
              <div className="text-4xl">●</div>
            </div>
          </div>
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Double Booked</p>
                <p className="text-3xl font-bold text-red-700">{stats.doubleBooked}</p>
              </div>
              <div className="text-4xl">⚠</div>
            </div>
          </div>
          <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Blocked</p>
                <p className="text-3xl font-bold text-gray-700">{stats.blocked}</p>
              </div>
              <div className="text-4xl">🚫</div>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
            }`}
          >
            All Docks
          </button>
          <button
            onClick={() => setFilter('available')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'available' 
                ? 'bg-green-600 text-white' 
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Available
          </button>
          <button
            onClick={() => setFilter('in-use')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'in-use' 
                ? 'bg-yellow-600 text-white' 
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
            }`}
          >
            In Use
          </button>
          <button
            onClick={() => setFilter('double-booked')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'double-booked' 
                ? 'bg-red-600 text-white' 
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Double Booked
          </button>
          <button
            onClick={() => setFilter('blocked')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'blocked' 
                ? 'bg-gray-600 text-white' 
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Blocked
          </button>
        </div>

        {/* Dock Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
          {filteredDocks.map((dock) => (
            <div
              key={dock.dock_number}
              className={`border-2 rounded-lg p-4 transition-all hover:shadow-lg ${getStatusColor(dock.status)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl font-bold">Dock {dock.dock_number}</span>
                <span className="text-2xl">{getStatusIcon(dock.status)}</span>
              </div>
              <div className="text-sm font-medium mb-2 capitalize">{dock.status.replace('-', ' ')}</div>
              
              {dock.orders.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  {dock.orders.map((order) => (
                    <div key={order.id} className="bg-white bg-opacity-50 rounded p-1">
                      <div className="font-medium">PO: {order.po_number}</div>
                      <div>Driver: {order.driver_name}</div>
                      <div>In: {formatCheckInTime(order.check_in_time)}</div>
                    </div>
                  ))}
                </div>
              )}

              {dock.is_manually_blocked && dock.blocked_reason && (
                <div className="mt-2 text-xs bg-white bg-opacity-50 rounded p-1">
                  <div className="font-medium">Blocked:</div>
                  <div>{dock.blocked_reason}</div>
                </div>
              )}

              <div className="mt-3 space-y-1">
                {dock.status === 'blocked' ? (
                  <button
                    onClick={() => handleUnblockDock(dock.dock_number)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white text-xs py-1 px-2 rounded transition-colors"
                  >
                    Unblock
                  </button>
                ) : (
                  <button
                    onClick={() => handleBlockDock(dock.dock_number)}
                    className="w-full bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2 rounded transition-colors"
                  >
                    Block
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Block Dock {selectedDock}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for blocking:
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full border-2 border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Enter reason..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitBlockDock}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
              >
                Block Dock
              </button>
              <button
                onClick={() => {
                  setShowBlockModal(false);
                  setSelectedDock(null);
                  setBlockReason('');
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded-lg font-medium transition-colors"
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

