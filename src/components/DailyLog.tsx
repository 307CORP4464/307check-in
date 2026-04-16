'use client';
import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';
import StatusChangeModal from './StatusChangeModal';
import EditCheckInModal from './EditCheckInModal';
import Header from './Header';
import { matchAppointmentToCheckIn } from '@/lib/appointmentMatcher';
import PaidReceiptModal from './PaidReceiptModal';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string, includeDate: boolean = false): string => {
  try {
    if (!isoString || isoString === '' || isoString === 'null' || isoString === 'undefined') {
      return 'No Check-in Time';
    }
    const date = new Date(isoString);
    if (isNaN(date.getTime()) || date.getTime() < 0) return 'Invalid Date';
    if (date.getFullYear() < 2000) return 'Invalid Date';
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    if (includeDate) {
      options.year = 'numeric';
      options.month = '2-digit';
      options.day = '2-digit';
    }
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch {
    return 'Error';
  }
};

const formatPhoneNumber = (phone: string | undefined): string => {
  if (!phone) return 'N/A';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)})-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

const formatAppointmentTime = (appointmentTime: string | null | undefined): string => {
  if (!appointmentTime) return 'N/A';
  if (appointmentTime === 'work_in') return 'Work In';
  const specialTypeLabels: Record<string, string> = { LTL: 'LTL', Paid: 'Paid', Charge: 'Charge' };
  if (specialTypeLabels[appointmentTime] !== undefined) return specialTypeLabels[appointmentTime];
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    return `${appointmentTime.substring(0, 2)}:${appointmentTime.substring(2, 4)}`;
  }
  return appointmentTime;
};

const formatAppointmentDateTime = (
  appointmentDate: string | null | undefined,
  appointmentTime: string | null | undefined
): string => {
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') return 'Work In';
    try {
      let date: Date;
      if (appointmentDate.includes('/')) {
        const [month, day, year] = appointmentDate.split('/').map(Number);
        date = new Date(year, month - 1, day);
      } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = appointmentDate.split('-').map(Number);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(appointmentDate);
      }
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}, Work In`;
      }
    } catch {
      // fall through
    }
    return 'Work In';
  }

  const specialTypeLabels: Record<string, string> = { LTL: 'LTL', Paid: 'Paid', Charge: 'Charge' };
  if (appointmentTime && specialTypeLabels[appointmentTime]) {
    const label = specialTypeLabels[appointmentTime];
    if (appointmentDate && appointmentDate !== 'null' && appointmentDate !== 'undefined') {
      try {
        let date: Date;
        if (appointmentDate.includes('/')) {
          const [month, day, year] = appointmentDate.split('/').map(Number);
          date = new Date(year, month - 1, day);
        } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = appointmentDate.split('-').map(Number);
          date = new Date(year, month - 1, day);
        } else {
          date = new Date(appointmentDate);
        }
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
          return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}, ${label}`;
        }
      } catch {
        // fall through
      }
    }
    return label;
  }

  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') return 'N/A';

  try {
    let formattedDate = '';
    if (appointmentDate && appointmentDate !== 'null' && appointmentDate !== 'undefined') {
      let date: Date;
      if (appointmentDate.includes('/')) {
        const [month, day, year] = appointmentDate.split('/').map(Number);
        date = new Date(year, month - 1, day);
      } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = appointmentDate.split('-').map(Number);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(appointmentDate);
      }
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2000) {
        formattedDate = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
      }
    }
    const formattedTime = formatAppointmentTime(appointmentTime);
    if (!formattedDate) return formattedTime !== 'N/A' ? formattedTime : 'N/A';
    if (formattedDate && formattedTime && formattedTime !== 'N/A') return `${formattedDate}, ${formattedTime}`;
    if (formattedDate) return formattedDate;
    return 'N/A';
  } catch {
    const formattedTime = formatAppointmentTime(appointmentTime);
    return formattedTime !== 'N/A' ? formattedTime : 'N/A';
  }
};

const getDateComponentsInIndianapolis = (isoString: string): { year: number; month: number; day: number; hour: number; minute: number } => {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '0'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
  };
};

const getAppointmentStatus = (
  checkInTime: string,
  appointmentTime: string | null | undefined,
  appointmentDate: string | null | undefined
): { color: 'green' | 'orange' | 'red' | 'yellow' | 'none'; message: string | null } => {
  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return { color: 'red', message: null };
  }
  if (appointmentTime === 'LTL' || appointmentTime === 'Charge' || appointmentTime === 'Paid') {
    return { color: 'orange', message: null };
  }
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { color: 'yellow', message: null };
  }
  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) return { color: 'red', message: null };

  try {
    const checkInComponents = getDateComponentsInIndianapolis(checkInTime);
    let checkInHour = checkInComponents.hour;
    if (checkInHour === 24) checkInHour = 0;
    const aptHour = parseInt(normalizedTime.substring(0, 2));
    const aptMinute = parseInt(normalizedTime.substring(2, 4));
    const diffMinutes = (checkInHour * 60 + checkInComponents.minute) - (aptHour * 60 + aptMinute);
    return diffMinutes <= 0 ? { color: 'green', message: null } : { color: 'yellow', message: null };
  } catch {
    return { color: 'red', message: null };
  }
};

const parseReferenceNumbers = (referenceNumber: string | undefined): string[] => {
  if (!referenceNumber) return [];
  return referenceNumber.split(/[,;\s|]+/).map(ref => ref.trim()).filter(ref => ref.length > 0);
};

const stripLeadingZeros = (value: string): string =>
  /^\d+$/.test(value) ? value.replace(/^0+/, '') || '0' : value;

const expandRefsWithNormalized = (refs: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!seen.has(ref)) { result.push(ref); seen.add(ref); }
    const stripped = stripLeadingZeros(ref);
    if (stripped !== ref && !seen.has(stripped)) { result.push(stripped); seen.add(stripped); }
  }
  return result;
};

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
  companion_reference?: string | null;
  dock_number?: string;
  appointment_time?: string | null;
  appointment_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  notes?: string;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  carrier?: string | null;
  mode?: string | null;
  requested_ship_date?: string | null;
  customer?: string;
  status_note?: string | null;
  denial_reason?: string | null;
  rejection_reasons?: string[] | null;
  resolution_action?: string | null;
}

const calculateDetention = (
  checkInTime: string,
  checkOutTime: string | null | undefined,
  appointmentTime: string | null | undefined,
  appointmentDate: string | null | undefined
): { hasDetention: boolean; detentionDuration: string | null } => {
  if (!checkOutTime) return { hasDetention: false, detentionDuration: null };
  if (!appointmentTime || appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { hasDetention: false, detentionDuration: null };
  }
  const status = getAppointmentStatus(checkInTime, appointmentTime, appointmentDate);
  if (status.color !== 'green') return { hasDetention: false, detentionDuration: null };

  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) return { hasDetention: false, detentionDuration: null };
  if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
    return { hasDetention: false, detentionDuration: null };
  }

  try {
    let aptYear: number, aptMonth: number, aptDay: number;
    if (appointmentDate.includes('/')) {
      [aptMonth, aptDay, aptYear] = appointmentDate.split('/').map(Number);
    } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      [aptYear, aptMonth, aptDay] = appointmentDate.substring(0, 10).split('-').map(Number);
    } else {
      return { hasDetention: false, detentionDuration: null };
    }

    const appointmentHour = parseInt(normalizedTime.substring(0, 2));
    const appointmentMinute = parseInt(normalizedTime.substring(2, 4));
    const aptLocalString = `${aptYear}-${String(aptMonth).padStart(2, '0')}-${String(aptDay).padStart(2, '0')}T${String(appointmentHour).padStart(2, '0')}:${String(appointmentMinute).padStart(2, '0')}:00`;
    const appointmentUTC = zonedTimeToUtc(aptLocalString, TIMEZONE);
    const detentionStartUTC = new Date(appointmentUTC.getTime() + 2 * 60 * 60 * 1000);
    const checkOutUTC = new Date(checkOutTime);

    if (isNaN(detentionStartUTC.getTime()) || isNaN(checkOutUTC.getTime())) {
      return { hasDetention: false, detentionDuration: null };
    }

    const diffMinutes = Math.floor((checkOutUTC.getTime() - detentionStartUTC.getTime()) / (1000 * 60));
    if (diffMinutes <= 0) return { hasDetention: false, detentionDuration: null };

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    const detentionDuration =
      hours > 0 && minutes > 0 ? `${hours}h ${minutes}m` :
      hours > 0 ? `${hours}h` : `${minutes}m`;

    return { hasDetention: true, detentionDuration };
  } catch {
    return { hasDetention: false, detentionDuration: null };
  }
};

// ── Status Detail Popover ──────────────────────────────────────────────────────
interface StatusDetailPopoverProps {
  checkIn: CheckIn;
  onClose: () => void;
}

function StatusDetailPopover({ checkIn, onClose }: StatusDetailPopoverProps) {
  const status = checkIn.status;
  const hasDetails =
    checkIn.status_note ||
    checkIn.denial_reason ||
    (checkIn.rejection_reasons && checkIn.rejection_reasons.length > 0) ||
    checkIn.resolution_action;

  const resolutionLabel =
    checkIn.resolution_action === 'correct_and_return'
      ? 'Correct the issue and return for re-inspection.'
      : checkIn.resolution_action === 'new_trailer'
      ? 'Return with a new trailer.'
      : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Status Details</h3>
            {checkIn.reference_number && (
              <p className="text-xs text-gray-500 mt-0.5">Ref: {checkIn.reference_number}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!hasDetails && (
          <p className="text-sm text-gray-500 italic">No additional details recorded for this status.</p>
        )}

        {(status === 'turned_away' || status === 'check_in_denial') && checkIn.denial_reason && (
          <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-1">
              {status === 'check_in_denial' ? 'Reason Denied' : 'Reason Turned Away'}
            </p>
            <p className="text-sm text-orange-900">{checkIn.denial_reason}</p>
          </div>
        )}

        {status === 'rejected' && checkIn.rejection_reasons && checkIn.rejection_reasons.length > 0 && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Rejection Reason(s)</p>
            <ol className="space-y-1">
              {checkIn.rejection_reasons.map((reason, i) => (
                <li key={i} className="flex gap-2 text-sm text-red-900">
                  <span className="font-bold text-red-500 shrink-0">{i + 1}.</span>
                  {reason}
                </li>
              ))}
            </ol>
          </div>
        )}

        {status === 'rejected' && resolutionLabel && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Required Action</p>
            <p className="text-sm text-amber-900">{resolutionLabel}</p>
          </div>
        )}

        {checkIn.status_note && (
          <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-800">{checkIn.status_note}</p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reprint receipt ────────────────────────────────────────────────────────────
const reprintReceipt = (checkIn: CheckIn) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print the receipt');
    return;
  }

  const appointmentOptions = [
    { value: '0800', label: '08:00 AM' }, { value: '0900', label: '09:00 AM' },
    { value: '0930', label: '09:30 AM' }, { value: '1000', label: '10:00 AM' },
    { value: '1030', label: '10:30 AM' }, { value: '1100', label: '11:00 AM' },
    { value: '1230', label: '12:30 PM' }, { value: '1300', label: '01:00 PM' },
    { value: '1330', label: '01:30 PM' }, { value: '1400', label: '02:00 PM' },
    { value: '1430', label: '02:30 PM' }, { value: '1500', label: '03:00 PM' },
    { value: '1550', label: '03:30 PM' }, { value: 'work_in', label: 'Work In' },
    { value: 'paid_to_load', label: 'Paid to Load' },
    { value: 'paid_charge_customer', label: 'Paid - Charge Customer' },
    { value: 'LTL', label: 'LTL' },
  ];

  const formatApptTime = (time: string) => {
    const option = appointmentOptions.find(opt => opt.value === time);
    return option ? option.label : time;
  };

  const formatCheckInTime = (t?: string | null) => {
    if (!t) return '';
    try {
      return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return t;
    }
  };

  const today = new Date().toLocaleDateString();
  const dockDisplay = checkIn.dock_number === 'Ramp' ? 'Ramp' : checkIn.dock_number ? `Dock ${checkIn.dock_number}` : 'Not Assigned';
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
          .reference-box .dock-number { font-size: 16px; font-weight: bold; }
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
            <div class="dock-number">ASSIGNED TO: ${dockDisplay}</div>
          </div>
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
            <div class="row"><span class="label">Appointment:</span><span class="value">${checkIn.appointment_time ? formatApptTime(checkIn.appointment_time) : 'N/A'}</span></div>
            <div class="row"><span class="label">Check-in Time:</span><span class="value">${formatCheckInTime(checkIn.check_in_time)}</span></div>
          </div>
          <button class="print-button no-print" onclick="window.print()">Print Form</button>
        </div>
        <div class="page-break"></div>
        ${isInbound ? getInboundInspectionForm() : getOutboundInspectionForm()}
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
      </body>
    </html>
  `;

  function getInboundInspectionForm() {
    return `
      <div class="inspection-page">
        <div class="title">PRP02A: INBOUND INSPECTION</div>
        <div class="info-line">Date: <strong>${today}</strong>&nbsp;&nbsp;&nbsp;Delivery#: <strong>${checkIn.reference_number || 'N/A'}</strong>&nbsp;&nbsp;&nbsp;Trailer#: <strong>${checkIn.trailer_number || 'N/A'}</strong></div>
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
        <div class="warning-box">IF ANY OF THE ABOVE QUESTIONS WERE ANSWERED "NO" PLEASE ENSURE CORRECTIVE ACTION IS TAKEN AND/OR NOTIFY A SUPERVISOR.<br>IF ANY PRODUCT IS QUESTIONABLE TO RECEIVE INTO THE WAREHOUSE, CONTACT A SUPERVISOR FOR APPROVAL.</div>
        <div style="margin: 10px 0;"><strong>I ACKNOWLEDGE THAT ALL ITEMS LISTED ABOVE HAVE BEEN EXECUTED.</strong><br><div class="spacer-row"></div><strong>OPERATOR SIGNATURE:</strong> <span class="signature-line"></span></div>
        <div style="margin: 8px 0;"><strong>COMMENTS:</strong><div class="comment-line"></div><div class="comment-line"></div></div>
        <div class="spacer-row-double"></div><div class="spacer-row-double"></div><div class="spacer-row-double"></div>
        <table style="font-size: 7pt; margin-top: 10px;">
          <thead><tr><th style="width:10%;">Rev #</th><th style="width:40%;">Summary of Changes</th><th style="width:17%;">Requested By</th><th style="width:18%;">Authorized By</th><th style="width:15%;">Date Updated</th></tr></thead>
          <tbody>
            <tr><td>Original</td><td></td><td>Quality Manager</td><td>Operations Manager</td><td>10/28/2015</td></tr>
            <tr><td>2</td><td>Changed question 9.</td><td>Quality Manager</td><td>Operations Manager</td><td>10/30/2017</td></tr>
            <tr><td>3</td><td>Updated questions</td><td>Quality Manager</td><td>Operations Manager</td><td>09/19/2018</td></tr>
            <tr><td>4</td><td>Updated question 4 to add pallet inspection.</td><td>Quality Manager</td><td>Operations Manager</td><td>03/10/2026</td></tr>
          </tbody>
        </table>
        <div class="footer"><div class="footer-row"><span><strong>PRP02A</strong> Inbound Inspection</span><span><strong>Owned By:</strong> Quality Manager</span><span><strong>Authorized By:</strong> Operations Manager</span></div></div>
      </div>`;
  }

  function getOutboundInspectionForm() {
    return `
      <div class="inspection-page">
        <div class="title">PRP03A: OUTBOUND INSPECTION</div>
        <div class="info-line">Date: <strong>${today}</strong>&nbsp;&nbsp;&nbsp;Load#: <strong>${checkIn.reference_number || 'N/A'}</strong>&nbsp;&nbsp;&nbsp;Trailer#: <strong>${checkIn.trailer_number || 'N/A'}</strong></div>
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
        <div style="margin: 8px 0;"><strong>LOADER SIGNATURE:</strong> <span class="signature-line"></span></div>
        <div style="margin: 8px 0;"><strong>COMMENTS:</strong><div class="comment-line"></div><div class="comment-line"></div></div>
        <div class="checkbox-group">
          <div>Rejected by: <span class="signature-line"></span></div>
          <div style="margin-top: 5px;">☐ OK TO LOAD AFTER SWEEPING &nbsp;☐ Needs new trailer &nbsp;☐ Driver can correct trailer</div>
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
        <div class="footer"><div class="footer-row"><span><strong>PRP03A</strong> Outbound Inspection</span><span><strong>Owned By:</strong> Quality Manager</span><span><strong>Authorized By:</strong> Operations Manager</span></div></div>
      </div>`;
  }

  printWindow.document.write(receiptHTML);
  printWindow.document.close();
};

export default function DailyLog() {
  const router = useRouter();

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showInProgressOnly, setShowInProgressOnly] = useState(false);
  const [statusDetailCheckIn, setStatusDetailCheckIn] = useState<CheckIn | null>(null);
  const [denialsExpanded, setDenialsExpanded] = useState(false);
  const [selectedForPaidReceipt, setSelectedForPaidReceipt] = useState<CheckIn | null>(null);

  // ── Detention warning state ────────────────────────────────────────────────
  const [detentionWarnings, setDetentionWarnings] = useState<
    { id: string; referenceNumber: string; dockNumber: string | null; minutesUntilDetention: number }[]
  >([]);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  const getCurrentDateInIndianapolis = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateInIndianapolis());
  const [selectedForStatusChange, setSelectedForStatusChange] = useState<CheckIn | null>(null);
  const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);

  const MANUAL_APPOINTMENT_TYPES = ['LTL', 'Paid', 'Charge', 'work_in'];

  // ── Date navigation helpers ────────────────────────────────────────────────
  const changeDateByDays = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    const ny = date.getFullYear();
    const nm = String(date.getMonth() + 1).padStart(2, '0');
    const nd = String(date.getDate()).padStart(2, '0');
    setSelectedDate(`${ny}-${nm}-${nd}`);
  };

  const fetchCheckInsForDate = useCallback(async () => {
    try {
      setLoading(true);

      const startOfDayIndy = zonedTimeToUtc(`${selectedDate} 00:00:00`, TIMEZONE);
      const endOfDayIndy = zonedTimeToUtc(`${selectedDate} 23:59:59`, TIMEZONE);

      const { data: checkInsData, error: checkInsError } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', startOfDayIndy.toISOString())
        .lte('check_in_time', endOfDayIndy.toISOString())
        .order('check_in_time', { ascending: false });

      if (checkInsError) throw checkInsError;

      const rawReferenceNumbers = Array.from(new Set(
        (checkInsData || [])
          .flatMap(ci => parseReferenceNumbers(ci.reference_number))
          .filter(ref => ref.trim() !== '')
      ));
      const allReferenceNumbers = expandRefsWithNormalized(rawReferenceNumbers);

      let allDateAppointments: any[] = [];

      if (allReferenceNumbers.length > 0) {
        const BATCH_SIZE = 20;
        for (let i = 0; i < allReferenceNumbers.length; i += BATCH_SIZE) {
          const batch = allReferenceNumbers.slice(i, i + BATCH_SIZE);
          const orFilter = batch
            .flatMap(ref => [`sales_order.ilike.%${ref}%`, `delivery.ilike.%${ref}%`])
            .join(',');

          const { data: appointmentsData, error: appointmentsError } = await supabase
            .from('appointments')
            .select('sales_order, delivery, appointment_time, appointment_date, customer, requested_ship_date, carrier, mode, ship_to_city, ship_to_state')
            .or(orFilter)
            .eq('appointment_date', selectedDate);

          if (appointmentsError) {
            console.error('Appointments error:', appointmentsError);
            continue;
          }
          if (appointmentsData) {
            allDateAppointments = allDateAppointments.concat(appointmentsData);
          }
        }

        const seen = new Set<string>();
        allDateAppointments = allDateAppointments.filter(apt => {
          const key = `${apt.sales_order ?? ''}||${apt.delivery ?? ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      const enrichedCheckIns = (checkInsData || []).map(checkIn => {
        const refs = parseReferenceNumbers(checkIn.reference_number);
        const expandedRefs = expandRefsWithNormalized(refs);
        const appointmentInfo = matchAppointmentToCheckIn(expandedRefs, allDateAppointments);
        const checkInHasManualType = checkIn.appointment_time &&
          MANUAL_APPOINTMENT_TYPES.includes(checkIn.appointment_time);

      // ── Derive companion reference ─────────────────────────────────────
let companionReference: string | null = checkIn.companion_reference ?? null;
if (!companionReference) {
  const matchedApt = allDateAppointments.find((apt: any) => {
    const soMatch = apt.sales_order && expandedRefs.some((r: string) =>
      apt.sales_order.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(apt.sales_order.toLowerCase())
    );
    const delMatch = apt.delivery && expandedRefs.some((r: string) =>
      apt.delivery.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(apt.delivery.toLowerCase())
    );
    return soMatch || delMatch;
  });

  if (matchedApt?.sales_order && matchedApt?.delivery) {
    const primaryLower = (checkIn.reference_number || '').toLowerCase();
    const soLower = matchedApt.sales_order.toLowerCase();
    if (primaryLower.includes(soLower) || soLower.includes(primaryLower)) {
      companionReference = matchedApt.delivery;
    } else {
      companionReference = matchedApt.sales_order;
    }
  }

  if (companionReference) {
    supabase
      .from('check_ins')
      .update({ companion_reference: companionReference })
      .eq('id', checkIn.id)
      .is('companion_reference', null)
      .then(() => {});
  }
}

        return {
          ...checkIn,
          companion_reference: companionReference,
          appointment_time: appointmentInfo?.time ?? (checkInHasManualType ? checkIn.appointment_time : null),
          appointment_date: appointmentInfo?.date ?? (checkInHasManualType ? checkIn.appointment_date : null),
          customer: appointmentInfo?.customer ?? checkIn.customer ?? null,
          ship_to_city: appointmentInfo?.ship_to_city ?? checkIn.ship_to_city ?? null,
          ship_to_state: appointmentInfo?.ship_to_state ?? checkIn.ship_to_state ?? null,
          carrier: appointmentInfo?.carrier ?? checkIn.carrier ?? null,
          mode: appointmentInfo?.mode ?? checkIn.mode ?? null,
          requested_ship_date: appointmentInfo?.requested_ship_date ?? checkIn.requested_ship_date ?? null,
        };
      });

      setCheckIns(enrichedCheckIns);
    } catch (err) {
      console.error('fetchCheckInsForDate error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchCheckInsForDate();

    const channel = supabase
      .channel(`daily_log_realtime_${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, () => {
        fetchCheckInsForDate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchCheckInsForDate();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, fetchCheckInsForDate]);

  // ── Approaching-detention checker ──────────────────────────────────────────
  const checkApproachingDetention = useCallback(() => {
    const now = new Date();
    const warnings: { id: string; referenceNumber: string; dockNumber: string | null; minutesUntilDetention: number }[] = [];

    checkIns.forEach((checkIn) => {
      if (checkIn.end_time) return;
      if (checkIn.status === 'denied') return;
      if (!checkIn.appointment_time || !checkIn.appointment_date) return;

      const status = getAppointmentStatus(
        checkIn.check_in_time,
        checkIn.appointment_time,
        checkIn.appointment_date
      );
      if (status.color !== 'green') return;

      const normalizedTime = checkIn.appointment_time.replace(/:/g, '').trim();
      if (!normalizedTime.match(/^\d{4}$/)) return;

      try {
        let aptYear: number, aptMonth: number, aptDay: number;
        if (checkIn.appointment_date.includes('/')) {
          [aptMonth, aptDay, aptYear] = checkIn.appointment_date.split('/').map(Number);
        } else if (checkIn.appointment_date.match(/^\d{4}-\d{2}-\d{2}/)) {
          [aptYear, aptMonth, aptDay] = checkIn.appointment_date.substring(0, 10).split('-').map(Number);
        } else {
          return;
        }

        const aptHour = parseInt(normalizedTime.substring(0, 2));
        const aptMinute = parseInt(normalizedTime.substring(2, 4));
        const aptLocalString = `${aptYear}-${String(aptMonth).padStart(2, '0')}-${String(aptDay).padStart(2, '0')}T${String(aptHour).padStart(2, '0')}:${String(aptMinute).padStart(2, '0')}:00`;
        const appointmentUTC = zonedTimeToUtc(aptLocalString, TIMEZONE);

        const detentionStartUTC = new Date(appointmentUTC.getTime() + 2 * 60 * 60 * 1000);
        const warnWindowStart = new Date(detentionStartUTC.getTime() - 30 * 60 * 1000);

        if (now >= warnWindowStart && now < detentionStartUTC) {
          const minutesUntil = Math.ceil((detentionStartUTC.getTime() - now.getTime()) / (1000 * 60));
          warnings.push({
            id: checkIn.id,
            referenceNumber: checkIn.reference_number || 'N/A',
            dockNumber: checkIn.dock_number || null,
            minutesUntilDetention: minutesUntil,
          });
        }
      } catch {
        // ignore malformed dates
      }
    });

    setDetentionWarnings(warnings);
  }, [checkIns]);

  useEffect(() => {
    checkApproachingDetention();
    const interval = setInterval(checkApproachingDetention, 60_000);
    return () => clearInterval(interval);
  }, [checkApproachingDetention]);

  useEffect(() => {
    setDismissedWarnings(new Set());
  }, [selectedDate]);

  // ── Search: also matches companion_reference ───────────────────────────────
  const filteredCheckIns = checkIns.filter((checkIn) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase().trim();
    return (
      (checkIn.reference_number?.toLowerCase() || '').includes(searchLower) ||
      (checkIn.companion_reference?.toLowerCase() || '').includes(searchLower) ||
      (checkIn.trailer_number?.toLowerCase() || '').includes(searchLower) ||
      (checkIn.dock_number?.toLowerCase() || '').includes(searchLower)
    );
  });

  const denialCheckIns = filteredCheckIns.filter(ci =>
    ci.status === 'check_in_denial' || ci.status === 'turned_away'
  );
  const nonDenialCheckIns = filteredCheckIns.filter(ci =>
    ci.status !== 'check_in_denial' && ci.status !== 'turned_away'
  );

  const displayedCheckIns = showInProgressOnly
    ? nonDenialCheckIns.filter(checkIn => !checkIn.end_time && checkIn.status !== 'denied')
    : nonDenialCheckIns;

  const handleStatusChange = (checkIn: CheckIn) => setSelectedForStatusChange(checkIn);
  const handleStatusChangeSuccess = () => { fetchCheckInsForDate(); setSelectedForStatusChange(null); };
  const handleEdit = (checkIn: CheckIn) => setSelectedForEdit(checkIn);
  const handleEditSuccess = () => { setSelectedForEdit(null); fetchCheckInsForDate(); };

  const statusHasDetails = (checkIn: CheckIn): boolean => !!(
    checkIn.status_note ||
    checkIn.denial_reason ||
    (checkIn.rejection_reasons && checkIn.rejection_reasons.length > 0) ||
    checkIn.resolution_action
  );

  const getStatusBadgeColor = (status: string): string => {
    const s = status.toLowerCase();
    if (s === 'completed' || s === 'checked_out') return 'bg-gray-500 text-white';
    if (s === 'unloaded') return 'bg-green-500 text-white';
    if (s === 'rejected') return 'bg-red-500 text-white';
    if (s === 'turned_away') return 'bg-orange-500 text-white';
    if (s === 'driver_left') return 'bg-indigo-500 text-white';
    if (s === 'pending') return 'bg-yellow-500 text-white';
    if (s === 'checked_in') return 'bg-purple-500 text-white';
    if (s === 'check_in_denial') return 'bg-red-700 text-white';
    return 'bg-gray-500 text-white';
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      checked_in: 'Checked In',
      checked_out: 'Checked Out',
      driver_left: 'Driver Left',
      turned_away: 'Turned Away',
      unloaded: 'Unloaded',
      rejected: 'Rejected',
      check_in_denial: 'Denied',
    };
    return labels[status] ?? (status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '));
  };

  const renderTableRows = (rows: CheckIn[]) => rows.map((checkIn) => (
    <tr key={checkIn.id} className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          checkIn.load_type === 'inbound' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
        }`}>
          {checkIn.load_type === 'inbound' ? 'I' : 'O'}
        </span>
      </td>

      <td className="px-4 py-4 text-sm">
        <div className="text-gray-900">{checkIn.carrier_name || 'N/A'}</div>
        <div className="text-gray-700">{checkIn.driver_name || 'N/A'}</div>
        <div className="text-gray-500">{formatPhoneNumber(checkIn.driver_phone)}</div>
      </td>

      <td className="px-4 py-4 text-sm text-gray-900">
        <div>{checkIn.trailer_number || 'N/A'}</div>
        <div className="text-gray-500">{checkIn.trailer_length ? `${checkIn.trailer_length}'` : ''}</div>
      </td>

      {/* Reference # — with companion reference underneath */}
      <td className="px-4 py-3 text-sm">
        <div className="font-bold text-gray-900">{checkIn.reference_number || 'N/A'}</div>
        {checkIn.companion_reference && (
          <div className="text-xs font-normal text-gray-500 mt-0.5">
             {checkIn.companion_reference}
          </div>
        )}
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {(() => {
          const status = getAppointmentStatus(checkIn.check_in_time, checkIn.appointment_time, checkIn.appointment_date);
          const bgColor =
            status.color === 'green'  ? 'bg-green-200'  :
            status.color === 'red'    ? 'bg-red-200'    :
            status.color === 'yellow' ? 'bg-yellow-200' :
            status.color === 'orange' ? 'bg-orange-200' : 'bg-gray-300';
          return (
            <div className={`inline-block px-2 py-1 rounded ${bgColor}`}>
              {formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}
              {status.message && <div className="text-xs mt-1">{status.message}</div>}
            </div>
          );
        })()}
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {formatTimeInIndianapolis(checkIn.check_in_time, true)}
      </td>

      <td className="px-4 py-3 text-sm">
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900">{checkIn.customer || 'N/A'}</span>
          <span className="font-semibold text-gray-900">{checkIn.requested_ship_date || 'N/A'}</span>
          <span className="text-gray-500 text-xs mt-0.5">
            {checkIn.ship_to_city && checkIn.ship_to_state
              ? `${checkIn.ship_to_city}, ${checkIn.ship_to_state}`
              : checkIn.ship_to_city || checkIn.ship_to_state || 'N/A'}
          </span>
        </div>
      </td>

      <td className="px-4 py-3 text-sm">
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900">{checkIn.carrier || 'N/A'}</span>
          <span className="font-semibold text-gray-900">{checkIn.mode || 'N/A'}</span>
        </div>
      </td>

      <td className="font-bold text-gray-900 px-4 py-3 text-sm">{checkIn.dock_number || 'N/A'}</td>

      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {checkIn.end_time ? formatTimeInIndianapolis(checkIn.end_time, true) : (
          checkIn.status === 'denied'
            ? <span className="text-red-500 font-medium">Denied</span>
            : <span className="text-yellow-600 font-medium">In Progress</span>
        )}
      </td>

      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
        {(() => {
          const { hasDetention, detentionDuration } = calculateDetention(
            checkIn.check_in_time, checkIn.end_time, checkIn.appointment_time, checkIn.appointment_date
          );
          return hasDetention
            ? <span className="text-red-600 font-semibold">⚠️ {detentionDuration}</span>
            : null;
        })()}
      </td>

      <td className="px-4 py-4 whitespace-nowrap text-sm">
        {statusHasDetails(checkIn) ? (
          <button
            onClick={() => setStatusDetailCheckIn(checkIn)}
            className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(checkIn.status)} underline decoration-dotted underline-offset-2 cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1`}
            title="Click to view details"
          >
            {getStatusLabel(checkIn.status)}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-75" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(checkIn.status)}`}>
            {getStatusLabel(checkIn.status)}
          </span>
        )}
      </td>

      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <div className="flex flex-col gap-1">
          <button onClick={() => handleEdit(checkIn)} className="text-blue-600 hover:text-blue-900 font-medium text-left">Edit</button>
          <button onClick={() => handleStatusChange(checkIn)} className="text-green-600 hover:text-green-800 font-medium text-left">Status</button>
          {checkIn.appointment_time === 'Paid' && (
  <button
    onClick={() => setSelectedForPaidReceipt(checkIn)}
    className="text-green-600 hover:text-green-800 font-medium text-left flex items-center gap-1"
  >
    💵 Paid Receipt
  </button>
)}
          <button
            onClick={() => reprintReceipt(checkIn)}
            className="text-gray-500 hover:text-gray-800 font-medium text-left flex items-center gap-1"
            title="Reprint check-in receipt and inspection form"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
            </svg>
            Reprint
          </button>
        </div>
      </td>
    </tr>
  ));

  const tableHead = (
    <thead className="bg-gray-50">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver Info</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref. #</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-In Time</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer, Req. Date and Dest.</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SCAC and Mode</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dock</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Time</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detention</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
      </tr>
    </thead>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  const visibleWarnings = detentionWarnings.filter(w => !dismissedWarnings.has(w.id));

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Daily Log" />

      {/* ── Approaching-detention warning banner ── */}
      {visibleWarnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-300">
          <div className="max-w-[1600px] mx-auto px-4 py-2 flex flex-col gap-1.5">
            {visibleWarnings.map(warning => (
              <div
                key={warning.id}
                className="flex items-center justify-between gap-3 bg-amber-100 border border-amber-400 rounded-lg px-4 py-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-amber-700 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-amber-900">
                    Detention in {warning.minutesUntilDetention} min
                  </span>
                  <span className="text-sm text-amber-800">
                    — Ref{' '}
                    <span className="font-mono font-bold">{warning.referenceNumber}</span>
                    {warning.dockNumber && (
                      <>
                        {' '}at{' '}
                        <span className="font-mono font-bold">
                          {warning.dockNumber === 'Ramp' ? 'Ramp' : `Dock ${warning.dockNumber}`}
                        </span>
                      </>
                    )}
                    {' '}has not been checked out
                  </span>
                </div>
                <button
                  onClick={() =>
                    setDismissedWarnings(prev => new Set(prev).add(warning.id))
                  }
                  className="text-amber-600 hover:text-amber-900 shrink-0 p-1 rounded hover:bg-amber-200 transition-colors"
                  aria-label="Dismiss warning"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 py-6">

        <div className="mb-4 flex flex-wrap gap-3 items-center justify-between">

          {/* Date selector with prev/next arrows */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => changeDateByDays(-1)}
              className="p-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              aria-label="Previous day"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => changeDateByDays(1)}
              className="p-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              aria-label="Next day"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Search — now includes companion_reference */}
          <div className="flex-1 min-w-48 max-w-sm">
            <div className="relative">
              <input
                type="text"
                placeholder="Reference #, trailer, or door..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pl-9 pr-9 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Counters */}
          <div className="flex gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">Total</div>
              <div className="text-2xl font-bold text-blue-900">{nonDenialCheckIns.length}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-xs font-medium text-green-600 uppercase tracking-wider mb-1">Complete</div>
              <div className="text-2xl font-bold text-green-900">{nonDenialCheckIns.filter(ci => ci.end_time).length}</div>
            </div>
            <button
              onClick={() => setShowInProgressOnly(!showInProgressOnly)}
              className={`rounded-lg px-4 py-2 transition-colors border text-left ${
                showInProgressOnly
                  ? 'bg-yellow-400 border-yellow-500 ring-2 ring-yellow-300'
                  : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
              }`}
            >
              <div className="text-xs font-medium text-yellow-700 uppercase tracking-wider mb-1">In Progress</div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-yellow-900">
                  {nonDenialCheckIns.filter(ci => !ci.end_time && ci.status !== 'denied').length}
                </div>
                {showInProgressOnly && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-700" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Main table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Daily Log</h2>
            <p className="text-sm text-gray-600 mt-1">
              {nonDenialCheckIns.length} check-in{nonDenialCheckIns.length !== 1 ? 's' : ''} for {selectedDate}
            </p>
          </div>

          {displayedCheckIns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchTerm ? 'No check-ins match your search' : 'No check-ins for this date'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                {tableHead}
                <tbody className="bg-white divide-y divide-gray-200">
                  {renderTableRows(displayedCheckIns)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Denials section */}
        {denialCheckIns.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setDenialsExpanded(!denialsExpanded)}
              className="w-full flex items-center justify-between px-5 py-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold text-red-800 text-sm uppercase tracking-wide">
                  Denials &amp; Turned Away
                </span>
                <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  {denialCheckIns.length}
                </span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-5 w-5 text-red-500 transition-transform duration-200 ${denialsExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {denialsExpanded && (
              <div className="mt-2 bg-white rounded-lg shadow overflow-hidden border border-red-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Driver Info</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Trailer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Reference #</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Appointment</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Check-In Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Customer, Req. Date and Dest.</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">SCAC and Mode</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Dock</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">End Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Detention</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {renderTableRows(denialCheckIns)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {selectedForStatusChange && (
        <StatusChangeModal
          checkIn={selectedForStatusChange}
          onClose={() => setSelectedForStatusChange(null)}
          onSuccess={handleStatusChangeSuccess}
        />
      )}
      {selectedForPaidReceipt && (
  <PaidReceiptModal
    isOpen={!!selectedForPaidReceipt}
    checkIn={selectedForPaidReceipt}
    onClose={() => setSelectedForPaidReceipt(null)}
  />
)}
      {selectedForEdit && (
        <EditCheckInModal
          isOpen={true}
          checkIn={selectedForEdit}
          onClose={() => setSelectedForEdit(null)}
          onSuccess={handleEditSuccess}
        />
      )}
      {statusDetailCheckIn && (
        <StatusDetailPopover
          checkIn={statusDetailCheckIn}
          onClose={() => setStatusDetailCheckIn(null)}
        />
      )}
    </div>
  );
}
