'use client';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface AssignDockModalProps {
  checkIn: {
    id: string;
    driver_name?: string;
    dock_number?: string;
    appointment_time?: string | null;
    carrier_name?: string;
    reference_number?: string;
    driver_phone?: string;
    driver_email?: string;  // Changed from driver_phone
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
    { value: 'work_in', label: 'Work In' }
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
  
  // Determine load type - adjust this based on your data structure
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
          .print-button {
            display: block;
            margin: 20px auto;
            padding: 12px 24px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
          }
          .print-button:hover {
            background-color: #45a049;
          }

          /* Page 2 Styles - Inspection Forms */
          .inspection-page {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            font-size: 10pt;
          }
          .title {
            text-align: center;
            font-weight: bold;
            font-size: 14pt;
            margin-bottom: 10px;
          }
          .info-line {
            margin: 8px 0;
            font-weight: bold;
            font-size: 11pt;
          }
          .section-title {
            font-weight: bold;
            font-size: 12pt;
            margin: 15px 0 8px 0;
            padding: 5px 0;
            border-bottom: 1px solid black;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
          }
          th, td {
            border: 1px solid black;
            padding: 4px 6px;
            text-align: left;
            font-size: 9pt;
          }
          th {
            background-color: #f0f0f0;
            font-weight: bold;
          }
          .checkbox-cell {
            text-align: center;
            width: 40px;
          }
          .signature-line {
            border-bottom: 1px solid black;
            display: inline-block;
            width: 250px;
          }
          .comment-line {
            border-bottom: 1px solid black;
            height: 20px;
            margin: 3px 0;
          }
          .checkbox-group {
            margin: 8px 0;
            font-size: 9pt;
          }
          .warning-box {
            font-weight: bold;
            margin: 10px 0;
            line-height: 1.4;
            font-size: 9pt;
          }
          .footer {
            margin-top: 12px;
            font-size: 9pt;
          }
          .footer-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .spacer-row {
            height: 20px;
          }
          .spacer-row-double {
            height: 40px;
          }
        </style>
      </head>
      <body>
        <!-- Page 1: Load Receipt -->
        <div class="receipt-page">
          <div class="receipt-header">
            <h1>Load Assignment Receipt</h1>
            <p style="margin: 5px 0; font-size: 12px;">${currentDate}</p>
          </div>

          <div class="reference-box">
            <div class="reference-number">REF: ${checkIn.reference_number || 'N/A'}</div>
            <div class="dock-number">ASSIGNED TO: ${dockDisplay}</div>
          </div>

          <div class="section">
            <div class="row">
              <span class="label">Driver:</span>
              <span class="value">${checkIn.driver_name || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Phone#:</span>
              <span class="value">${checkIn.driver_phone || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Carrier:</span>
              <span class="value">${checkIn.carrier_name || 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <div class="row">
              <span class="label">Trailer #:</span>
              <span class="value">${checkIn.trailer_number || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Trailer Length:</span>
              <span class="value">${checkIn.trailer_length || 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <div class="row">
              <span class="label">Destination:</span>
              <span class="value">${checkIn.destination_city || ''} ${checkIn.destination_state || ''}</span>
            </div>
            <div class="row">
              <span class="label">Appointment:</span>
              <span class="value">${checkIn.appointment_time ? formatAppointmentTime(checkIn.appointment_time) : 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Check-in Time:</span>
              <span class="value">${formatCheckInTime(checkIn.check_in_time)}</span>
            </div>
          </div>

          <button class="print-button no-print" onclick="window.print()">Print Receipt</button>
        </div>

        <!-- Page 2: Inspection Form -->
        <div class="page-break"></div>
        
        ${isInbound ? getInboundInspectionForm() : getOutboundInspectionForm()}

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(receiptHTML);
  printWindow.document.close();

  // Helper function for Inbound Inspection
  function getInboundInspectionForm() {
    return `
      <div class="inspection-page">
        <div class="title">PRP02A: INBOUND INSPECTION</div>

        <div class="info-line">
          Date: <strong>${today}</strong>&nbsp;&nbsp;&nbsp;
          Delivery#: <strong>${checkIn.reference_number || 'N/A'}</strong>&nbsp;&nbsp;&nbsp;
          Trailer#: <strong>${checkIn.trailer_number || 'N/A'}</strong>
        </div>

        <!-- 1 ROW OF SPACE BEFORE TABLE -->
        <div class="spacer-row"></div>

        <table>
          <thead>
            <tr>
              <th>INSPECTION ITEM</th>
              <th class="checkbox-cell">YES</th>
              <th class="checkbox-cell">NO</th>
              <th class="checkbox-cell">N/A</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>IS THE TRAILER PROPERLY SEALED?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>DOES THE SEAL# ON THE TRAILER MATCH THE SEAL# ON THE BOL AND BEEN INITIALED ON THE BOL?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>DOES THE MATERIAL & LOT #'S OF THE PRODUCT ON THE TRAILER MATCH WHAT IS INDICATED ON THE BOL?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>IS THE VISIBLE PRODUCT AND PALLET FREE OF FOREIGN OBJECTS, INSECTS, MOLD & DAMAGE?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>WAS THE TRAILER FREE OF METAL/GLASS, RODENT/INSECT INFESTATION, DAMAGE AND ODOR?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>IS ALL OF THE VISIBLE PRINT ON THE BAGS LEGIBLE AND ARE ALL OF THE VISIBLE VALVES FREE OF LEAKAGE?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
          </tbody>
        </table>

        <div class="warning-box">
          IF ANY OF THE ABOVE QUESTIONS WERE ANSWERED "NO" PLEASE ENSURE CORRECTIVE ACTION IS TAKEN AND/OR NOTIFY A SUPERVISOR.<br>
          IF ANY PRODUCT IS QUESTIONABLE TO RECEIVE INTO THE WAREHOUSE, CONTACT A SUPERVISOR FOR APPROVAL.
        </div>

        <div style="margin: 10px 0;">
          <strong>I ACKNOWLEDGE THAT ALL ITEMS LISTED ABOVE HAVE BEEN EXECUTED.</strong><br>
            <div class="spacer-row"></div>
          <strong>OPERATOR SIGNATURE:</strong> <span class="signature-line"></span>
        </div>

        <div style="margin: 8px 0;">
          <strong>COMMENTS:</strong>
          <div class="comment-line"></div>
          <div class="comment-line"></div>
        </div>

        <!-- 2 ROWS OF SPACE BEFORE REVISIONS TABLE -->
        <div class="spacer-row-double"></div>
         <div class="spacer-row-double"></div>
          <div class="spacer-row-double"></div>

        <table style="font-size: 7pt; margin-top: 10px;">
          <thead>
            <tr>
              <th style="width: 10%;">Rev #</th>
              <th style="width: 40%;">Summary of Changes</th>
              <th style="width: 17%;">Requested By</th>
              <th style="width: 18%;">Authorized By</th>
              <th style="width: 15%;">Date Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Original</td><td></td><td>Quality Manager</td><td>Operations Manager</td><td>10/28/2015</td></tr>
            <tr><td>2</td><td>Changed question 9.</td><td>Quality Manager</td><td>Operations Manager</td><td>10/30/2017</td></tr>
            <tr><td>3</td><td>Updated questions</td><td>Quality Manager</td><td>Operations Manager</td><td>09/19/2018</td></tr>
            <tr><td>4</td><td>Updated question 4 to add pallet inspection.</td><td>Quality Manager</td><td>Operations Manager</td><td>01/14/2026</td></tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-row">
            <span><strong>PRP02A</strong> Inbound Inspection</span>
            <span><strong>Owned By:</strong> Quality Manager</span>
            <span><strong>Authorized By:</strong> Operations Manager</span>
          </div>
        </div>
      </div>
    `;
  }

  // Helper function for Outbound Inspection
  function getOutboundInspectionForm() {
    return `
      <div class="inspection-page">
        <div class="title">PRP03A: OUTBOUND INSPECTION</div>

        <div class="info-line">
          Date: <strong>${today}</strong>&nbsp;&nbsp;&nbsp;
          Load#: <strong>${checkIn.reference_number || 'N/A'}</strong>&nbsp;&nbsp;&nbsp;
          Trailer#: <strong>${checkIn.trailer_number || 'N/A'}</strong>
        </div>

        <table>
          <thead>
            <tr>
              <th>GENERAL TRAILER GMP</th>
              <th class="checkbox-cell">YES</th>
              <th class="checkbox-cell">NO</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>EVIDENCE OF ODOR?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>DEBRIS ON FLOOR OR IN CORNERS?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>EVIDENCE OF INSECT OR RODENT ACTIVITY?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>PREVIOUS PRODUCT RESIDUE?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>SPLINTERED SIDEWALLS, CEILING OR FLOOR THAT COULD DAMAGE BAGS?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>BROKEN GLASS OR METAL SHAVINGS?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>NAILS OR OTHER OBJECTS PROTRUDING FROM THE FLOORS OR SIDEWALLS?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>HOLES ON CEILING, SIDEWALLS OR FLOORS?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>EVIDENCE OF LEAKS, STANDING WATER, MOISTURE, MOLD, MILDEW, ETC?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>PRODUCT SECURITY & LOADER SAFETY</th>
              <th class="checkbox-cell">YES</th>
              <th class="checkbox-cell">NO</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>PROBLEMS WITH LATCHES ON DOORS WORKING PROPERLY?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>IS TRAILER UNSEALABLE?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>LOAD STRAPS/BARS APPLIED IF REQUIRED?</td><td class="checkbox-cell">☐</td><td class="checkbox-cell">☐</td></tr>
          </tbody>
        </table>

        <div style="margin: 8px 0;">
          <strong>LOADER SIGNATURE:</strong> <span class="signature-line"></span>
        </div>

        <div style="margin: 8px 0;">
          <strong>COMMENTS:</strong>
          <div class="comment-line"></div>
          <div class="comment-line"></div>
        </div>

        <div class="checkbox-group">
          <div>Rejected by: <span class="signature-line"></span></div>
          <div style="margin-top: 5px;">
            ☐ OK TO LOAD AFTER SWEEPING 
            ☐ Needs new trailer 
            ☐ Driver can correct trailer
          </div>
        </div>

        <!-- 1 ROW OF SPACE BEFORE PRE-SEALING CHECKLIST -->
        <div class="spacer-row"></div>

        <table>
          <thead>
            <tr>
              <th>PRE-SEALING CHECKLIST</th>
              <th class="checkbox-cell">INITIAL</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>ALL THE INSTRUCTIONS ON THE BILL OF LADING BEEN FOLLOWED?</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>TRAILER HAS BEEN LATCH PROPERLY?</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>THE TRAILER BEEN SEALED?</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>CUSTOMER REQUIRED PHOTOS TAKEN AND SENT?</td><td class="checkbox-cell">☐</td></tr>
            <tr><td>INITIALS OF PERSON THAT SEALED</td><td class="checkbox-cell">__________</td></tr>
            
          </tbody>
        </table>

        <!-- 2 ROWS OF SPACE AFTER PRE-SEALING CHECKLIST -->
        <div class="spacer-row-double"></div>

        <table style="font-size: 7pt; margin-top: 10px;">
          <thead>
            <tr>
              <th style="width: 10%;">Rev #</th>
              <th style="width: 40%;">Summary of Changes</th>
              <th style="width: 17%;">Requested By</th>
              <th style="width: 18%;">Authorized By</th>
              <th style="width: 15%;">Date Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Original</td><td>Outbound Inspection - Restructured</td><td>Quality Manager</td><td>Operations Manager</td><td>7/24/2025</td></tr>
            <tr><td>2</td><td>Added loadbar question</td><td>Quality Manager</td><td>Operations Manager</td><td>7/31/2025</td></tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-row">
            <span><strong>PRP03A</strong> Outbound Inspection</span>
            <span><strong>Owned By:</strong> Quality Manager</span>
            <span><strong>Authorized By:</strong> Operations Manager</span>
          </div>
        </div>
      </div>
    `;
  }
};



  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Assign Dock</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              disabled={loading}
            >
              ×
            </button>
          </div>

          {/* Load Information */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-3">Load Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Driver:</span>
                <span className="ml-2 font-medium">{checkIn.driver_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Reference:</span>
                <span className="ml-2 font-medium">{checkIn.reference_number || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Carrier:</span>
                <span className="ml-2 font-medium">{checkIn.carrier_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Trailer:</span>
                <span className="ml-2 font-medium">{checkIn.trailer_number || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">Appointment:</span>
                <span className="ml-2 font-medium">
                  {checkIn.appointment_time ? formatAppointmentTime(checkIn.appointment_time) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Check-In:</span>
                <span className="ml-2 font-medium">{formatCheckInTime(checkIn.check_in_time)}</span>
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
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="">-- Select Dock --</option>
              {dockOptions.map((dock) => (
                <option key={dock} value={dock}>
                  {dock === 'Ramp' ? 'Ramp' : `Dock ${dock}`}
                </option>
              ))}
            </select>
          </div>

          {/* Dock Status Warning */}
          {checkingDock && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              Checking dock status...
            </div>
          )}

          {showWarning && dockInfo && (
            <div className={`mb-4 p-4 rounded-lg border ${
              dockInfo.status === 'blocked' 
                ? 'bg-red-50 border-red-200 text-red-700' 
                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
            }`}>
              <div className="flex items-start">
                <span className="text-xl mr-2">⚠️</span>
                <div>
                  <p className="font-semibold mb-1">
                    {dockInfo.status === 'blocked' ? 'Dock Blocked' : 'Dock In Use'}
                  </p>
                  {dockInfo.status === 'in-use' && dockInfo.orders.length > 0 && (
                    <div className="text-sm">
                      <p className="mb-1">Currently assigned to:</p>
                      <ul className="list-disc list-inside">
                        {dockInfo.orders.map((order, idx) => (
                          <li key={idx}>
                            {order.reference_number || 'Unknown'} - {order.trailer_number || 'N/A'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Email Section */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="w-4 h-4 text-blue-600 mr-2"
                  disabled={loading}
                />
                <span className="font-medium text-gray-700">Send Email Notification</span>
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
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Driver will receive dock assignment via email
                </p>
              </div>
            )}

            {emailStatus && (
              <div className={`mt-3 p-2 rounded ${
                emailStatus.includes('successfully') 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {emailStatus}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={loading || !dockNumber}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Assigning...
                </>
              ) : (
                'Assign & Print'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
