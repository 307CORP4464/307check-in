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
    trailer_number?: string;
    trailer_length?: string;
    destination_city?: string;
    destination_state?: string;
    check_in_time?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean; // Add this prop
}

interface DockInfo {
  dock_number: string;
  status: 'available' | 'in-use' | 'blocked';
  orders: Array<{ reference_number?: string; trailer_number?: string }>;
}

export default function AssignDockModal({ checkIn, onClose, onSuccess, isOpen }: AssignDockModalProps) {
  const [dockNumber, setDockNumber] = useState(checkIn.dock_number || '');
  const [appointmentTime, setAppointmentTime] = useState(checkIn.appointment_time || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dockInfo, setDockInfo] = useState<DockInfo | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [checkingDock, setCheckingDock] = useState(false);

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
    { value: 'paid_to_load', label: 'Paid to Load' },
    { value: 'paid_charge_customer', label: 'Paid - Charge Customer' },
    { value: 'LTL', label: 'LTL' }
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

  const isOnTime = (): boolean | null => {
    const { appointment_time, check_in_time } = checkIn;
    if (!appointment_time || !check_in_time) return null;
    const appt = new Date(appointment_time).getTime();
    const checkInTimestamp = new Date(check_in_time).getTime();
    return checkInTimestamp <= appt;
  };

  const printReceipt = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the receipt');
      return;
    }

    const currentDate = new Date().toLocaleString();
    const dockDisplay = dockNumber === 'Ramp' ? 'Ramp' : `Dock ${dockNumber}`;
    const onTimeFlag = isOnTime();
    const appointmentStatus = onTimeFlag === null ? '' : onTimeFlag ? 'MADE' : 'MISSED';

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Load Assignment Receipt</title>
          <style>
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
            body {
              font-family: 'Arial', monospace;
              padding: 20px;
              max-width: 420px;
              margin: 0 auto;
            }
            .receipt-header {
              text-align: center;
              border-bottom: 2px dashed #000;
              padding-bottom: 12px;
              margin-bottom: 12px;
            }
            .receipt-header h1 {
              margin: 0;
              font-size: 20px;
            }
            .section {
              margin: 8px 0;
              padding: 6px 0;
              border-bottom: 1px dashed #bbb;
            }
            .section:last-child { border-bottom: none; }
            .row {
              display: flex;
              justify-content: space-between;
              font-size: 14px;
              margin: 6px 0;
            }
            .label {
              font-weight: bold;
              text-transform: uppercase;
              font-size: 12px;
              color: #333;
            }
            .value {
              text-align: right;
            }
            .pickup-box {
              background-color: #ffeb3b;
              padding: 12px;
              margin: 10px 0 6px;
              border: 2px solid #000;
              text-align: center;
            }
            .pickup-box .reference-number {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .pickup-box .dock-number {
              font-size: 16px;
              font-weight: bold;
            }
            .appointment-status {
              display: inline-block;
              padding: 4px 8px;
              font-weight: bold;
              border-radius: 4px;
            }
            .appointment-status.made {
              background-color: #4CAF50;
              color: white;
            }
            .appointment-status.missed {
              background-color: #f44336;
              color: white;
            }
            .print-button {
              display: block;
              margin: 12px auto 0;
              padding: 8px 20px;
              background-color: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 14px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="receipt-header">
            <h1>Load Assignment Receipt</h1>
            <div>${currentDate}</div>
          </div>
          <div class="pickup-box">
            <div class="reference-number">Pickup #: ${checkIn.reference_number ?? 'N/A'}</div>
            <div class="dock-number">${dockDisplay}</div>
          </div>
          ${appointmentStatus ? `
          <div class="section">
            <div class="row">
              <span class="label">Appointment Status</span>
              <span class="value">
                <span class="appointment-status ${appointmentStatus.toLowerCase()}">${appointmentStatus}</span>
              </span>
            </div>
          </div>
          ` : ''}
          <div class="section">
            ${checkIn.destination_city ? `
            <div class="row">
              <span class="label">Destination City</span>
              <span class="value">${checkIn.destination_city}</span>
            </div>
            ` : ''}
            ${checkIn.destination_state ? `
            <div class="row">
              <span class="label">Destination State</span>
              <span class="value">${checkIn.destination_state}</span>
            </div>
            ` : ''}
          </div>
          <div class="section">
            ${checkIn.carrier_name ? `
            <div class="row">
              <span class="label">Carrier</span>
              <span class="value">${checkIn.carrier_name}</span>
            </div>
            ` : ''}
            ${checkIn.driver_name ? `
            <div class="row">
              <span class="label">Driver</span>
              <span class="value">${checkIn.driver_name}</span>
            </div>
            ` : ''}
            ${checkIn.driver_phone ? `
            <div class="row">
              <span class="label">Driver Phone</span>
              <span class="value">${checkIn.driver_phone}</span>
            </div>
            ` : ''}
            ${checkIn.trailer_number ? `
            <div class="row">
              <span class="label">Trailer Number</span>
              <span class="value">${checkIn.trailer_number}</span>
            </div>
            ` : ''}
            ${checkIn.trailer_length ? `
            <div class="row">
              <span class="label">Trailer Length</span>
              <span class="value">${checkIn.trailer_length}</span>
            </div>
            ` : ''}
          </div>
          <div class="section">
            <div class="row">
              <span class="label">Appointment Time</span>
              <span class="value">${formatAppointmentTime(appointmentTime)}</span>
            </div>
            <div class="row">
              <span class="label">Check-in Time</span>
              <span class="value">${formatCheckInTime(checkIn.check_in_time)}</span>
            </div>
          </div>
          <button class="print-button no-print" onclick="window.print()">Print Receipt</button>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const checkDockStatus = async (dock: string) => {
    setCheckingDock(true);
    try {
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

      const { data: existingOrders, error } = await supabase
        .from('check_ins')
        .select('reference_number, trailer_number')
        .eq('dock_number', dock)
        .neq('status', 'complete');

      if (error) throw error;

      if (existingOrders && existingOrders.length > 0) {
        setDockInfo({ dock_number: dock, status: 'in-use', orders: existingOrders });
        setShowWarning(true);
      } else {
        setDockInfo({ dock_number: dock, status: 'available', orders: [] });
        setShowWarning(false);
      }
    } catch (err) {
      console.error('Error checking dock status:', err);
    } finally {
      setCheckingDock(false);
    }
  };

// In AssignDockModal, after successful assignment
const handleAssign = async () => {
  setLoading(true);
  setError(null);

  try {
    const { error: updateError } = await supabase
      .from('check_ins')
      .update({
        dock_number: dockNumber,
        appointment_time: appointmentTime,
        status: 'checked_in'
      })
      .eq('id', checkIn.id);

    if (updateError) throw updateError;

    // Trigger custom event for dock status update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dock-assignment-changed', {
        detail: { dockNumber, checkInId: checkIn.id }
      }));
    }

    printReceipt();
    onSuccess();
    onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to assign dock');
  } finally {
    setLoading(false);
  }
};


  useEffect(() => {
    if (checkIn.appointment_time) {
      setAppointmentTime(checkIn.appointment_time);
    }
  }, [checkIn.appointment_time]);

  useEffect(() => {
    if (dockNumber && dockNumber.length > 0) {
      checkDockStatus(dockNumber);
    } else {
      setDockInfo(null);
      setShowWarning(false);
    }
  }, [dockNumber]);

  // Early return INSIDE the component function
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Dock</h3>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-700">
            <p className="font-medium">Reference #: {checkIn.reference_number}</p>
            <p>Trailer #: {checkIn.trailer_number}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Dock Number *</label>
            <input
              type="text"
              value={dockNumber}
              onChange={(e) => setDockNumber(e.target.value)}
              placeholder="Enter dock number"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoFocus
            />
            {checkingDock && <p className="mt-1 text-xs text-gray-500">Checking dock status...</p>}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Appointment Time</label>
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
              <option value="0800">08:00</option>
              <option value="0900">09:00</option>
              <option value="0930">09:30</option>
              <option value="1000">10:00</option>
              <option value="1030">10:30</option>
              <option value="1100">11:00</option>
              <option value="1230">12:30</option>
              <option value="1300">13:00</option>
              <option value="1330">13:30</option>
              <option value="1400">14:00</option>
              <option value="1430">14:30</option>
              <option value="1500">15:00</option>
              <option value="1530">15:30</option>
            </select>
          </div>

          {dockInfo && !checkingDock && (
            <div className={`mb-4 p-3 rounded-lg border-2 ${
              dockInfo.status === 'available'
                ? 'bg-green-50 border-green-300'
                : dockInfo.status === 'blocked'
                ? 'bg-gray-50 border-gray-400'
                : 'bg-yellow-50 border-yellow-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{dockInfo.status === 'available' ? '✓' : dockInfo.status === 'blocked' ? '🚫' : '⚠'}</span>
                <span className={`font-semibold ${
                  dockInfo.status === 'available' ? 'text-green-800' :
                  dockInfo.status === 'blocked' ? 'text-gray-800' :
                  'text-yellow-800'
                }`}>
                  Dock {dockInfo.dock_number} - {dockInfo.status.toUpperCase().replace('-', ' ')}
                </span>
              </div>

              {dockInfo.status === 'available' && (
                <p className="text-sm text-green-700">This dock is available for assignment.</p>
              )}
              {dockInfo.status === 'blocked' && (
                <p className="text-sm text-gray-700">This dock is blocked.</p>
              )}
              {dockInfo.status === 'in-use' && dockInfo.orders.length > 0 && (
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Current orders on this dock:</p>
                  <ul className="list-disc pl-5">
                    {dockInfo.orders.map((order, idx) => (
                      <li key={idx}>
                        Ref: {order.reference_number} - Trailer: {order.trailer_number}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Assigning...' : 'Assign Dock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
