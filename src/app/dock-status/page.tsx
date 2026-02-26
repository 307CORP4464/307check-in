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
  isRamp?: boolean;
}

// Define the dock order: 64-70 first, then 1-27, Ramp, 28-63
const DOCK_ORDER: string[] = [
  ...Array.from({ length: 7 }, (_, i) => (64 + i).toString()),  // 64-70
  ...Array.from({ length: 27 }, (_, i) => (i + 1).toString()),  // 1-27
  'Ramp',
  ...Array.from({ length: 36 }, (_, i) => (i + 28).toString()), // 28-63
];

export default function DockStatusPage() {
  const router = useRouter();
  const [dockStatuses, setDockStatuses] = useState<DockStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedDock, setSelectedDock] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'in-use' | 'double-booked' | 'blocked'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userEmail, setUserEmail] = useState<string>('');

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
        { event: '*', schema: 'public', table: 'check_ins' },
        () => { initializeDocks(); }
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
      // Build docks from DOCK_ORDER
      const allDocks: DockStatus[] = DOCK_ORDER.map(dockNum => ({
        dock_number: dockNum,
        status: 'available',
        orders: [],
        is_manually_blocked: false,
        blocked_reason: undefined,
        current_load_id: null,
        isRamp: dockNum === 'Ramp',
      }));

      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('*')
        .in('status', ['checked_in', 'pending'])
        .not('dock_number', 'is', null);

      const dockMap = new Map<string, OrderInfo[]>();
      checkIns?.forEach(checkIn => {
        if (checkIn.dock_number) {
          const existing = dockMap.get(checkIn.dock_number) || [];
          existing.push({
            id: checkIn.id,
            po_number: checkIn.reference_number || 'N/A',
            driver_name: checkIn.driver_name || 'N/A',
            status: checkIn.status,
            check_in_time: checkIn.check_in_time,
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

  const getStatusColor = (status: string, isRamp?: boolean) => {
    if (isRamp) {
      switch (status) {
        case 'available': return 'bg-green-100 text-green-800 border-green-300';
        case 'in-use':    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        case 'double-booked': return 'bg-red-100 text-red-800 border-red-300';
        case 'blocked':   return 'bg-gray-100 text-gray-800 border-gray-300';
        default:          return 'bg-blue-50 text-blue-800 border-blue-300';
      }
    }
    switch (status) {
      case 'available':     return 'bg-green-100 text-green-800 border-green-300';
      case 'in-use':        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'double-booked': return 'bg-red-100 text-red-800 border-red-300';
      case 'blocked':       return 'bg-gray-100 text-gray-800 border-gray-300';
      default:              return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':     return '✓';
      case 'in-use':        return '●';
      case 'double-booked': return '⚠';
      case 'blocked':       return '🚫';
      default:              return '';
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

  const formatCheckInTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true,
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
    available:    dockStatuses.filter(d => d.status === 'available').length,
    inUse:        dockStatuses.filter(d => d.status === 'in-use').length,
    doubleBooked: dockStatuses.filter(d => d.status === 'double-booked').length,
    blocked:      dockStatuses.filter(d => d.status === 'blocked').length,
  }), [dockStatuses]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dock Status</h1>
              <p className="text-xs text-gray-500">
                {formatDate(currentTime)} • {formatTime(currentTime)}
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

      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Available',     value: stats.available,    color: 'text-green-600' },
            { label: 'In Use',        value: stats.inUse,        color: 'text-yellow-600' },
            { label: 'Double Booked', value: stats.doubleBooked, color: 'text-red-600' },
            { label: 'Blocked',       value: stats.blocked,      color: 'text-gray-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg shadow p-4 text-center">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-600">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'available', 'in-use', 'double-booked', 'blocked'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {f.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Dock Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading dock statuses...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {filteredDocks.map(dock => (
              <div
                key={dock.dock_number}
                className={`relative border-2 rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${getStatusColor(dock.status, dock.isRamp)} ${
                  dock.isRamp ? 'col-span-1 border-dashed border-blue-400 bg-blue-50' : ''
                }`}
                onClick={() => {
                  if (dock.status === 'blocked') handleUnblockDock(dock.dock_number);
                  else handleBlockDock(dock.dock_number);
                }}
              >
                {/* Ramp badge */}
                {dock.isRamp && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">
                    RAMP
                  </div>
                )}

                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm">
                    {dock.isRamp ? 'Ramp' : `#${dock.dock_number}`}
                  </span>
                  <span className="text-xs">{getStatusIcon(dock.status)}</span>
                </div>

                <div className="text-xs capitalize font-medium">{dock.status.replace('-', ' ')}</div>

                {dock.orders.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {dock.orders.map(order => (
                      <div key={order.id} className="text-xs border-t pt-1 truncate">
                        <div className="font-medium truncate">{order.po_number}</div>
                        <div className="text-gray-600 truncate">{order.driver_name}</div>
                        <div className="text-gray-500">{formatCheckInTime(order.check_in_time)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {dock.is_manually_blocked && dock.blocked_reason && (
                  <div className="mt-1 text-xs text-gray-500 italic truncate">
                    {dock.blocked_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              Block Dock {selectedDock === 'Ramp' ? 'Ramp' : `#${selectedDock}`}
            </h3>
            <textarea
              className="w-full border rounded-lg p-3 text-sm mb-4 resize-none"
              rows={3}
              placeholder="Enter reason for blocking..."
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowBlockModal(false); setSelectedDock(null); setBlockReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitBlockDock}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600"
              >
                Block Dock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
