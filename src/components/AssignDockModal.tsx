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

          /* ── Page 1 – Receipt ── */
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
            font-size: 20px;
            margin: 0 0 4px 0;
          }
          .receipt-header p {
            font-size: 12px;
            margin: 0;
            color: #555;
          }
          .receipt-body {
            font-size: 13px;
          }
          .receipt-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px dotted #ccc;
          }
          .receipt-row .label {
            font-weight: bold;
            color: #333;
          }
          .receipt-row .value {
            text-align: right;
            color: #000;
          }
          .dock-highlight {
            text-align: center;
            margin: 16px 0;
            padding: 12px;
            border: 3px solid #000;
            border-radius: 6px;
          }
          .dock-highlight .dock-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #555;
          }
          .dock-highlight .dock-number {
            font-size: 36px;
            font-weight: bold;
            color: #000;
          }
          .weight-box {
            margin: 12px 0;
            padding: 10px 12px;
            border: 2px solid #000;
            border-radius: 4px;
            background: #f9f9f9;
          }
          .weight-box .weight-title {
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .weight-box .weight-value {
            font-size: 20px;
            font-weight: bold;
            color: #000;
          }
          .weight-notice {
            font-size: 11px;
            color: #444;
            margin-top: 6px;
            line-height: 1.4;
          }
          .receipt-footer {
            margin-top: 16px;
            text-align: center;
            font-size: 11px;
            color: #555;
            border-top: 2px dashed #000;
            padding-top: 10px;
          }
          .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            color: #fff;
          }
          .badge-inbound  { background: #2563eb; }
          .badge-outbound { background: #16a34a; }

          /* ── Page 2 – Inspection Sheet ── */
          .inspection-page {
            padding: 20px;
            max-width: 680px;
            margin: 0 auto;
          }
          .inspection-header {
            text-align: center;
            border-bottom: 3px solid #000;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .inspection-header h1 {
            font-size: 22px;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .inspection-header p {
            font-size: 12px;
            margin: 2px 0;
            color: #555;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 16px;
          }
          .info-field {
            border-bottom: 1px solid #000;
            padding-bottom: 4px;
          }
          .info-field .field-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #666;
          }
          .info-field .field-value {
            font-size: 13px;
            font-weight: bold;
            color: #000;
            min-height: 18px;
          }
          .section-title {
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: #000;
            color: #fff;
            padding: 4px 10px;
            margin: 14px 0 8px 0;
          }
          .checklist {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .checklist li {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 5px 0;
            border-bottom: 1px dotted #ccc;
            font-size: 12px;
          }
          .checklist li:last-child {
            border-bottom: none;
          }
          .check-box {
            width: 14px;
            height: 14px;
            border: 2px solid #000;
            flex-shrink: 0;
            margin-top: 1px;
          }
          .damage-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 6px;
          }
          .damage-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
          }
          .notes-area {
            border: 1px solid #000;
            min-height: 60px;
            margin-top: 6px;
            padding: 6px;
            font-size: 12px;
          }
          .signature-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
          }
          .signature-field {
            border-top: 1px solid #000;
            padding-top: 4px;
            font-size: 11px;
            color: #555;
            text-align: center;
          }
          .weight-inspection-box {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border: 2px solid #000;
            padding: 8px 12px;
            margin: 10px 0;
            border-radius: 4px;
          }
          .weight-inspection-label {
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .weight-inspection-value {
            font-size: 18px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>

        <!-- ════════════════════════════════════════ -->
        <!-- PAGE 1 — RECEIPT                        -->
        <!-- ════════════════════════════════════════ -->
        <div class="receipt-page">
          <div class="receipt-header">
            <h1>Dock Assignment Receipt</h1>
            <p>${currentDate}</p>
          </div>

          <div class="receipt-body">

            <!-- Dock highlight -->
            <div class="dock-highlight">
              <div class="dock-label">Assigned Dock</div>
              <div class="dock-number">${dockDisplay}</div>
              <span class="badge ${isInbound ? 'badge-inbound' : 'badge-outbound'}">
                ${isInbound ? 'INBOUND' : 'OUTBOUND'}
              </span>
            </div>

            <!-- Driver / load details -->
            <div class="receipt-row">
              <span class="label">Driver</span>
              <span class="value">${checkIn.driver_name || 'N/A'}</span>
            </div>
            <div class="receipt-row">
              <span class="label">Carrier</span>
              <span class="value">${checkIn.carrier_name || 'N/A'}</span>
            </div>
            <div class="receipt-row">
              <span class="label">Reference #</span>
              <span class="value">${checkIn.reference_number || 'N/A'}</span>
            </div>
            <div class="receipt-row">
              <span class="label">Trailer #</span>
              <span class="value">${checkIn.trailer_number || 'N/A'}</span>
            </div>
            <div class="receipt-row">
              <span class="label">Trailer Length</span>
              <span class="value">${checkIn.trailer_length || 'N/A'}</span>
            </div>
            ${checkIn.appointment_time ? `
            <div class="receipt-row">
              <span class="label">Appointment</span>
              <span class="value">${formatAppointmentTime(checkIn.appointment_time)}</span>
            </div>` : ''}
            ${checkIn.check_in_time ? `
            <div class="receipt-row">
              <span class="label">Check-In Time</span>
              <span class="value">${formatCheckInTime(checkIn.check_in_time)}</span>
            </div>` : ''}
            ${checkIn.destination_city || checkIn.destination_state ? `
            <div class="receipt-row">
              <span class="label">Destination</span>
              <span class="value">${[checkIn.destination_city, checkIn.destination_state].filter(Boolean).join(', ')}</span>
            </div>` : ''}

            <!-- Gross Weight Box -->
            ${grossWeight ? `
            <div class="weight-box">
              <div class="weight-title">⚖️ Gross Weight</div>
              <div class="weight-value">${Number(grossWeight).toLocaleString()} lbs</div>
              <div class="weight-notice">
                If you have any concerns regarding this weight, please see us in the office
                before proceeding to your assigned dock.<br/>
                <strong>By proceeding to ${dockDisplay}, you are accepting the listed gross weight.</strong>
              </div>
            </div>` : ''}

          </div>

          <div class="receipt-footer">
            <p>Please proceed to <strong>${dockDisplay}</strong></p>
            <p>Thank you — Have a safe trip!</p>
          </div>
        </div>

        <!-- ════════════════════════════════════════ -->
        <!-- PAGE 2 — INSPECTION SHEET               -->
        <!-- ════════════════════════════════════════ -->
        <div class="inspection-page page-break">
          <div class="inspection-header">
            <h1>${isInbound ? 'Inbound' : 'Outbound'} Trailer Inspection Sheet</h1>
            <p>Date: ${today} &nbsp;|&nbsp; ${dockDisplay}</p>
          </div>

          <!-- Info grid -->
          <div class="info-grid">
            <div class="info-field">
              <div class="field-label">Driver Name</div>
              <div class="field-value">${checkIn.driver_name || ''}</div>
            </div>
            <div class="info-field">
              <div class="field-label">Carrier</div>
              <div class="field-value">${checkIn.carrier_name || ''}</div>
            </div>
            <div class="info-field">
              <div class="field-label">Trailer #</div>
              <div class="field-value">${checkIn.trailer_number || ''}</div>
            </div>
            <div class="info-field">
              <div class="field-label">Reference #</div>
              <div class="field-value">${checkIn.reference_number || ''}</div>
            </div>
            <div class="info-field">
              <div class="field-label">Trailer Length</div>
              <div class="field-value">${checkIn.trailer_length || ''}</div>
            </div>
            <div class="info-field">
              <div class="field-label">Assigned Dock</div>
              <div class="field-value">${dockDisplay}</div>
            </div>
            ${checkIn.destination_city || checkIn.destination_state ? `
            <div class="info-field">
              <div class="field-label">Destination</div>
              <div class="field-value">${[checkIn.destination_city, checkIn.destination_state].filter(Boolean).join(', ')}</div>
            </div>` : ''}
            ${checkIn.appointment_time ? `
            <div class="info-field">
              <div class="field-label">Appointment Time</div>
              <div class="field-value">${formatAppointmentTime(checkIn.appointment_time)}</div>
            </div>` : ''}
          </div>

          <!-- Gross Weight on inspection sheet -->
          ${grossWeight ? `
          <div class="weight-inspection-box">
            <span class="weight-inspection-label">⚖️ Gross Weight:</span>
            <span class="weight-inspection-value">${Number(grossWeight).toLocaleString()} lbs</span>
          </div>` : ''}

          ${isInbound ? `
          <!-- ── INBOUND CHECKLIST ── -->
          <div class="section-title">Inbound Trailer Checklist</div>
          <ul class="checklist">
            <li><div class="check-box"></div> Trailer doors inspected — no visible damage</li>
            <li><div class="check-box"></div> Trailer seals intact and matching paperwork</li>
            <li><div class="check-box"></div> Trailer floor in acceptable condition (no holes / debris)</li>
            <li><div class="check-box"></div> Trailer is properly chocked / secured at dock</li>
            <li><div class="check-box"></div> Dock leveler properly positioned</li>
            <li><div class="check-box"></div> Interior lighting adequate</li>
            <li><div class="check-box"></div> No evidence of pest / contamination</li>
            <li><div class="check-box"></div> Load is accessible and not shifted</li>
            <li><div class="check-box"></div> All paperwork / BOL verified with driver</li>
          </ul>

          <div class="section-title">Damage / Discrepancy Report</div>
          <div class="damage-grid">
            <div class="damage-item"><div class="check-box"></div> Damaged goods</div>
            <div class="damage-item"><div class="check-box"></div> Shortage</div>
            <div class="damage-item"><div class="check-box"></div> Overage</div>
            <div class="damage-item"><div class="check-box"></div> Wrong item</div>
            <div class="damage-item"><div class="check-box"></div> Missing labels</div>
            <div class="damage-item"><div class="check-box"></div> Other</div>
          </div>
          ` : `
          <!-- ── OUTBOUND CHECKLIST ── -->
          <div class="section-title">Outbound Trailer Checklist</div>
          <ul class="checklist">
            <li><div class="check-box"></div> Trailer inspected — clean and free of debris</li>
            <li><div class="check-box"></div> Trailer floor in good condition</li>
            <li><div class="check-box"></div> Trailer walls / ceiling — no damage</li>
            <li><div class="check-box"></div> Trailer doors operate properly</li>
            <li><div class="check-box"></div> Trailer is properly chocked / secured at dock</li>
            <li><div class="check-box"></div> Dock leveler properly positioned</li>
            <li><div class="check-box"></div> Load secured / strapped appropriately</li>
            <li><div class="check-box"></div> Load matches BOL / shipping documents</li>
            <li><div class="check-box"></div> Seal applied and number recorded</li>
            <li><div class="check-box"></div> Driver has all required paperwork</li>
          </ul>

          <div class="section-title">Load Details</div>
          <div class="damage-grid">
            <div class="damage-item"><div class="check-box"></div> Palletized</div>
            <div class="damage-item"><div class="check-box"></div> Floor loaded</div>
            <div class="damage-item"><div class="check-box"></div> Partial load</div>
            <div class="damage-item"><div class="check-box"></div> Full load</div>
            <div class="damage-item"><div class="check-box"></div> Hazmat</div>
            <div class="damage-item"><div class="check-box"></div> Temperature controlled</div>
          </div>

          <div class="section-title">Seal Number</div>
          <div style="border: 1px solid #000; padding: 8px; min-height: 28px; font-size: 14px; font-weight: bold;"></div>
          `}

          <div class="section-title">Notes / Comments</div>
          <div class="notes-area"></div>

          <div class="signature-row">
            <div class="signature-field">Warehouse Associate Signature</div>
            <div class="signature-field">Date / Time</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
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
