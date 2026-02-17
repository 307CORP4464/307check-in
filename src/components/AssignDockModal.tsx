'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface AssignDockModalProps {
  checkIn: {
    id: string;
    driver_name?: string;
    company?: string;
    dock_number?: string;
    appointment_time?: string | null;
    carrier_name?: string;
    reference_number?: string;
    driver_phone?: string;
    driver_email?: string;
    trailer_number?: string;
    trailer_length?: string;
    destination_city?: string;
    destination_state?: string;
    check_in_time?: string | null;
    load_type?: 'inbound' | 'outbound';
  };
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean;
}

interface DockInfo {
  dock_number: string;
  status: 'available' | 'in-use' | 'blocked';
  orders: Array<{ reference_number?: string; trailer_number?: string }>;
}

export default function AssignDockModal({ checkIn, onClose, onSuccess, isOpen }: AssignDockModalProps) {
  const [dockNumber, setDockNumber] = useState(checkIn.dock_number || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dockInfo, setDockInfo] = useState<DockInfo | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [checkingDock, setCheckingDock] = useState(false);
  const [confirmDoubleBook, setConfirmDoubleBook] = useState(false);
  
  // Email-related state
  const [sendEmail, setSendEmail] = useState(true);
  const [driverEmail, setDriverEmail] = useState(checkIn.driver_email || '');
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const dockOptions = [
    'Ramp',
    ...Array.from({ length: 70 }, (_, i) => (i + 1).toString())
  ];

  const appointmentOptions = [
    { value: '0800', label: '08:00 AM' },
    { value: '0900', label: '09:00 AM' },
    { value: '0930', label: '09:30 AM' },
    { value: '1000', label: '10:00 AM' },
    { value: '1030', label: '10:30 AM' },
    { value: '1100', label: '11:00 AM' },
    { value: '1230', label: '12:30 PM' },
    { value: '1300', label: '01:00 PM' },
    { value: '1330', label: '01:30 PM' },
    { value: '1400', label: '02:00 PM' },
    { value: '1430', label: '02:30 PM' },
    { value: '1500', label: '03:00 PM' },
    { value: '1550', label: '03:30 PM' },
    { value: 'work_in', label: 'Work In' },
  ];

  const formatAppointmentTime = (time: string) => {
    const option = appointmentOptions.find(opt => opt.value === time);
    return option ? option.label : time;
  };

  const formatCheckInTime = (t?: string | null) => {
    if (!t) return '';
    try {
      const d = new Date(t);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t;
    }
  };

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDockNumber(checkIn.dock_number || '');
      setDriverEmail(checkIn.driver_email || '');
      setError(null);
      setEmailStatus(null);
      setShowWarning(false);
      setConfirmDoubleBook(false);
    }
  }, [isOpen, checkIn]);

  useEffect(() => {
    if (dockNumber && dockNumber !== 'Ramp') {
      checkDockStatus(dockNumber);
      setConfirmDoubleBook(false); // Reset confirmation when dock changes
    } else {
      setDockInfo(null);
      setShowWarning(false);
      setConfirmDoubleBook(false);
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
            setDockInfo({ dock_number: dock, status: 'blocked', orders: [] });
            setShowWarning(true);
            setCheckingDock(false);
            return;
          }
        }
      }

      // Check if dock is in use
      const { data: existingOrders, error } = await supabase
        .from('check_ins')
        .select('reference_number, trailer_number, driver_name')
        .eq('dock_number', dock)
        .in('status', ['checked_in', 'pending', 'at_dock', 'loading', 'unloading'])
        .neq('id', checkIn.id);

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
    } catch (err) {
      console.error('Error checking dock status:', err);
      setDockInfo(null);
      setShowWarning(false);
    } finally {
      setCheckingDock(false);
    }
  };

  const sendEmailNotification = async (dock: string, email: string) => {
    try {
      // Calculate appointment status
      let appointmentStatus = 'No Appointment';
      if (checkIn.appointment_time && checkIn.check_in_time) {
        const checkInDate = new Date(checkIn.check_in_time);
        const appointmentTimeStr = checkIn.appointment_time;
        
        // Parse appointment time (format: "0800", "0930", etc.)
        if (/^\d{4}$/.test(appointmentTimeStr)) {
          const hours = parseInt(appointmentTimeStr.substring(0, 2));
          const minutes = parseInt(appointmentTimeStr.substring(2, 4));
          const appointmentDate = new Date(checkInDate);
          appointmentDate.setHours(hours, minutes, 0, 0);
          
          const diffMinutes = (checkInDate.getTime() - appointmentDate.getTime()) / (1000 * 60);
          
          if (diffMinutes < -15) {
            appointmentStatus = 'Early';
          } else if (diffMinutes > 15) {
            appointmentStatus = 'Late';
          } else {
            appointmentStatus = 'On Time';
          }
        }
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'dock_assignment',
          toEmail: email,
          data: {
            driverName: checkIn.driver_name || 'Driver',
            dockNumber: dock,
            referenceNumber: checkIn.reference_number || 'N/A',
            loadType: checkIn.load_type || 'inbound',
            checkInTime: formatCheckInTime(checkIn.check_in_time) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            appointmentTime: checkIn.appointment_time 
              ? formatAppointmentTime(checkIn.appointment_time) 
              : undefined,
            appointmentStatus: appointmentStatus,
          },
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setEmailStatus('Email sent successfully ✓');
        return true;
      } else {
        setEmailStatus(`Email failed: ${result.error}`);
        console.error('Email send error:', result);
        return false;
      }
    } catch (err) {
      console.error('Error sending email:', err);
      setEmailStatus('Email sending failed');
      return false;
    }
  };

  const handleAssign = async () => {
    if (!dockNumber) {
      setError('Please select a dock number');
      return;
    }

    // Check if dock is in use and confirmation is required
    if (dockInfo?.status === 'in-use' && !confirmDoubleBook) {
      setError('Please confirm the double booking by checking the box below');
      return;
    }

    // Prevent assignment to blocked docks
    if (dockInfo?.status === 'blocked') {
      setError('Cannot assign to a blocked dock. Please select a different dock.');
      return;
    }

    setLoading(true);
    setError(null);
    setEmailStatus(null);

    try {
      // First, verify the check-in still exists and is in a valid state
      const { data: currentCheckIn, error: fetchError } = await supabase
        .from('check_ins')
        .select('id, status, dock_number')
        .eq('id', checkIn.id)
        .single();

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        throw new Error(`Unable to verify check-in: ${fetchError.message}`);
      }

      if (!currentCheckIn) {
        throw new Error('Check-in record not found. It may have been deleted.');
      }

      // Update database with dock assignment (allow double booking if confirmed)
      const { data: updatedData, error: updateError } = await supabase
        .from('check_ins')
        .update({
          dock_number: dockNumber,
          status: 'checked_in',
          driver_email: driverEmail || null,
          appointment_time: checkIn.appointment_time || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', checkIn.id)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error(`Failed to assign dock: ${updateError.message}`);
      }

      if (!updatedData) {
        throw new Error('Dock assignment failed. Please try again.');
      }

      // Send email if enabled and email provided
      if (sendEmail && driverEmail) {
        await sendEmailNotification(dockNumber, driverEmail);
      }

      // Success - call onSuccess callback
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Assignment error:', err);
      setError(err.message || 'Failed to assign dock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Assign Dock</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              disabled={loading}
            >
              ×
            </button>
          </div>

          {/* Check-in Information */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Driver</p>
                <p className="font-semibold">{checkIn.driver_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Company</p>
                <p className="font-semibold">{checkIn.company || checkIn.carrier_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Reference #</p>
                <p className="font-semibold">{checkIn.reference_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Trailer #</p>
                <p className="font-semibold">{checkIn.trailer_number || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Dock Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Dock Number *
            </label>
            <select
              value={dockNumber}
              onChange={(e) => setDockNumber(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="">Select a dock...</option>
              {dockOptions.map((dock) => (
                <option key={dock} value={dock}>
                  {dock}
                </option>
              ))}
            </select>
          </div>

          {/* Dock Status Warning */}
          {checkingDock && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800">Checking dock availability...</p>
            </div>
          )}

          {showWarning && dockInfo && dockInfo.status === 'blocked' && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-semibold mb-2">⚠️ Dock Blocked</p>
              <p className="text-red-700">This dock is currently blocked and cannot be used.</p>
            </div>
          )}

          {showWarning && dockInfo && dockInfo.status === 'in-use' && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 font-semibold mb-2">⚠️ Dock Currently In Use</p>
              <p className="text-yellow-700 mb-3">
                This dock is already assigned to the following order(s):
              </p>
              <div className="space-y-2">
                {dockInfo.orders.map((order, idx) => (
                  <div key={idx} className="bg-white p-3 rounded border border-yellow-300">
                    <p className="text-sm">
                      <span className="font-semibold">Reference:</span> {order.reference_number || 'N/A'}
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold">Trailer:</span> {order.trailer_number || 'N/A'}
                    </p>
                  </div>
                ))}
              </div>
              
              {/* Confirmation Checkbox */}
              <div className="mt-4 flex items-start">
                <input
                  type="checkbox"
                  id="confirmDoubleBook"
                  checked={confirmDoubleBook}
                  onChange={(e) => setConfirmDoubleBook(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={loading}
                />
                <label htmlFor="confirmDoubleBook" className="ml-2 text-sm text-gray-700">
                  I understand this dock is already in use and want to proceed with double booking
                </label>
              </div>
            </div>
          )}

          {/* Email Section */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                id="sendEmail"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={loading}
              />
              <label htmlFor="sendEmail" className="ml-2 text-sm font-medium text-gray-700">
                Send dock assignment email to driver
              </label>
            </div>

            {sendEmail && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Driver Email
                </label>
                <input
                  type="email"
                  value={driverEmail}
                  onChange={(e) => setDriverEmail(e.target.value)}
                  placeholder="driver@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
            )}

            {emailStatus && (
              <p className={`mt-2 text-sm ${emailStatus.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                {emailStatus}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={loading || !dockNumber || (dockInfo?.status === 'blocked')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Assigning...' : 'Assign Dock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

