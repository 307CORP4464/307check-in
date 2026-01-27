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

  // Calculate appointment status
  const getAppointmentStatus = (): string => {
    if (!checkIn.appointment_time || !checkIn.check_in_time) {
      return 'No Appointment';
    }

    // Parse appointment time (format: "0800", "0930", etc.)
    const apptValue = checkIn.appointment_time;
    if (apptValue === 'work_in' || apptValue === 'paid_to_load' || 
        apptValue === 'paid_charge_customer' || apptValue === 'LTL') {
      return 'No Appointment';
    }

    try {
      const checkInDate = new Date(checkIn.check_in_time);
      const today = new Date(checkInDate);
      
      // Parse appointment time string (e.g., "0930" -> 09:30)
      const hours = parseInt(apptValue.substring(0, 2));
      const minutes = parseInt(apptValue.substring(2, 4));
      
      const appointmentDate = new Date(today);
      appointmentDate.setHours(hours, minutes, 0, 0);

      const diffMinutes = (checkInDate.getTime() - appointmentDate.getTime()) / 1000 / 60;

      if (diffMinutes < -15) {
        return 'Late';
      } else if (diffMinutes > 15) {
        return 'Early';
      } else {
        return 'On Time';
      }
    } catch (error) {
      console.error('Error calculating appointment status:', error);
      return 'No Appointment';
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
    }
  }, [isOpen, checkIn]);

  useEffect(() => {
    if (dockNumber && dockNumber !== 'Ramp') {
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
        .select('reference_number, trailer_number')
        .eq('dock_number', dock)
        .in('status', ['checked_in', 'pending'])
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
      const appointmentStatus = getAppointmentStatus();
      
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
            loadType: checkIn.load_type || 'inbound', // Required
            checkInTime: formatCheckInTime(checkIn.check_in_time) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Required
            appointmentTime: checkIn.appointment_time 
              ? formatAppointmentTime(checkIn.appointment_time) 
              : undefined, // Optional
            appointmentStatus: appointmentStatus, // Optional
          },
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setEmailStatus('Email sent successfully ✓');
        return true;
      } else {
        setEmailStatus(`Email failed: ${result.error}`);
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

    setLoading(true);
    setError(null);
    setEmailStatus(null);

    try {
      // Update database with dock assignment
      const { error: updateError } = await supabase
        .from('check_ins')
        .update({
          dock_number: dockNumber,
          status: 'checked_in',
          driver_email: driverEmail,
          appointment_time: checkIn.appointment_time,
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      // Send email if enabled and email provided
      if (sendEmail && driverEmail) {
        await sendEmailNotification(dockNumber, driverEmail);
      }

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

  const printReceipt = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the receipt');
      return;
    }

    const currentDate = new Date().toLocaleString();
    const today = new Date().toLocaleDateString();
    const dockDisplay = dockNumber === 'Ramp' ? 'Ramp' : `Dock ${dockNumber}`;
    
    // Determine load type
    const isInbound = checkIn.load_type === 'inbound';

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Load Assignment Receipt</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              .no-print { display: none; }
              .page-break { page-break-before: always; }
              @page { 
                margin: 0.5in;
                size: letter;
              }
            }
            
            body {
              font-family: Arial, sans-serif;
            }
            .receipt-page {
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
            .reference-box {
              background-color: #ffeb3b;
              padding: 12px;
              margin: 10px 0 6px;
              border: 2px solid #000;
              text-align: center;
            }
            .reference-box .reference-number {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .reference-box .dock-number {
              font-size: 16px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="receipt-page">
            <div class="receipt-header">
              <h1>307 LOGISTICS</h1>
              <p style="margin: 5px 0 0;">${currentDate}</p>
            </div>
            
            <div class="reference-box">
              <div class="reference-number">${checkIn.reference_number || 'N/A'}</div>
              <div class="dock-number">${dockDisplay}</div>
            </div>

            <div class="section">
              <div class="row">
                <span class="label">Driver:</span>
                <span class="value">${checkIn.driver_name || 'N/A'}</span>
              </div>
              <div class="row">
                <span class="label">Carrier:</span>
                <span class="value">${checkIn.carrier_name || 'N/A'}</span>
              </div>
              <div class="row">
                <span class="label">Load Type:</span>
                <span class="value">${isInbound ? 'UNLOADING' : 'LOADING'}</span>
              </div>
            </div>

            <div class="section">
              <div class="row">
                <span class="label">Trailer #:</span>
                <span class="value">${checkIn.trailer_number || 'N/A'}</span>
              </div>
              <div class="row">
                <span class="label">Check-In:</span>
                <span class="value">${formatCheckInTime(checkIn.check_in_time)}</span>
              </div>
              ${checkIn.appointment_time ? `
              <div class="row">
                <span class="label">Appointment:</span>
                <span class="value">${formatAppointmentTime(checkIn.appointment_time)}</span>
              </div>
              ` : ''}
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Assign Dock</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {emailStatus && (
          <div className={`px-4 py-3 rounded mb-4 ${
            emailStatus.includes('✓') 
              ? 'bg-green-100 border border-green-400 text-green-700'
              : 'bg-yellow-100 border border-yellow-400 text-yellow-700'
          }`}>
            {emailStatus}
          </div>
        )}

        {showWarning && dockInfo && (
          <div className={`px-4 py-3 rounded mb-4 ${
            dockInfo.status === 'blocked'
              ? 'bg-red-100 border border-red-400 text-red-700'
              : 'bg-yellow-100 border border-yellow-400 text-yellow-700'
          }`}>
            {dockInfo.status === 'blocked' && (
              <>Dock {dockNumber} is currently BLOCKED</>
            )}
            {dockInfo.status === 'in-use' && (
              <>
                Dock {dockNumber} is currently IN USE:
                <ul className="mt-2 ml-4">
                  {dockInfo.orders.map((order, idx) => (
                    <li key={idx}>
                      {order.reference_number || 'N/A'} - {order.trailer_number || 'N/A'}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Select Dock Number *
          </label>
          <select
            value={dockNumber}
            onChange={(e) => setDockNumber(e.target.value)}
            className="w-full border rounded px-3 py-2"
            disabled={loading}
          >
            <option value="">Select a dock...</option>
            {dockOptions.map((dock) => (
              <option key={dock} value={dock}>
                {dock === 'Ramp' ? 'Ramp' : `Dock ${dock}`}
              </option>
            ))}
          </select>
          {checkingDock && (
            <p className="text-sm text-gray-500 mt-1">Checking dock status...</p>
          )}
        </div>

        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium">Send email notification</span>
          </label>
        </div>

        {sendEmail && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Driver Email
            </label>
            <input
              type="email"
              value={driverEmail}
              onChange={(e) => setDriverEmail(e.target.value)}
              placeholder="driver@example.com"
              className="w-full border rounded px-3 py-2"
              disabled={loading}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-100"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            disabled={loading || !dockNumber}
          >
            {loading ? 'Assigning...' : 'Assign Dock'}
          </button>
        </div>
      </div>
    </div>
  );
}

