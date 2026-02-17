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
      setConfirmDoubleBook(false);
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
            
            /* Page 1 Styles - Receipt */
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
              margin-bottom: 15px;
            }
            .receipt-header h1 {
              margin: 0 0 5px 0;
              font-size: 24px;
              font-weight: bold;
            }
            .receipt-header p {
              margin: 2px 0;
              font-size: 11px;
            }
            .dock-assignment {
              background: #000;
              color: #fff;
              padding: 15px;
              text-align: center;
              margin: 15px 0;
              border-radius: 8px;
            }
            .dock-assignment h2 {
              margin: 0;
              font-size: 28px;
              font-weight: bold;
            }
            .info-section {
              margin: 12px 0;
              padding: 8px 0;
              border-bottom: 1px solid #ddd;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin: 6px 0;
              font-size: 13px;
            }
            .info-label {
              font-weight: bold;
              color: #333;
            }
            .info-value {
              text-align: right;
              color: #000;
            }
            .receipt-footer {
              margin-top: 20px;
              padding-top: 12px;
              border-top: 2px dashed #000;
              text-align: center;
              font-size: 11px;
            }
            .important-note {
              background: #fff3cd;
              border: 2px solid #ffc107;
              padding: 10px;
              margin: 15px 0;
              border-radius: 5px;
              font-size: 12px;
            }
            
            /* Page 2 Styles - Instructions */
            .instructions-page {
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .instructions-header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 3px solid #000;
            }
            .instructions-header h1 {
              margin: 0 0 10px 0;
              font-size: 32px;
            }
            .load-type-badge {
              display: inline-block;
              background: ${isInbound ? '#28a745' : '#007bff'};
              color: white;
              padding: 8px 20px;
              border-radius: 5px;
              font-size: 18px;
              font-weight: bold;
            }
            .instruction-section {
              margin: 25px 0;
            }
            .instruction-section h2 {
              background: #f8f9fa;
              padding: 10px 15px;
              border-left: 4px solid ${isInbound ? '#28a745' : '#007bff'};
              margin: 15px 0 10px 0;
              font-size: 20px;
            }
            .instruction-list {
              list-style: none;
              padding: 0;
              margin: 10px 0;
            }
            .instruction-list li {
              padding: 12px 15px;
              margin: 8px 0;
              background: #f8f9fa;
              border-left: 3px solid ${isInbound ? '#28a745' : '#007bff'};
              font-size: 14px;
              line-height: 1.6;
            }
            .instruction-list li strong {
              color: ${isInbound ? '#28a745' : '#007bff'};
            }
            .warning-box {
              background: #fff3cd;
              border: 2px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
            }
            .warning-box h3 {
              margin: 0 0 10px 0;
              color: #856404;
              font-size: 18px;
            }
            .warning-box ul {
              margin: 5px 0 0 20px;
              padding: 0;
            }
            .warning-box li {
              margin: 5px 0;
              font-size: 14px;
              color: #856404;
            }
            .contact-info {
              margin-top: 30px;
              padding: 20px;
              background: #e9ecef;
              border-radius: 5px;
              text-align: center;
            }
            .contact-info h3 {
              margin: 0 0 10px 0;
              font-size: 18px;
            }
            .contact-info p {
              margin: 5px 0;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <!-- PAGE 1: RECEIPT -->
          <div class="receipt-page">
            <div class="receipt-header">
              <h1>WAREHOUSE CHECK-IN</h1>
              <p>Load Assignment Receipt</p>
              <p>${currentDate}</p>
            </div>

            <div class="dock-assignment">
              <h2>ASSIGNED TO: ${dockDisplay.toUpperCase()}</h2>
            </div>

            <div class="info-section">
              <div class="info-row">
                <span class="info-label">Driver Name:</span>
                <span class="info-value">${checkIn.driver_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Company:</span>
                <span class="info-value">${checkIn.company || checkIn.carrier_name || 'N/A'}</span>
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
                <span class="info-value">${isInbound ? 'INBOUND' : 'OUTBOUND'}</span>
              </div>
              ${checkIn.appointment_time ? `
              <div class="info-row">
                <span class="info-label">Appointment:</span>
                <span class="info-value">${formatAppointmentTime(checkIn.appointment_time)}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Check-in Time:</span>
                <span class="info-value">${formatCheckInTime(checkIn.check_in_time) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div class="important-note">
              <strong>⚠️ IMPORTANT:</strong> Please proceed to your assigned ${dockDisplay} and follow all warehouse safety procedures. Keep this receipt visible in your vehicle.
            </div>

            <div class="receipt-footer">
              <p><strong>Thank you for your cooperation</strong></p>
              <p>Please see next page for ${isInbound ? 'unloading' : 'loading'} instructions</p>
            </div>
          </div>

          <!-- PAGE 2: INSTRUCTIONS -->
          <div class="page-break"></div>
          <div class="instructions-page">
            <div class="instructions-header">
              <h1>${isInbound ? 'INBOUND UNLOADING' : 'OUTBOUND LOADING'} INSTRUCTIONS</h1>
              <div class="load-type-badge">${isInbound ? 'RECEIVING' : 'SHIPPING'}</div>
            </div>

            ${isInbound ? `
              <!-- INBOUND INSTRUCTIONS -->
              <div class="instruction-section">
                <h2>Before Unloading</h2>
                <ul class="instruction-list">
                  <li><strong>1. Verify Assignment:</strong> Ensure you are at the correct dock (${dockDisplay})</li>
                  <li><strong>2. Safety Check:</strong> Set parking brake and turn off engine before opening trailer doors</li>
                  <li><strong>3. Wait for Warehouse:</strong> DO NOT open trailer doors until warehouse personnel arrive</li>
                  <li><strong>4. BOL Ready:</strong> Have your Bill of Lading and all paperwork ready for inspection</li>
                </ul>
              </div>

              <div class="instruction-section">
                <h2>During Unloading</h2>
                <ul class="instruction-list">
                  <li><strong>Stay in Cab:</strong> Remain in your vehicle unless instructed otherwise by warehouse personnel</li>
                  <li><strong>Inspect with Team:</strong> Participate in damage inspection before unloading begins</li>
                  <li><strong>Document Issues:</strong> Report any damaged or discrepant items immediately</li>
                  <li><strong>No Smoking:</strong> Smoking is prohibited in all warehouse areas and near docks</li>
                </ul>
              </div>

              <div class="instruction-section">
                <h2>After Unloading</h2>
                <ul class="instruction-list">
                  <li><strong>Final Inspection:</strong> Walk through trailer with warehouse personnel to verify complete unload</li>
                  <li><strong>Sign Documents:</strong> Obtain signed BOL and any required delivery receipts</li>
                  <li><strong>Check Out:</strong> Return to guard shack to complete check-out process</li>
                  <li><strong>Secure Load:</strong> Close and secure all trailer doors before departing</li>
                </ul>
              </div>

              <div class="warning-box">
                <h3>⚠️ Safety Requirements</h3>
                <ul>
                  <li>Hard hats and safety vests REQUIRED in all warehouse areas</li>
                  <li>Maintain 10 MPH speed limit on warehouse property</li>
                  <li>Report all incidents or accidents immediately</li>
                  <li>Follow all directional signs and traffic patterns</li>
                </ul>
              </div>
            ` : `
              <!-- OUTBOUND INSTRUCTIONS -->
              <div class="instruction-section">
                <h2>Before Loading</h2>
                <ul class="instruction-list">
                  <li><strong>1. Verify Assignment:</strong> Ensure you are at the correct dock (${dockDisplay})</li>
                  <li><strong>2. Trailer Inspection:</strong> Trailer must be clean, dry, and in good condition</li>
                  <li><strong>3. Provide Documentation:</strong> Present BOL and all shipping documents to warehouse personnel</li>
                  <li><strong>4. Safety Check:</strong> Set parking brake and turn off engine</li>
                </ul>
              </div>

              <div class="instruction-section">
                <h2>During Loading</h2>
                <ul class="instruction-list">
                  <li><strong>Stay in Cab:</strong> Remain in your vehicle unless instructed otherwise by warehouse personnel</li>
                  <li><strong>No Entry:</strong> Do NOT enter the warehouse or loading area</li>
                  <li><strong>Monitor Progress:</strong> Be available if warehouse staff needs to communicate with you</li>
                  <li><strong>No Smoking:</strong> Smoking is prohibited in all warehouse areas and near docks</li>
                </ul>
              </div>

              <div class="instruction-section">
                <h2>After Loading</h2>
                <ul class="instruction-list">
                  <li><strong>Inspect Load:</strong> Verify load count and condition with warehouse personnel</li>
                  <li><strong>Secure Cargo:</strong> Ensure all freight is properly secured and trailer doors are properly sealed</li>
                  <li><strong>Get Signatures:</strong> Obtain signed BOL and all required shipping documents</li>
                  <li><strong>Verify Seal:</strong> Record seal number on all documents before departing</li>
                  <li><strong>Check Out:</strong> Return to guard shack to complete check-out process</li>
                </ul>
              </div>

              <div class="warning-box">
                <h3>⚠️ Safety Requirements</h3>
                <ul>
                  <li>Hard hats and safety vests REQUIRED in all warehouse areas</li>
                  <li>Maintain 10 MPH speed limit on warehouse property</li>
                  <li>Report all incidents or accidents immediately</li>
                  <li>Do not break seal or open trailer doors once sealed</li>
                  <li>Follow all directional signs and traffic patterns</li>
                </ul>
              </div>
            `}

            <div class="contact-info">
              <h3>Need Assistance?</h3>
              <p><strong>Warehouse Office:</strong> Contact guard shack or warehouse supervisor</p>
              <p><strong>Emergency:</strong> Dial 911 or contact security immediately</p>
              <p><strong>Date:</strong> ${today}</p>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              // Close window after print dialog is dismissed
              setTimeout(function() {
                window.close();
              }, 100);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
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

      // Trigger custom event for dock status update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dock-assignment-changed', {
          detail: { dockNumber, checkInId: checkIn.id }
        }));
      }

      // Print receipt
      printReceipt();
      
      // Success
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
              <div>
                <p className="text-sm text-gray-600">Load Type</p>
                <p className="font-semibold capitalize">{checkIn.load_type || 'N/A'}</p>
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

