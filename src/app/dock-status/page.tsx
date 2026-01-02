'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

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
  const [dockStatuses, setDockStatuses] = useState<DockStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedDock, setSelectedDock] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'in-use' | 'double-booked' | 'blocked'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    initializeDocks();
    
    // Listen for dock-status updates (replace with your real channel/table if needed)
    const channel = supabase
      .channel('dock-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'docks' // listen for changes on docks table
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
    
    // Step 1: Fetch docks from backend if available, else initialize on client
    // If you have an API endpoint that returns all docks with current status, use it.
    // For now, we'll fetch from a hypothetical 'docks_view' or fallback to local construction.

    try {
      // Try to fetch current dock statuses from a backend view or API
      // Example (uncomment if you have an API):
      // const res = await fetch('/api/docks-status');
      // const data = await res.json();
      // if (Array.isArray(data)) { setDockStatuses(data); setLoading(false); return; }

      // Fallback: Build initial in-memory docks with defaults
      const docksFromServer: DockStatus[] = [];

      // If you have a backend endpoint, replace the loop with data from API
      for (let i = 1; i <= TOTAL_DOCKS; i++) {
        docksFromServer.push({
          dock_number: i.toString(),
          status: 'available',
          orders: [],
          is_manually_blocked: false,
          blocked_reason: undefined,
          current_load_id: null
        });
      }

      // You can optionally merge with daily_log like your previous logic to reflect in-use docks

      setDockStatuses(docksFromServer);
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
      // Remove from local blocked list (if you are persisting blockers in localStorage)
      const blockedStr = localStorage.getItem('blocked_docks');
      const blocked = blockedStr ? JSON.parse(blockedStr) : {};
      delete blocked[dockNumber];
      localStorage.setItem('blocked_docks', JSON.stringify(blocked));
      // Re-fetch/refresh to reflect changes
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
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-md border-b-4 border-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="text-3xl font-bold text-blue-600">🚚</div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Dock Status Monitor</h1>
                  <p className="text-sm text-gray-600">Loading...</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/logs" className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium shadow-lg">
                  📋 Daily Logs
                </Link>
                <Link href="/dashboard" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg">
                  ← Dashboard
                </Link>
              </div>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-600">Loading dock statuses...</div>
        </div>
      </div>
    );
  }

  // Build UI for docks
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md border-b-4 border-blue-600 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl font-bold text-blue-600">🚚</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dock Status Monitor</h1>
                <p className="text-sm text-gray-600">
                  {formatDate(currentTime)} • {formatTime(currentTime)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Filters */}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white"
              >
                <option value="all">All</option>
                <option value="available">Available</option>
                <option value="in-use">In-use</option>
                <option value="double-booked">Double-booked</option>
                <option value="blocked">Blocked</option>
              </select>
              {/* Quick stats can be shown here if desired */}
              <Link href="/dashboard" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg">
                ← Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocks.map((dock) => (
            <div key={dock.dock_number} className={`rounded-lg p-4 border ${dock.status === 'blocked' ? 'border-gray-300' : 'border-gray-200'} shadow-sm ${getStatusColor(dock.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold">Dock {dock.dock_number}</span>
                  <span className="text-sm">{dock.is_manually_blocked ? 'MANUAL BLOCK' : ''}</span>
                </div>
                <span className="text-lg" aria-label="status">
                  {getStatusIcon(dock.status)}
                </span>
              </div>
              <div className="mt-2 text-sm">
                Status: <strong>{dock.status}</strong>
              </div>

              {dock.orders.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Current loads:</div>
                  {dock.orders.map((o) => (
                    <div key={o.id} className="flex flex-col">
                      <span>PO {o.po_number} - {o.driver_name} - {o.status}</span>
                      <span className="text-xs text-gray-400">{new Date(o.check_in_time).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  className="px-3 py-2 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                  onClick={() => handleBlockDock(dock.dock_number)}
                >
                  Block
                </button>
                <button
                  className="px-3 py-2 bg-green-100 text-green-800 rounded hover:bg-green-200"
                  onClick={() => alert('Release action should call backend to free dock when load departs')}
                  title="Release dock when load departs (backend handles this)"
                >
                  Release (Backend)
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Overview</h2>
          <div className="flex flex-wrap gap-4">
            <span className="px-3 py-1 rounded-full bg-green-100 text-green-800">Available: {stats.available}</span>
            <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">In-use: {stats.inUse}</span>
            <span className="px-3 py-1 rounded-full bg-red-100 text-red-800">Double-booked: {stats.doubleBooked}</span>
            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800">Blocked: {stats.blocked}</span>
          </div>
        </section>
      </main>

      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">Block Dock {selectedDock}</h3>
            <textarea
              className="w-full border rounded p-2"
              rows={4}
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason for blocking"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className="px-4 py-2 bg-gray-200 rounded" onClick={() => setShowBlockModal(false)}>
                Cancel
              </button>
              <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={submitBlockDock}>
                Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

