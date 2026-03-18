'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [prevCount, setPrevCount] = useState<number>(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [initialized, setInitialized] = useState<boolean>(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const playDing = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  };

  const enableNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const fetchPendingCount = async () => {
    const { count, error } = await supabase
      .from('check_ins')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (!error && count !== null) {
      setPendingCount(count);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPendingCount().then(() => setInitialized(true));

    const subscription = supabase
      .channel('header_check_ins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () => {
        fetchPendingCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  // Alert on new check-ins
  useEffect(() => {
    if (!initialized) return;
    if (pendingCount > prevCount) {
      const newCount = pendingCount - prevCount;
      playDing();
      if (notificationsEnabled && document.hidden) {
        new Notification('New Driver Check-In', {
          body: `${newCount} new driver${newCount > 1 ? 's' : ''} waiting at the dock`,
          icon: '/favicon.ico',
        });
      }
    }
    setPrevCount(pendingCount);
  }, [pendingCount, initialized]);

  return (
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Link href="/csr-dashboard" className="bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm">
              CSR Dashboard
            </Link>
            <Link href="/appointments" className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm">
              Appointments
            </Link>
            <Link href="/dock-status" className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm">
              Dock Status
            </Link>
            <Link href="/dashboard" className="bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600 transition-colors font-medium text-sm">
              Dashboard
            </Link>
            <Link href="/logs" className="bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 transition-colors font-medium text-sm">
              Daily Logs
            </Link>
            <Link href="/tracking" className="bg-pink-500 text-white px-3 py-2 rounded-lg hover:bg-pink-600 transition-colors font-medium text-sm">
              Tracking
            </Link>

            {/* Notification toggle */}
            <button
              onClick={enableNotifications}
              className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                notificationsEnabled
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-indigo-500 text-white hover:bg-indigo-600'
              }`}
            >
              {notificationsEnabled ? '🔔 Alerts On' : '🔕 Enable Alerts'}
            </button>

            {/* Pulsing badge */}
            {pendingCount > 0 && (
              <span className="relative flex items-center justify-center w-8 h-8">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500 text-white text-xs font-bold items-center justify-center">
                  {pendingCount}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
