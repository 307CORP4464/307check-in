'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(date);
  } catch (e) {
    console.error('Time formatting error:', e, isoString);
    return isoString;
  }
};

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
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      }
    };
    getUser();
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
        return 'bg-green-50 border-green-400 text-green-800';
      case 'in-use':
        return 'bg-yellow-50 border-yellow-400 text-yellow-800';
      case 'double-booked':
        return 'bg-red-50 border-red-400 text-red-800';
      case 'blocked':
        return 'bg-gray-50 border-gray-400 text-gray-800';
      default:
        return 'bg-gray-50 border-gray-400 text-gray-800';
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

  const formatCheckInTime = (isoString: string) => {
    return formatTimeInIndianapolis(isoString);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
  <div className="min-h-screen bg-gray-50">
    {/* Header */}
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Appointment Scheduling</h1>
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

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Available Docks</p>
                <p className="text-3xl font-bold text-green-600">{stats.available}</p>
              </div>
              <div className="text-4xl text-green-500">✓</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">In Use</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.inUse}</p>
              </div>
              <div className="text-4xl text-yellow-500">●</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Double Booked</p>
                <p className="text-3xl font-bold text-red-600">{stats.doubleBooked}</p>
              </div>
              <div className="text-4xl text-red-500">⚠</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-gray-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Blocked</p>
                <p className="text-3xl font-bold text-gray-600">{stats.blocked}</p>
              </div>
              <div className="text-4xl text-gray-500">🚫</div>
            </div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              All Docks ({dockStatuses.length})
            </button>
            <button
              onClick={() => setFilter('available')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                filter === 'available'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              Available ({stats.available})
            </button>
            <button
              onClick={() => setFilter('in-use')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                filter === 'in-use'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              In Use ({stats.inUse})
            </button>
            <button
              onClick={() => setFilter('double-booked')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                filter === 'double-booked'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              Double Booked ({stats.doubleBooked})
            </button>
            <button
              onClick={() => setFilter('blocked')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                filter === 'blocked'
                  ? 'bg-gray-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
              Blocked ({stats.blocked})
            </button>
          </div>
        </div>

        {/* Docks Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4">
          {filteredDocks.map(dock => (
            <div
              key={dock.dock_number}
              className={`rounded-lg border-2 shadow-sm hover:shadow-md transition-shadow ${getStatusColor(dock.status)}`}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold">#{dock.dock_number}</span>
                  <span className="text-2xl">{getStatusIcon(dock.status)}</span>
                </div>
                
                <div className="text-xs font-semibold uppercase mb-3">
                  {dock.status.replace('-', ' ')}
                </div>

                {dock.orders.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {dock.orders.map((order, idx) => (
                      <div key={idx} className="text-xs bg-white bg-opacity-60 p-2 rounded">
                        <p className="font-semibold truncate">PO: {order.po_number}</p>
                        <p className="truncate">{order.driver_name}</p>
                        <p className="text-gray-600">{formatCheckInTime(order.check_in_time)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {dock.is_manually_blocked && dock.blocked_reason && (
                  <div className="text-xs bg-white bg-opacity-60 p-2 rounded mb-3">
                    <p className="font-semibold">Reason:</p>
                    <p className="text-gray-700">{dock.blocked_reason}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {dock.status === 'blocked' ? (
                    <button
                      onClick={() => handleUnblockDock(dock.dock_number)}
                      className="flex-1 bg-green-500 text-white text-xs py-2 px-3 rounded hover:bg-green-600 transition-colors font-medium">
                      Unblock
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBlockDock(dock.dock_number)}
                      className="flex-1 bg-gray-500 text-white text-xs py-2 px-3 rounded hover:bg-gray-600 transition-colors font-medium">
                      Block
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">
              Block Dock #{selectedDock}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for blocking this dock:
            </p>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              placeholder="Enter reason for blocking..."
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBlockModal(false);
                  setSelectedDock(null);
                  setBlockReason('');
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                Cancel
              </button>
              <button
                onClick={submitBlockDock}
                className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition-colors font-medium">
                Block Dock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

