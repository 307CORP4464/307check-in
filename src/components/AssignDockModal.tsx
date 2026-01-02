'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  carrier_name?: string;
  trailer_number?: string;
  trailer_length?: string;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  destination_city?: string;
  destination_state?: string;
  notes?: string;
}

interface AssignDockModalProps {
  isOpen: boolean;
  onClose: () => void;
  logEntry: CheckIn;
  onSuccess: () => void;
}

interface DockInfo {
  dock_number: string;
  status: 'available' | 'in-use' | 'blocked';
  orders: Array<{
    reference_number: string;
    trailer_number: string;
  }>;
}

export default function AssignDockModal({ isOpen, onClose, logEntry, onSuccess }: AssignDockModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [dockNumber, setDockNumber] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [dockInfo, setDockInfo] = useState<DockInfo | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [checkingDock, setCheckingDock] = useState(false);

  // Pre-fill appointment time if it exists
  useEffect(() => {
    if (logEntry.appointment_time) {
      setAppointmentTime(logEntry.appointment_time);
    }
  }, [logEntry]);

  useEffect(() => {
    if (dockNumber && dockNumber.length > 0) {
      checkDockStatus(dockNumber);
    } else {
      setDockInfo(null);
      setShowWarning(false);
    }
  }, [dockNumber]);

  const checkDockStatus = async (dock: string) => {
    setCheckingDock(true);
    try {
      // Check if dock is blocked
      if (typeof window !== 'undefined') {
        const blockedStr = localStorage.getItem('blocked_docks');
        if (blockedStr) {
          const blocked = JSON.parse(blockedStr);
          if (blocked[dock]) {
            setDockInfo({
              dock_number: dock,
              status: 'blocked',
              orders: []
            });
            setShowWarning(true);
            setCheckingDock(false);
            return;
          }
        }
      }

      // Check for existing orders on this dock
      const { data: existingOrders, error } = await supabase
        .from('check_ins')
        .select('reference_number, trailer_number')
        .eq('dock_number', dock)
        .in('status', ['assigned', 'loading']);

      if (error) throw error;

      if (existingOrders && existingOrders.length > 0) {
        setDockInfo({
          dock_number: dock,
          status: 'in-use',
          orders: existingOrders
        });
        setShowWarning(true);
      } else {
        setDockInfo({
          dock_number: dock,
          status: 'available',
          orders: []
        });
        setShowWarning(false);
      }
    } catch (error) {
      console.error('Error checking dock status:', error);
    }
    setCheckingDock(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dockNumber.trim()) {
      alert('Please enter a dock number');
      return;
    }

    // If dock is blocked, don't allow assignment
    if (dockInfo?.status === 'blocked') {
      alert('This dock is currently blocked and cannot accept new assignments. Please choose a different dock or unblock it from the Dock Status page.');
      return;
    }

    // If dock is in use, require confirmation
    if (showWarning && dockInfo?.status === 'in-use') {
      const confirmDouble = window.confirm(
        `⚠️ WARNING: Dock ${dockNumber} is already in use!\n\n` +
        `Current orders on this dock:\n` +
        dockInfo.orders.map(o => `• Ref: ${o.reference_number} - Trailer: ${o.trailer_number}`).join('\n') +
        `\n\nAssigning another order will create a DOUBLE BOOKING.\n\n` +
        `Do you want to proceed with double booking this dock?`
      );

      if (!confirmDouble) {
        return;
      }
    }

    setLoading(true);

    try {
      const updateData: any = { 
        dock_number: dockNumber.trim(),
        status: 'assigned',
        start_time: new Date().toISOString()
      };

      // Add appointment time if provided
      if (appointmentTime) {
        updateData.appointment_time = appointmentTime;
      }

      const { error } = await supabase
        .from('check_ins')
        .update(updateData)
        .eq('id', logEntry.id);

      if (error) throw error;

      onSuccess();
      onClose();
      setDockNumber('');
      setAppointmentTime('');
      setDockInfo(null);
      setShowWarning(false);
    } catch (error) {
      console.error('Error assigning dock:', error);
      alert('Failed to assign dock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Assign Dock
        </h3>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-700">
            <p className="font-medium">Reference #: {logEntry.reference_number}</p>
            <p>Trailer #: {logEntry.trailer_number}</p>
            <p>Driver: {logEntry.driver_name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dock Number *
            </label>
            <input
              type="text"
              value={dockNumber}
              onChange={(e) => setDockNumber(e.target.value)}
              placeholder="Enter dock number (1-70)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoFocus
            />
            {checkingDock && (
              <p className="mt-1 text-xs text-gray-500">Checking dock status...</p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Appointment Time
            </label>
            <select
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              <option value="work_in">Work In</option>
              <option value="paid_to_load">Paid - No Appt</option>
              <option value="paid_charge_customer">Paid - Charge Customer</option>
              <option value="LTL">LTL</option>
              <option value="0700">07:00</option>
              <option value="0800">08:00</option>
              <option value="0900">09:00</option>
              <option value="1000">10:00</option>
              <option value="1100">11:00</option>
              <option value="1200">12:00</option>
              <option value="1300">13:00</option>
              <option value="1400">14:00</option>
              <option value="1500">15:00</option>
              <option value="1600">16:00</option>
            </select>
          </div>

          {/* Dock Status Indicator */}
          {dockInfo && !checkingDock && (
            <div className={`mb-4 p-3 rounded-lg border-2 ${
              dockInfo.status === 'available' 
                ? 'bg-green-50 border-green-300' 
                : dockInfo.status === 'blocked'
                ? 'bg-gray-50 border-gray-400'
                : 'bg-yellow-50 border-yellow-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">
                  {dockInfo.status === 'available' ? '✓' : dockInfo.status === 'blocked' ? '🚫' : '⚠'}
                </span>
                <span className={`font-semibold ${
                  dockInfo.status === 'available' 
                    ? 'text-green-800' 
                    : dockInfo.status === 'blocked'
                    ? 'text-gray-800'
                    : 'text-yellow-800'
                }`}>
                  Dock {dockInfo.dock_number} - {dockInfo.status.toUpperCase().replace('-', ' ')}
                </span>
              </div>
              
              {dockInfo.status === 'available' && (
                <p className="text-sm text-green-700">
                  This dock is available for assignment.
                </p>
              )}
              
              {dockInfo.status === 'blocked' && (
                <div>
                  <p className="text-sm text-gray-700 font-medium mb-1">
                    ⚠️ This dock is currently blocked and cannot accept assignments.
                  </p>
                  <p className="text-xs text-gray-600">
                    Please unblock it from the Dock Status page or choose a different dock.
                  </p>
                </div>
              )}
              
              {dockInfo.status === 'in-use' && (
                <div>
                  <p className="text-sm text-yellow-800 font-medium mb-2">
                    ⚠️ Warning: This dock already has active orders!
                  </p>
                  <div className="text-xs text-yellow-700 space-y-1">
                    {dockInfo.orders.map((order, idx) => (
                      <div key={idx} className="bg-white bg-opacity-50 p-2 rounded">
                        <span className="font-medium">Ref #: {order.reference_number}</span>
                        <br />
                        <span>Trailer #: {order.trailer_number}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-yellow-800 mt-2 font-medium">
                    Assigning this order will create a DOUBLE BOOKING.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || dockInfo?.status === 'blocked'}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                dockInfo?.status === 'blocked'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : showWarning && dockInfo?.status === 'in-use'
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {loading ? 'Assigning...' : 
               showWarning && dockInfo?.status === 'in-use' ? 'Confirm Double Book' : 
               'Assign Dock'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Help Text */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            💡 <span className="font-medium">Tip:</span> Check the{' '}
            <a href="/dock-status" target="_blank" className="text-blue-600 hover:underline">
              Dock Status page
            </a>{' '}
            to see all available docks in real-time.
          </p>
        </div>
      </div>
    </div>
  );
}

