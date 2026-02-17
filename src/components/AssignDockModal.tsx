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

      // Verify dock is still available (unless it's the Ramp or already assigned to this check-in)
      if (dockNumber !== 'Ramp' && currentCheckIn.dock_number !== dockNumber) {
        const { data: dockCheckIns, error: dockCheckError } = await supabase
          .from('check_ins')
          .select('id')
          .eq('dock_number', dockNumber)
          .in('status', ['checked_in', 'pending', 'at_dock', 'loading', 'unloading'])
          .neq('id', checkIn.id);

        if (dockCheckError) {
          console.error('Dock check error:', dockCheckError);
          throw new Error(`Unable to verify dock availability: ${dockCheckError.message}`);
        }

        if (dockCheckIns && dockCheckIns.length > 0) {
          throw new Error(`Dock ${dockNumber} is currently occupied. Please select another dock.`);
        }
      }

      // Update database with dock assignment
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

      // Trigger custom event for dock status update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dock-assignment-changed', {
          detail: { dockNumber, checkInId: checkIn.id }
        }));
      }

      printReceipt();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Assign dock error:', err);
      setError(err.message || 'Failed to assign dock. Please try again.');
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
              margin-bottom: 16px;
            }
            .receipt-title {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 8px;
            }
            .receipt-subtitle {
              font-size: 14px;
              color: #666;
            }
            .dock-assignment {
              background: #f0f0f0;
              padding: 16px;
              margin: 16px 0;
              text-align: center;
              border-radius: 8px;
            }
            .dock-number {
              font-size: 48px;
              font-weight: bold;
              color: #2563eb;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e0e0e0;
            }
            .info-label {
              font-weight: bold;
              color: #666;
            }
            .info-value {
              text-align: right;
            }
            .footer {
              margin-top: 24px;
              text-align: center;
              font-size: 12px;
              color: #999;
            }
          </style>
        </head>
        <body>
          <div class="receipt-page">
            <div class="receipt-header">
              <div class="receipt-title">Dock Assignment</div>
              <div class="receipt-subtitle">${currentDate}</div>
            </div>

            <div class="dock-assignment">
              <div style="font-size: 16px; margin-bottom: 8px;">Assigned to:</div>
              <div class="dock-number">${dockDisplay}</div>
            </div>

            <div>
              <div class="info-row">
                <span class="info-label">Driver:</span>
                <span class="info-value">${checkIn.driver_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Carrier:</span>
                <span class="info-value">${checkIn.carrier_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Reference #:</span>
                <span class="info-value">${checkIn.reference_number || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Trailer #:</span>
                <span class="info-value">${checkIn.trailer_number || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Load Type:</span>
                <span class="info-value">${isInbound ? 'Inbound' : 'Outbound'}</span>
              </div>
              ${checkIn.appointment_time ? `
              <div class="info-row">
                <span class="info-label">Appointment:</span>
                <span class="info-value">${formatAppointmentTime(checkIn.appointment_time)}</span>
              </div>
              ` : ''}
            </div>

            <div class="footer">
              <p>Please proceed to your assigned dock</p>
              <p>Thank you!</p>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              // Close after printing
              setTimeout(() => window.close(), 1000);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Assign Dock</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              disabled={loading}
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {emailStatus && (
            <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded text-sm">
              {emailStatus}
            </div>
          )}

          <div className="space-y-4">
            {/* Check-in Info */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-semibold">Driver:</span> {checkIn.driver_name || 'N/A'}
                </div>
                <div>
                  <span className="font-semibold">Carrier:</span> {checkIn.carrier_name || 'N/A'}
                </div>
                <div>
                  <span className="font-semibold">Reference:</span> {checkIn.reference_number || 'N/A'}
                </div>
                <div>
                  <span className="font-semibold">Trailer:</span> {checkIn.trailer_number || 'N/A'}
                </div>
              </div>
            </div>

            {/* Dock Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dock Number <span className="text-red-500">*</span>
              </label>
              <select
                value={dockNumber}
                onChange={(e) => setDockNumber(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Dock</option>
                {dockOptions.map(dock => (
                  <option key={dock} value={dock}>{dock === 'Ramp' ? 'Ramp' : `Dock ${dock}`}</option>
                ))}
              </select>
              {checkingDock && (
                <p className="text-sm text-gray-500 mt-1">Checking dock availability...</p>
              )}
            </div>

            {/* Dock Warning */}
            {showWarning && dockInfo && (
              <div className={`p-3 rounded-lg ${
                dockInfo.status === 'blocked' ? 'bg-red-100 border border-red-400' :
                dockInfo.status === 'in-use' ? 'bg-yellow-100 border border-yellow-400' :
                'bg-green-100 border border-green-400'
              }`}>
                <p className="font-semibold mb-1">
                  {dockInfo.status === 'blocked' && '🚫 Dock Blocked'}
                  {dockInfo.status === 'in-use' && '⚠️ Dock Currently In Use'}
                  {dockInfo.status === 'available' && '✓ Dock Available'}
                </p>
                {dockInfo.orders.length > 0 && (
                  <div className="text-sm mt-2">
                    <p className="font-medium">Current assignments:</p>
                    {dockInfo.orders.map((order, idx) => (
                      <p key={idx} className="ml-2">
                        • {order.reference_number || order.trailer_number || 'Unknown'}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Email Section */}
            <div className="border-t pt-4">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="sendEmail" className="text-sm font-medium text-gray-700">
                  Send email notification to driver
                </label>
              </div>
              {sendEmail && (
                <input
                  type="email"
                  value={driverEmail}
                  onChange={(e) => setDriverEmail(e.target.value)}
                  placeholder="driver@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={loading || !dockNumber || checkingDock}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Assigning...' : 'Assign & Print'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
