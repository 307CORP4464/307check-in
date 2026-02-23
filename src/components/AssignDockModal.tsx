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

  // Gross weight state
  const [grossWeight, setGrossWeight] = useState('');

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
      setGrossWeight('');
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
      let appointmentStatus = 'No Appointment';
      if (checkIn.appointment_time && checkIn.check_in_time) {
        const checkInDate = new Date(checkIn.check_in_time);
        const appointmentTimeStr = checkIn.appointment_time;

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
            // Pass gross weight if provided
            grossWeight: grossWeight ? grossWeight.trim() : null,
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

      if (sendEmail && driverEmail) {
        await sendEmailNotification(dockNumber, driverEmail);
      }

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Assign Dock</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Driver Info Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm text-gray-700">
            <p><span className="font-semibold">Driver:</span> {checkIn.driver_name || 'N/A'}</p>
            <p><span className="font-semibold">Carrier:</span> {checkIn.carrier_name || 'N/A'}</p>
            <p><span className="font-semibold">Reference #:</span> {checkIn.reference_number || 'N/A'}</p>
            <p><span className="font-semibold">Trailer #:</span> {checkIn.trailer_number || 'N/A'}</p>
            <p>
              <span className="font-semibold">Load Type:</span>{' '}
              <span className={`capitalize font-medium ${checkIn.load_type === 'inbound' ? 'text-blue-600' : 'text-green-600'}`}>
                {checkIn.load_type || 'N/A'}
              </span>
            </p>
          </div>

          {/* Dock Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Dock Number <span className="text-red-500">*</span>
            </label>
            <select
              value={dockNumber}
              onChange={(e) => setDockNumber(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a dock...</option>
              {dockOptions.map((dock) => (
                <option key={dock} value={dock}>
                  {dock === 'Ramp' ? 'Ramp' : `Dock ${dock}`}
                </option>
              ))}
            </select>

            {/* Dock Status Warning */}
            {checkingDock && (
              <p className="mt-1 text-xs text-gray-500">Checking dock availability...</p>
            )}
            {!checkingDock && dockInfo && showWarning && (
              <div className={`mt-2 p-3 rounded-lg text-sm ${dockInfo.status === 'blocked' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                {dockInfo.status === 'blocked' ? (
                  <p className="font-semibold">⚠️ This dock is currently blocked.</p>
                ) : (
                  <>
                    <p className="font-semibold">⚠️ This dock is currently in use.</p>
                    {dockInfo.orders.map((o, i) => (
                      <p key={i} className="text-xs mt-1">
                        {o.reference_number && `Ref: ${o.reference_number}`}
                        {o.trailer_number && ` | Trailer: ${o.trailer_number}`}
                      </p>
                    ))}
                  </>
                )}
              </div>
            )}
            {!checkingDock && dockInfo && dockInfo.status === 'available' && (
              <p className="mt-1 text-xs text-green-600">✓ Dock is available</p>
            )}
          </div>

          {/* Gross Weight Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Gross Weight (lbs)
              <span className="ml-1 text-xs font-normal text-gray-500">— optional, included in driver email</span>
            </label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 42500"
              value={grossWeight}
              onChange={(e) => setGrossWeight(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {grossWeight && (
              <p className="mt-1 text-xs text-blue-600">
                ℹ️ Driver will be notified of this weight and must visit the office if they have concerns.
              </p>
            )}
          </div>

          {/* Email Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">Email Notification</label>
              <button
                type="button"
                onClick={() => setSendEmail(!sendEmail)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${sendEmail ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${sendEmail ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>

            {sendEmail && (
              <div>
                <label className="block text-xs text-gray-600 mb-1">Driver Email</label>
                <input
                  type="email"
                  placeholder="driver@example.com"
                  value={driverEmail}
                  onChange={(e) => setDriverEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {grossWeight && driverEmail && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    📧 Email will include gross weight of <strong>{Number(grossWeight).toLocaleString()} lbs</strong> and weight acceptance notice.
                  </div>
                )}
              </div>
            )}

            {emailStatus && (
              <p className={`text-xs font-medium ${emailStatus.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {emailStatus}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={loading || !dockNumber}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Assigning...' : 'Assign Dock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
