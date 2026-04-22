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
    companion_reference?: string | null;
    driver_phone?: string;
    trailer_number?: string;
    trailer_length?: string;
    ship_to_city?: string | null;
    ship_to_state?: string | null;
    check_in_time?: string | null;
    load_type?: 'inbound' | 'outbound';
    notes?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
  isOpen: boolean;
}

interface OrderInfo {
  id: string;
  reference_number: string;
  status: string;
  check_in_time: string;
  appointment_time?: string;
}

interface DockStatus {
  dock_number: string;
  status: 'available' | 'in-use' | 'double-booked' | 'blocked';
  orders: OrderInfo[];
  is_manually_blocked: boolean;
  blocked_reason?: string;
  isRamp?: boolean;
}

const DOCK_ORDER: string[] = [
  ...Array.from({ length: 7 }, (_, i) => (64 + i).toString()),
  ...Array.from({ length: 27 }, (_, i) => (i + 1).toString()),
  'Ramp',
  ...Array.from({ length: 36 }, (_, i) => (i + 28).toString()),
];

export default function AssignDockModal({ checkIn, onClose, onSuccess, isOpen }: AssignDockModalProps) {
  const [dockNumber, setDockNumber] = useState(checkIn.dock_number || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dockStatuses, setDockStatuses] = useState<DockStatus[]>([]);
  const [loadingDocks, setLoadingDocks] = useState(false);
  const [showDoubleBookConfirm, setShowDoubleBookConfirm] = useState(false);
  const [pendingDockNumber, setPendingDockNumber] = useState<string | null>(null);

  const [grossWeight, setGrossWeight] = useState('');
  const [grossWeightTouched, setGrossWeightTouched] = useState(false);

  const [paperRefNumber, setPaperRefNumber] = useState('');
  const [paperRefTouched, setPaperRefTouched] = useState(false);
  const [refMismatch, setRefMismatch] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
    { value: 'LTL', label: 'LTL' },
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

  const formatAppointmentTimeDisplay = (timeStr: string | null | undefined) => {
    if (!timeStr) return null;
    try {
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes), 0);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      if (/^\d{4}$/.test(timeStr)) {
        const hours = parseInt(timeStr.substring(0, 2));
        const minutes = parseInt(timeStr.substring(2, 4));
        const date = new Date();
        date.setHours(hours, minutes, 0);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      const option = appointmentOptions.find(opt => opt.value === timeStr);
      if (option) return option.label;
      const date = new Date(timeStr);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return null;
    }
  };

  const normalizeRef = (val: string) => val.trim().toLowerCase().replace(/\s+/g, '');

  const refNumberMatches =
    paperRefNumber.trim() === '' ||
    normalizeRef(paperRefNumber) === normalizeRef(checkIn.reference_number || '') ||
    (!!checkIn.companion_reference &&
      normalizeRef(paperRefNumber) === normalizeRef(checkIn.companion_reference));

  useEffect(() => {
    if (isOpen) {
      setDockNumber(checkIn.dock_number || '');
      setError(null);
      setGrossWeight('');
      setGrossWeightTouched(false);
      setPaperRefNumber('');
      setPaperRefTouched(false);
      setRefMismatch(false);
      fetchAllDockStatuses();
    }
  }, [isOpen, checkIn]);

  useEffect(() => {
    if (paperRefTouched && paperRefNumber.trim() !== '') {
      setRefMismatch(!refNumberMatches);
    } else {
      setRefMismatch(false);
    }
  }, [paperRefNumber, paperRefTouched, refNumberMatches]);

  const fetchAllDockStatuses = async () => {
    setLoadingDocks(true);
    try {
      const allDocks: DockStatus[] = DOCK_ORDER.map(dockNum => ({
        dock_number: dockNum,
        status: 'available',
        orders: [],
        is_manually_blocked: false,
        blocked_reason: undefined,
        isRamp: dockNum === 'Ramp',
      }));

      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('id, reference_number, status, check_in_time, appointment_time, dock_number')
        .in('status', ['checked_in', 'dock_assigned', 'pending'])
        .not('dock_number', 'is', null)
        .neq('id', checkIn.id);

      const dockMap = new Map<string, OrderInfo[]>();
      checkIns?.forEach(ci => {
        if (ci.dock_number) {
          const existing = dockMap.get(ci.dock_number) || [];
          existing.push({
            id: ci.id,
            reference_number: ci.reference_number || 'N/A',
            status: ci.status,
            check_in_time: ci.check_in_time,
            appointment_time: ci.appointment_time || undefined,
          });
          dockMap.set(ci.dock_number, existing);
        }
      });

      const { data: blockedDocksData } = await supabase
        .from('blocked_docks')
        .select('*');

      const blockedMap = new Map<string, string>();
      blockedDocksData?.forEach(row => {
        blockedMap.set(row.dock_number, row.reason);
      });

      allDocks.forEach(dock => {
        const orders = dockMap.get(dock.dock_number) || [];
        dock.orders = orders;
        if (blockedMap.has(dock.dock_number)) {
          dock.status = 'blocked';
          dock.is_manually_blocked = true;
          dock.blocked_reason = blockedMap.get(dock.dock_number);
        } else if (orders.length > 1) {
          dock.status = 'blocked';
          dock.is_manually_blocked = false;
          dock.blocked_reason = `Double-booked (${orders.length} loads assigned)`;
        } else if (orders.length === 1) {
          dock.status = 'in-use';
        }
      });

      setDockStatuses(allDocks);
    } catch (err) {
      console.error('Error fetching dock statuses:', err);
    } finally {
      setLoadingDocks(false);
    }
  };

  const getDockCardStyle = (dock: DockStatus, isSelected: boolean) => {
    const base = 'relative rounded-lg border-2 p-2 transition-all duration-150 select-none text-left';
    if (dock.status === 'blocked') {
      return `${base} border-gray-400 bg-gray-300 opacity-60 cursor-not-allowed`;
    }
    if (isSelected) {
      return `${base} cursor-pointer border-blue-500 ring-2 ring-blue-400 ring-offset-1 bg-blue-50`;
    }
    switch (dock.status) {
      case 'available':
        return `${base} cursor-pointer border-green-300 bg-green-50 hover:border-green-500 hover:bg-green-100`;
      case 'in-use':
        return `${base} cursor-pointer border-yellow-300 bg-yellow-50 hover:border-yellow-500 hover:bg-yellow-100`;
      case 'double-booked':
        return `${base} border-red-400 bg-red-300 opacity-60 cursor-not-allowed`;
      default:
        return `${base} cursor-pointer border-gray-300 bg-white hover:border-gray-400`;
    }
  };

  const getDockStatusLabel = (status: DockStatus['status']) => {
    switch (status) {
      case 'available':     return { text: 'Available', color: 'text-green-700' };
      case 'in-use':        return { text: 'In Use',    color: 'text-yellow-700' };
      case 'double-booked': return { text: 'Double',    color: 'text-red-700' };
      case 'blocked':       return { text: 'Blocked',   color: 'text-gray-600' };
    }
  };

  const handleDockClick = (dock: DockStatus) => {
    if (dock.status === 'blocked' || dock.status === 'double-booked') return;
    if (dock.status === 'in-use') {
      setPendingDockNumber(dock.dock_number);
      setShowDoubleBookConfirm(true);
      return;
    }
    setDockNumber(dock.dock_number);
  };

  const confirmDoubleBook = () => {
    if (pendingDockNumber) setDockNumber(pendingDockNumber);
    setShowDoubleBookConfirm(false);
    setPendingDockNumber(null);
  };

  const cancelDoubleBook = () => {
    setShowDoubleBookConfirm(false);
    setPendingDockNumber(null);
  };

  const handleAssign = async () => {
    setGrossWeightTouched(true);
    setPaperRefTouched(true);

    if (!dockNumber) {
      setError('Please select a dock');
      return;
    }
    if (!grossWeight || grossWeight.trim() === '') {
      setError('Gross weight is required.');
      return;
    }
    if (!paperRefNumber || paperRefNumber.trim() === '') {
      setError('Please enter the reference number from the paper bill.');
      return;
    }

    const enteredNormalized = normalizeRef(paperRefNumber);
    const primaryMatches = enteredNormalized === normalizeRef(checkIn.reference_number || '');
    const companionMatches =
      !!checkIn.companion_reference &&
      enteredNormalized === normalizeRef(checkIn.companion_reference);

    if (!primaryMatches && !companionMatches) {
      const acceptedRefs = [checkIn.reference_number, checkIn.companion_reference]
        .filter(Boolean)
        .join(' or ');
      setError(
        `❌ Reference number mismatch. The paper bill shows "${paperRefNumber.trim()}" but this check-in is for "${acceptedRefs}". Please verify you have the correct paperwork.`
      );
      return;
    }

    if (dockNumber !== 'Ramp') {
      const { data: blockedCheck } = await supabase
        .from('blocked_docks')
        .select('reason')
        .eq('dock_number', dockNumber)
        .maybeSingle();
      if (blockedCheck) {
        setError(`❌ Dock ${dockNumber} is blocked: "${blockedCheck.reason}". Please select a different dock.`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const assignedDock = dockStatuses.find(d => d.dock_number === dockNumber);
      const isDoubleBooked = assignedDock?.status === 'in-use';

      const { error: updateError } = await supabase
        .from('check_ins')
        .update({
          dock_number: dockNumber,
          status: 'checked_in',
          appointment_time: checkIn.appointment_time,
          gross_weight: grossWeight.trim(),
          is_double_booked: isDoubleBooked,
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dock-assignment-changed', {
            detail: { dockNumber, checkInId: checkIn.id },
          })
        );
      }

      printReceipt();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Assign dock error:', err);
      setError(err?.message || err?.details || JSON.stringify(err) || 'Failed to assign dock');
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
        <title>Driver Check-in Form</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .no-print { display: none; }
            .page-break { page-break-before: always; }
            @page { margin: 0.5in; size: letter; }
          }
          body { font-family: Arial, sans-serif; }
          .receipt-page { padding: 20px; max-width: 420px; margin: 0 auto; }
          .receipt-header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 12px; }
          .receipt-header h1 { margin: 0; font-size: 20px; }
          .section { margin: 8px 0; padding: 6px 0; border-bottom: 1px dashed #bbb; }
          .section:last-child { border-bottom: none; }
          .row { display: flex; justify-content: space-between; font-size: 14px; margin: 6px 0; }
          .label { font-weight: bold; text-transform: uppercase; font-size: 12px; color: #333; }
          .value { text-align: right; }
          .reference-box { background-color: #ffeb3b; padding: 12px; margin: 10px 0 6px; border: 2px solid #000; text-align: center; }
          .reference-box .reference-number { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
          .reference-box .companion-number { font-size: 13px; color: #555; margin-bottom: 4px; }
          .reference-box .dock-number { font-size: 16px; font-weight: bold; }
          .notes-box { background-color: #fff8e1; border: 1px solid #f59e0b; border-radius: 4px; padding: 8px 10px; margin: 8px 0; font-size: 13px; }
          .notes-box .notes-label { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #92400e; margin-bottom: 3px; }
          .notes-box .notes-text { color: #1c1917; line-height: 1.4; }
          .print-button { display: block; margin: 20px auto; padding: 12px 24px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; }
          .inspection-page { font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 10pt; }
          .title { text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 10px; }
          .info-line { margin: 8px 0; font-weight: bold; font-size: 11pt; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border: 1px solid black; padding: 4px 6px; text-align: left; font-size: 9pt; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .checkbox-cell { text-align: center; width: 40px; }
          .signature-line { border-bottom: 1px solid black; display: inline-block; width: 250px; }
          .comment-line { border-bottom: 1px solid black; height: 20px; margin: 3px 0; }
          .checkbox-group { margin: 8px 0; font-size: 9pt; }
          .warning-box { font-weight: bold; margin: 10px 0; line-height: 1.4; font-size: 9pt; }
          .footer { margin-top: 12px; font-size: 9pt; }
          .footer-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
          .spacer-row { height: 20px; }
          .spacer-row-double { height: 40px; }
        </style>
      </head>
      <body>
        <div class="receipt-page">
          <div class="receipt-header">
            <h1>Driver Check-In Form</h1>
          </div>
          <div class="reference-box">
            <div class="reference-number">Reference #: ${checkIn.reference_number || 'N/A'}</div>
            ${checkIn.companion_reference ? `<div class="companion-number">Also: ${checkIn.companion_reference}</div>` : ''}
            <div class="dock-number">ASSIGNED TO: ${dockDisplay}</div>
          </div>
          ${checkIn.notes ? `
          <div class="notes-box">
            <div class="notes-label">📋 Appointment Notes</div>
            <div class="notes-text">${checkIn.notes}</div>
          </div>` : ''}
          <div class="section">
            <div class="row"><span class="label">Driver:</span><span class="value">${checkIn.driver_name || 'N/A'}</span></div>
            <div class="row"><span class="label">Phone#:</span><span class="value">${checkIn.driver_phone || 'N/A'}</span></div>
            <div class="row"><span class="label">Carrier:</span><span class="value">${checkIn.carrier_name || 'N/A'}</span></div>
          </div>
          <div class="section">
            <div class="row"><span class="label">Trailer #:</span><span class="value">${checkIn.trailer_number || 'N/A'}</span></div>
            <div class="row"><span class="label">Trailer Length:</span><span class="value">${checkIn.trailer_length || 'N/A'}</span></div>
          </div>
          <div class="section">
            <div class="row"><span class="label">Destination:</span><span class="value">${checkIn.ship_to_city || ''} ${checkIn.ship_to_state || ''}</span></div>
            <div class="row"><span class="label">Appointment:</span><span class="value">${checkIn.appointment_time ? formatAppointmentTime(checkIn.appointment_time) : 'N/A'}</span></div>
            <div class="row"><span class="label">Check-in Time:</span><span class="value">${formatCheckInTime(checkIn.check_in_time)}</span></div>
          </div>
          <button class="print-button no-print" onclick="window.print()">Print Form</button>
        </div>
        <div class="page-break"></div>
        ${isInbound ? getInboundInspectionForm() : getOutboundInspectionForm()}
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 250); };
        </script>
      </body>
    </html>
  `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();

    function getInboundInspectionForm() {
      return `
        <div class="inspection-page">
          <div class="title">PRP02A: INBOUND INSPECTION</div>
          <div class="info-line">
            Date: <strong>${today}</strong>&nbsp;&nbsp;&nbsp;
            Delivery#: <strong>${checkIn.reference_number || 'N/A'}</strong>&nbsp;&nbsp;&nbsp;
            Trailer#: <strong>${checkIn.trailer_number || 'N/A'}</strong>
          </div>
          <div class="spacer-row"></div>
          <table>
            <thead><tr><th>INSPECTION ITEM</th><th class="checkbox-cell">YES</th><th class="checkbox-cell">NO</th><th class="checkbox-cell">N/A</th></tr></thead>
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
          <div class="spacer-row-double"></div>
          <div class="spacer-row-double"></div>
          <div class="spacer-row-double"></div>
          <table style="font-size: 7pt; margin-top: 10px;">
            <thead><tr><th style="width:10%;">Rev #</th><th style="width:40%;">Summary of Changes</th><th style="width:17%;">Requested By</th><th style="width:18%;">Authorized By</th><th style="width:15%;">Date Updated</th></tr></thead>
            <tbody>
              <tr><td>Original</td><td></td><td>Quality Manager</td><td>Operations Manager</td><td>10/28/2015</td></tr>
              <tr><td>2</td><td>Changed question 9.</td><td>Quality Manager</td><td>Operations Manager</td><td>10/30/2017</td></tr>
              <tr><td>3</td><td>Updated questions</td><td>Quality Manager</td><td>Operations Manager</td><td>09/19/2018</td></tr>
              <tr><td>4</td><td>Updated question 4 to add pallet inspection.</td><td>Quality Manager</td><td>Operations Manager</td><td>03/10/2026</td></tr>
            </tbody>
          </table>
          <div class="footer">
            <div class="footer-row">
              <span><strong>PRP02A</strong> Inbound Inspection</span>
              <span><strong>Owned By:</strong> Quality Manager</span>
              <span><strong>Authorized By:</strong> Operations Manager</span>
            </div>
          </div>
        </div>`;
    }

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
            <thead><tr><th>GENERAL TRAILER GMP</th><th class="checkbox-cell">YES</th><th class="checkbox-cell">NO</th></tr></thead>
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
            <thead><tr><th>PRODUCT SECURITY & LOADER SAFETY</th><th class="checkbox-cell">YES</th><th class="checkbox-cell">NO</th></tr></thead>
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
              ☐ OK TO LOAD AFTER SWEEPING &nbsp;
              ☐ Needs new trailer &nbsp;
              ☐ Driver can correct trailer
            </div>
          </div>
          <div class="spacer-row"></div>
          <table>
            <thead><tr><th>PRE-SEALING CHECKLIST</th><th class="checkbox-cell">INITIAL</th></tr></thead>
            <tbody>
              <tr><td>ALL THE INSTRUCTIONS ON THE BILL OF LADING HAVE BEEN FOLLOWED?</td><td class="checkbox-cell">☐</td></tr>
              <tr><td>TRAILER HAS BEEN LATCHED PROPERLY?</td><td class="checkbox-cell">☐</td></tr>
              <tr><td>THE TRAILER HAS BEEN SEALED?</td><td class="checkbox-cell">☐</td></tr>
              <tr><td>CUSTOMER REQUIRED PHOTOS TAKEN AND SENT?</td><td class="checkbox-cell">☐</td></tr>
              <tr><td>INITIALS OF PERSON THAT SEALED</td><td class="checkbox-cell">__________</td></tr>
            </tbody>
          </table>
          <div class="spacer-row-double"></div>
          <table style="font-size: 7pt; margin-top: 10px;">
            <thead><tr><th style="width:10%;">Rev #</th><th style="width:40%;">Summary of Changes</th><th style="width:17%;">Requested By</th><th style="width:18%;">Authorized By</th><th style="width:15%;">Date Updated</th></tr></thead>
            <tbody>
              <tr><td>Original</td><td>Outbound Inspection - Restructured</td><td>Quality Manager</td><td>Operations Manager</td><td>7/24/2025</td></tr>
              <tr><td>2</td><td>Added loadbar question</td><td>Quality Manager</td><td>Operations Manager</td><td>7/31/2025</td></tr>
              <tr><td>3</td><td>Updated format and added revisions table.</td><td>Quality Manager</td><td>Operations Manager</td><td>3/10/2026</td></tr>
            </tbody>
          </table>
          <div class="footer">
            <div class="footer-row">
              <span><strong>PRP03A</strong> Outbound Inspection</span>
              <span><strong>Owned By:</strong> Quality Manager</span>
              <span><strong>Authorized By:</strong> Operations Manager</span>
            </div>
          </div>
        </div>`;
    }
  };

  if (!isOpen) return null;

  const selectedDockData = dockStatuses.find(d => d.dock_number === dockNumber);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assign Dock</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {checkIn.driver_name} — {checkIn.reference_number || 'No Ref #'}
              {checkIn.companion_reference && (
                <span className="text-gray-400"> / {checkIn.companion_reference}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Appointment Notes banner — shown when notes exist */}
          {checkIn.notes && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg">
              <span className="text-amber-500 text-lg shrink-0">📋</span>
              <div>
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Appointment Notes</p>
                <p className="text-sm text-amber-900">{checkIn.notes}</p>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs font-medium text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-50 border border-green-300 inline-block" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-yellow-50 border border-yellow-300 inline-block" />
              In Use
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-50 border border-red-400 inline-block" />
              Double Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-400 inline-block" />
              Blocked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-50 border-2 border-blue-500 inline-block" />
              Selected
            </span>
          </div>

          {/* Dock Grid */}
          {loadingDocks ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-500 text-sm">Loading docks...</span>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {dockStatuses.map(dock => {
                const isSelected = dockNumber === dock.dock_number;
                const label = getDockStatusLabel(dock.status);
                const firstOrder = dock.orders[0];
                return (
                  <button
                    key={dock.dock_number}
                    type="button"
                    onClick={() => handleDockClick(dock)}
                    className={getDockCardStyle(dock, isSelected)}
                    title={
                      dock.status === 'blocked'
                        ? `Blocked: ${dock.blocked_reason}`
                        : dock.orders.length > 0
                        ? dock.orders.map(o => o.reference_number).join(', ')
                        : 'Available'
                    }
                  >
                    <div className={`text-center font-bold text-sm leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                      {dock.isRamp ? 'Ramp' : dock.dock_number}
                    </div>
                    <div className={`text-center text-[10px] font-medium leading-tight mt-0.5 ${label.color}`}>
                      {label.text}
                    </div>
                    {firstOrder && dock.status !== 'blocked' && (
                      <div className="mt-1 space-y-0.5">
                        <div className="text-[9px] text-gray-600 truncate text-center font-medium">
                          {firstOrder.reference_number}
                        </div>
                        {firstOrder.check_in_time && (
                          <div className="text-[9px] text-gray-500 text-center">
                            In: {formatCheckInTime(firstOrder.check_in_time)}
                          </div>
                        )}
                        {firstOrder.appointment_time && (
                          <div className="text-[9px] text-gray-500 text-center">
                            Appt: {formatAppointmentTimeDisplay(firstOrder.appointment_time)}
                          </div>
                        )}
                      </div>
                    )}
                    {dock.status === 'double-booked' && dock.orders.length > 1 && (
                      <div className="mt-0.5 text-[9px] text-red-600 text-center font-medium">
                        +{dock.orders.length - 1} more
                      </div>
                    )}
                    {dock.status === 'blocked' && dock.blocked_reason && (
                      <div className="mt-1 text-[9px] text-gray-500 text-center truncate">
                        {dock.blocked_reason}
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected dock status banner */}
          {dockNumber && selectedDockData && (
            <div className={`rounded-lg p-3 border text-sm ${
              selectedDockData.status === 'blocked'
                ? 'bg-gray-100 border-gray-300 text-gray-700'
                : selectedDockData.status === 'in-use' || selectedDockData.status === 'double-booked'
                ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
                : 'bg-green-50 border-green-300 text-green-800'
            }`}>
              {selectedDockData.status === 'blocked' ? (
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none">🚫</span>
                  <div>
                    <p className="font-semibold">Dock {dockNumber} is blocked</p>
                    {selectedDockData.blocked_reason && (
                      <p className="text-xs mt-0.5">Reason: {selectedDockData.blocked_reason}</p>
                    )}
                  </div>
                </div>
              ) : selectedDockData.status === 'in-use' || selectedDockData.status === 'double-booked' ? (
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none">⚠️</span>
                  <div>
                    <p className="font-semibold">Dock {dockNumber} is currently occupied</p>
                    <ul className="text-xs mt-1 space-y-0.5">
                      {selectedDockData.orders.map((o, i) => (
                        <li key={i}>
                          • Order {o.reference_number} — In: {formatCheckInTime(o.check_in_time)}
                          {o.appointment_time ? ` | Appt: ${formatAppointmentTimeDisplay(o.appointment_time)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">✅</span>
                  <p className="font-semibold">Dock {dockNumber} is available</p>
                </div>
              )}
            </div>
          )}

          {!dockNumber && (
            <div className="rounded-lg p-3 border border-blue-200 bg-blue-50 text-sm text-blue-700">
              👆 Click a dock above to select it
            </div>
          )}

          {/* Verification & Weight Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="paperRefNumber" className="block text-sm font-medium text-gray-700">
                Reference # from Paper Bill <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1">
                Enter the ref # exactly as shown on the physical bill
              </p>
              <div className="relative">
                <input
                  id="paperRefNumber"
                  type="text"
                  value={paperRefNumber}
                  onChange={(e) => setPaperRefNumber(e.target.value)}
                  onBlur={() => setPaperRefTouched(true)}
                  placeholder="."
                  autoComplete="off"
                  className={`block w-full rounded-md border px-3 py-2 pr-9 shadow-sm focus:outline-none focus:ring-2 sm:text-sm ${
                    paperRefTouched && paperRefNumber.trim() !== ''
                      ? refMismatch
                        ? 'border-red-400 focus:ring-red-400 bg-red-50'
                        : 'border-green-400 focus:ring-green-400 bg-green-50'
                      : paperRefTouched && paperRefNumber.trim() === ''
                      ? 'border-red-300 focus:ring-red-300'
                      : 'border-gray-300 focus:ring-blue-500'
                  }`}
                />
                {paperRefTouched && paperRefNumber.trim() !== '' && (
                  <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                    {refMismatch ? (
                      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
              {paperRefTouched && paperRefNumber.trim() === '' && (
                <p className="mt-1 text-xs text-red-500">Reference number is required.</p>
              )}
              {paperRefTouched && paperRefNumber.trim() !== '' && refMismatch && (
                <p className="mt-1 text-xs text-red-600 font-medium">❌ Does not match. Check your paperwork.</p>
              )}
              {paperRefTouched && paperRefNumber.trim() !== '' && !refMismatch && (
                <p className="mt-1 text-xs text-green-600 font-medium">✅ Reference number verified.</p>
              )}
            </div>

            <div>
              <label htmlFor="grossWeight" className="block text-sm font-medium text-gray-700">
                Gross Weight <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1">Enter weight in lbs from the scale ticket</p>
              <input
                id="grossWeight"
                type="number"
                value={grossWeight}
                onChange={(e) => setGrossWeight(e.target.value)}
                onBlur={() => setGrossWeightTouched(true)}
                required
                placeholder="e.g. 42500"
                className={`block w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
                  grossWeightTouched && !grossWeight ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {grossWeightTouched && !grossWeight && (
                <p className="mt-1 text-xs text-red-500">Gross weight is required.</p>
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={loading || !dockNumber || !grossWeight || !paperRefNumber || refMismatch}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Assigning...
              </>
            ) : (
              <>Assign {dockNumber ? (dockNumber === 'Ramp' ? 'Ramp' : `Dock ${dockNumber}`) : 'Dock'}</>
            )}
          </button>
        </div>
      </div>

      {/* Double-Book Confirmation Dialog */}
      {showDoubleBookConfirm && pendingDockNumber && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Double-Book</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Dock {pendingDockNumber}</strong> is currently in use.
            </p>
            {(() => {
              const dock = dockStatuses.find(d => d.dock_number === pendingDockNumber);
              if (dock && dock.orders.length > 0) {
                return (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    <p className="text-xs font-medium text-yellow-800 mb-1">Current assignment(s):</p>
                    {dock.orders.map((order, idx) => (
                      <p key={idx} className="text-xs text-yellow-700">• Ref: {order.reference_number}</p>
                    ))}
                  </div>
                );
              }
              return null;
            })()}
            <p className="text-sm text-gray-600 mb-6">
              Assigning a second load will <strong>double-book</strong> this dock and it will become{' '}
              <strong className="text-red-600">blocked</strong> for further assignments. Do you want to proceed?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDoubleBook}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDoubleBook}
                className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Yes, Double-Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
