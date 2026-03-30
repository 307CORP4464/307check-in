'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function DockStatusWidget() {
  const [stats, setStats] = useState({
    available: 0,
    inUse: 0,
    doubleBooked: 0,
    total: 71,
  });

  useEffect(() => {
    fetchStats();
    const channel = supabase
      .channel('dock-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, fetchStats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchStats = async () => {
    const { data } = await supabase
      .from('check_ins')
      .select('dock_number')
      .in('status', ['checked_in', 'dock_assigned', 'loading', 'unloading', 'checked_out', 'on_hold'])
      .not('dock_number', 'is', null);

    const dockMap = new Map<string, number>();
    data?.forEach(ci => {
      if (ci.dock_number) {
        dockMap.set(ci.dock_number, (dockMap.get(ci.dock_number) || 0) + 1);
      }
    });

    const inUse = Array.from(dockMap.values()).filter(count => count === 1).length;
    const doubleBooked = Array.from(dockMap.values()).filter(count => count > 1).length;
    const total = 71;
    const available = total - inUse - doubleBooked;
    setStats({ available, inUse, doubleBooked, total });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Dock Status</h3>
        <Link href="/dock-status" className="text-sm text-blue-600 hover:text-blue-800">
          View All →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{stats.available}</div>
          <div className="text-xs text-gray-600">Available</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.inUse}</div>
          <div className="text-xs text-gray-600">In Use</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{stats.doubleBooked}</div>
          <div className="text-xs text-gray-600">Double Booked</div>
        </div>
      </div>
    </div>
  );
}
