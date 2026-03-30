'use client';
import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { zonedTimeToUtc } from 'date-fns-tz';
import Link from 'next/link';
import StatusChangeModal from './StatusChangeModal';
import EditCheckInModal from './EditCheckInModal';
import Header from './Header';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TIMEZONE = 'America/Indiana/Indianapolis';

const formatTimeInIndianapolis = (isoString: string, includeDate: boolean = false): string => {
  try {
    if (!isoString || isoString === '' || isoString === 'null' || isoString === 'undefined') {
      console.error('Empty or invalid date string:', isoString);
      return 'No Check-in Time';
    }

    const date = new Date(isoString);
    
    if (isNaN(date.getTime()) || date.getTime() < 0) {
      console.error('Invalid date:', isoString);
      return 'Invalid Date';
    }

    if (date.getFullYear() < 2000) {
      console.error('Date too old, likely invalid:', isoString, date);
      return 'Invalid Date';
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    if (includeDate) {
      options.year = 'numeric';
      options.month = '2-digit';
      options.day = '2-digit';
    }
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    return formatter.format(date);
  } catch (e) {
    console.error('Time formatting error:', e, isoString);
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

 const specialTypeLabels: Record<string, string> = {
  'LTL': 'LTL',
  'Paid': 'Paid',
  'Charge': 'Charge',
};

  if (specialTypeLabels[appointmentTime] !== undefined) {
    return specialTypeLabels[appointmentTime];
  }
  
  if (appointmentTime.length === 4 && /^\d{4}$/.test(appointmentTime)) {
    const hours = appointmentTime.substring(0, 2);
    const minutes = appointmentTime.substring(2, 4);
    return `${hours}:${minutes}`;
  }
  
  return appointmentTime;
};

const formatAppointmentDateTime = (
  appointmentDate: string | null | undefined,
  appointmentTime: string | null | undefined
): string => {
  
  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
      return 'Work In';
    }
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
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}, Work In`;
      }
    } catch (error) {
      console.error('Error formatting work in date:', error);
    }
    return 'Work In';
  }

 const specialTypeLabels: Record<string, string> = {
  'LTL': 'LTL',
  'Paid': 'Paid',
  'Charge': 'Charge',
};

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
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const year = date.getFullYear();
          return `${month}/${day}/${year}, ${label}`;
        }
      } catch (error) {
        console.error('Error formatting special type date:', error);
      }
    }
    return label;
  }

  if (!appointmentTime || appointmentTime === 'null' || appointmentTime === 'undefined') {
    return 'N/A';
  }

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
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        formattedDate = `${month}/${day}/${year}`;
      }
    }

    const formattedTime = formatAppointmentTime(appointmentTime);

    if (!formattedDate) {
      return formattedTime !== 'N/A' ? formattedTime : 'N/A';
    }

    if (formattedDate && formattedTime && formattedTime !== 'N/A') {
      return `${formattedDate}, ${formattedTime}`;
    } else if (formattedDate) {
      return formattedDate;
    } else if (formattedTime && formattedTime !== 'N/A') {
      return formattedTime;
    }

    return 'N/A';
  } catch (error) {
    console.error('Error formatting appointment date/time:', error, { appointmentDate, appointmentTime });
    const formattedTime = formatAppointmentTime(appointmentTime);
    return formattedTime !== 'N/A' ? formattedTime : 'N/A';
  }
};


const getDateComponentsInIndianapolis = (isoString: string): { year: number, month: number, day: number, hour: number, minute: number } => {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '0'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0')
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

 if (
  appointmentTime === 'LTL' ||
  appointmentTime === 'Charge' ||
  appointmentTime === 'Paid'
) {
    return { color: 'orange', message: null };
  }

  if (appointmentTime === 'work_in' || appointmentTime === 'Work In') {
    return { color: 'yellow', message: null };
  }

  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) {
    return { color: 'red', message: null };
  }

  try {
    const checkInComponents = getDateComponentsInIndianapolis(checkInTime);
    let checkInHour = checkInComponents.hour;
    if (checkInHour === 24) checkInHour = 0;

    const aptHour = parseInt(normalizedTime.substring(0, 2));
    const aptMinute = parseInt(normalizedTime.substring(2, 4));

    const checkInTotalMinutes = checkInHour * 60 + checkInComponents.minute;
    const aptTotalMinutes = aptHour * 60 + aptMinute;
    const diffMinutes = checkInTotalMinutes - aptTotalMinutes;

    if (diffMinutes <= 0) {
      return { color: 'green', message: null };
    } else {
      return { color: 'yellow', message: null };
    }

  } catch (error) {
    console.error('Error in getAppointmentStatus:', error);
    return { color: 'red', message: null };
  }
};

const parseReferenceNumbers = (referenceNumber: string | undefined): string[] => {
  if (!referenceNumber) return [];
  
  return referenceNumber
    .split(/[,;\s|]+/)
    .map(ref => ref.trim())
    .filter(ref => ref.length > 0);
};

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  driver_email?: string;
  carrier_name?: string;
  trailer_number?: string;
  trailer_length?: string;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string;
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

interface Appointment {
  id: string;
  sales_order?: string;
  delivery?: string;
  appointment_time?: string;
  appointment_date?: string;
  carrier_name?: string;
  load_type?: string;
  status?: string;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  carrier?: string | null;
  mode?: string | null;
  requested_ship_date?: string | null;
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
  if (status.color !== 'green') {
    return { hasDetention: false, detentionDuration: null };
  }

  const normalizedTime = appointmentTime.replace(/:/g, '').trim();
  if (!normalizedTime.match(/^\d{4}$/)) {
    return { hasDetention: false, detentionDuration: null };
  }

  if (!appointmentDate || appointmentDate === 'null' || appointmentDate === 'undefined') {
    return { hasDetention: false, detentionDuration: null };
  }

  try {
    let aptYear: number, aptMonth: number, aptDay: number;

    if (appointmentDate.includes('/')) {
      [aptMonth, aptDay, aptYear] = appointmentDate.split('/').map(Number);
    } else if (appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      const datePart = appointmentDate.substring(0, 10);
      [aptYear, aptMonth, aptDay] = datePart.split('-').map(Number);
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
      console.error('Invalid dates in calculateDetention', { detentionStartUTC, checkOutUTC });
      return { hasDetention: false, detentionDuration: null };
    }

    const diffMs = checkOutUTC.getTime() - detentionStartUTC.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes <= 0) {
      return { hasDetention: false, detentionDuration: null };
    }

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    const detentionDuration =
      hours > 0 && minutes > 0
        ? `${hours}h ${minutes}m`
        : hours > 0
        ? `${hours}h`
        : `${minutes}m`;

    return { hasDetention: true, detentionDuration };

  } catch (error) {
    console.error('Error calculating detention:', error);
    return { hasDetention: false, detentionDuration: null };
  }
};

// ── Status Detail Popover ────────────────────────────────────────────────────
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
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Denial Reason (turned_away or check_in_denial) */}
        {(status === 'turned_away' || status === 'check_in_denial') && checkIn.denial_reason && (
          <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-1">
              {status === 'check_in_denial' ? 'Reason Denied' : 'Reason Turned Away'}
            </p>
            <p className="text-sm text-orange-900">{checkIn.denial_reason}</p>
          </div>
        )}

        {/* Rejection Reasons */}
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

        {/* Resolution Action */}
        {status === 'rejected' && resolutionLabel && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Required Action</p>
            <p className="text-sm text-amber-900">{resolutionLabel}</p>
          </div>
        )}

        {/* General Notes */}
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

// ── Reprint receipt ──────────────────────────────────────────────────────────
const reprintReceipt = (checkIn: CheckIn) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print the receipt');
    return;
  }

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

  const formatApptTime = (time: string) => {
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

  const currentDate = new Date().toLocaleString();
  const today = new Date().toLocaleDateString();
  const dockDisplay = checkIn.dock_number === 'Ramp'
    ? 'Ramp'
    : checkIn.dock_number
      ? `Dock ${checkIn.dock_number}`
      : 'Not Assigned';

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
            @page { 
              margin: 0.5in;
              size: letter;
            }
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
          .print-button:hover { background-color: #45a049; }
          .inspection-page { font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 10pt; }
          .title { text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 10px; }
          .info-line { margin: 8px 0; font-weight: bold; font-size: 11pt; }
          .section-title { font-weight: bold; font-size: 12pt; margin: 15px 0 8px 0; padding: 5px 0; border-bottom: 1px solid black; }
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
            <p style="margin: 5px 0; font-size: 12px;">${currentDate}</p>
          </div>

          <div class="reference-box">
            <div class="reference-number">Reference #: ${checkIn.reference_number || 'N/A'}</div>
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
              <span class="value">${checkIn.ship_to_city || ''} ${checkIn.ship_to_state || ''}</span>
            </div>
            <div class="row">
              <span class="label">Appointment:</span>
              <span class="value">${checkIn.appointment_time ? formatApptTime(checkIn.appointment_time) : 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Check-in Time:</span>
              <span class="value">${formatCheckInTime(checkIn.check_in_time)}</span>
            </div>
          </div>

          <button class="print-button no-print" onclick="window.print()">Print Form</button>
        </div>

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
      </div>
    `;
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
        <div class="spacer-row"></div>
        <table>
          <thead>
            <tr>
              <th>PRE-SEALING CHECKLIST</th>
              <th class="checkbox-cell">INITIAL</th>
            </tr>
          </thead>
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
            <tr><td>3</td><td>updated format and added revisions table.</td><td>Quality Manager</td><td>Operations Manager</td><td>3/10/2026</td></tr>
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

  printWindow.document.write(receiptHTML);
  printWindow.document.close();
};


export default function DailyLog() {
  const router = useRouter();

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showInProgressOnly, setShowInProgressOnly] = useState(false);
  const [appointments, setAppointments] = useState<Map<string, Appointment>>(new Map());

  // Status detail popover state
  const [statusDetailCheckIn, setStatusDetailCheckIn] = useState<CheckIn | null>(null);

  const getCurrentDateInIndianapolis = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };
  
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateInIndianapolis());
  const [selectedForStatusChange, setSelectedForStatusChange] = useState<CheckIn | null>(null);
  const [selectedForEdit, setSelectedForEdit] = useState<CheckIn | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  type AppointmentInfo = {
    time: string | null;
    date: string | null;
    customer: string | null;
    ship_to_city: string | null;
    ship_to_state: string | null;
    carrier: string | null;
    mode: string | null;
    requested_ship_date: string | null;
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
        .neq('status', 'pending')
        .order('check_in_time', { ascending: false });

      if (checkInsError) throw checkInsError;

      const allReferenceNumbers = Array.from(new Set(
        (checkInsData || [])
          .flatMap(ci => parseReferenceNumbers(ci.reference_number))
          .filter(ref => ref.trim() !== '')
      ));

      let appointmentsMap = new Map<string, {
        time: string | null;
        date: string | null;
        customer: string | null;
        ship_to_city: string | null;
        ship_to_state: string | null;
        carrier: string | null;
        mode: string | null;
        requested_ship_date: string | null;
      }>();

      if (allReferenceNumbers.length > 0) {
        const BATCH_SIZE = 20;

        for (let i = 0; i < allReferenceNumbers.length; i += BATCH_SIZE) {
          const batch = allReferenceNumbers.slice(i, i + BATCH_SIZE);

          const orFilter = batch
            .flatMap(ref => [
              `sales_order.ilike.%${ref}%`,
              `delivery.ilike.%${ref}%`
            ])
            .join(',');

          const { data: appointmentsData, error: appointmentsError } = await supabase
            .from('appointments')
            .select(
              'sales_order, delivery, appointment_time, appointment_date, customer, requested_ship_date, carrier, mode, ship_to_city, ship_to_state'
            )
            .or(orFilter)
            .eq('appointment_date', selectedDate);

          if (appointmentsError) {
            console.error('Appointments error:', appointmentsError);
            continue;
          }

          if (appointmentsData) {
            appointmentsData.forEach(apt => {
              const appointmentInfo = {
                time: apt.appointment_time ?? null,
                date: apt.appointment_date ?? null,
                customer: apt.customer ?? null,
                ship_to_city: apt.ship_to_city ?? null,
                ship_to_state: apt.ship_to_state ?? null,
                carrier: apt.carrier ?? null,
                mode: apt.mode ?? null,
                requested_ship_date: apt.requested_ship_date ?? null,
              };

              if (apt.sales_order) {
                parseReferenceNumbers(apt.sales_order).forEach(ref => {
                  appointmentsMap.set(ref.trim().toLowerCase(), appointmentInfo);
                });
                appointmentsMap.set(apt.sales_order.trim().toLowerCase(), appointmentInfo);
              }

              if (apt.delivery) {
                parseReferenceNumbers(apt.delivery).forEach(ref => {
                  appointmentsMap.set(ref.trim().toLowerCase(), appointmentInfo);
                });
                appointmentsMap.set(apt.delivery.trim().toLowerCase(), appointmentInfo);
              }
            });
          }
        }
      }

      const enrichedCheckIns = (checkInsData || []).map(checkIn => {
        const refs = parseReferenceNumbers(checkIn.reference_number);

        let appointmentInfo: AppointmentInfo | undefined = undefined;

        for (const ref of refs) {
          const trimmedRef = ref.trim().toLowerCase();
          if (appointmentsMap.has(trimmedRef)) {
            const candidate = appointmentsMap.get(trimmedRef);
            if (candidate?.date === selectedDate) {
              appointmentInfo = candidate;
              break;
            }
          }
        }

        const MANUAL_APPOINTMENT_TYPES = [
          'LTL',
          'Paid',
          'Charge',
          'work_in',
        ];

        const checkInHasManualType = checkIn.appointment_time &&
          MANUAL_APPOINTMENT_TYPES.includes(checkIn.appointment_time);

        return {
          ...checkIn,

          appointment_time: appointmentInfo?.time ?? 
            (checkInHasManualType ? checkIn.appointment_time : null),
          appointment_date: appointmentInfo?.date ?? 
            (checkInHasManualType ? checkIn.appointment_date : null),
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

  // ── Single useEffect: fetch on mount/date change + real-time subscription ──
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, fetchCheckInsForDate]);

  const filteredCheckIns = checkIns.filter((checkIn) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase().trim();
    const refNumber = checkIn.reference_number?.toLowerCase() || '';
    const trailerNumber = checkIn.trailer_number?.toLowerCase() || '';
    const dockNumber = checkIn.dock_number?.toLowerCase() || '';
    return (
      refNumber.includes(searchLower) ||
      trailerNumber.includes(searchLower) ||
      dockNumber.includes(searchLower)
    );
  });

  const displayedCheckIns = showInProgressOnly
    ? filteredCheckIns.filter(checkIn => !checkIn.end_time && checkIn.status !== 'denied')
    : filteredCheckIns;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleStatusChange = (checkIn: CheckIn) => {
    setSelectedForStatusChange(checkIn);
  };

  const handleStatusChangeSuccess = () => {
    fetchCheckInsForDate();
    setSelectedForStatusChange(null);
  };

  const handleEdit = (checkIn: CheckIn) => {
    setSelectedForEdit(checkIn);
    setEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setEditModalOpen(false);
    setSelectedForEdit(null);
    fetchCheckInsForDate();
  };

  // Determine if a status badge has clickable details
  const statusHasDetails = (checkIn: CheckIn): boolean => {
    return !!(
      checkIn.status_note ||
      checkIn.denial_reason ||
      (checkIn.rejection_reasons && checkIn.rejection_reasons.length > 0) ||
      checkIn.resolution_action
    );
  };

  const getStatusBadgeColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'completed' || statusLower === 'checked_out') return 'bg-gray-500 text-white';
    if (statusLower === 'unloaded') return 'bg-green-500 text-white';
    if (statusLower === 'rejected') return 'bg-red-500 text-white';
    if (statusLower === 'turned_away') return 'bg-orange-500 text-white';
    if (statusLower === 'driver_left') return 'bg-indigo-500 text-white';
    if (statusLower === 'pending') return 'bg-yellow-500 text-white';
    if (statusLower === 'checked_in') return 'bg-purple-500 text-white';
    if (statusLower === 'check_in_denial') return 'bg-red-700 text-white';
    return 'bg-gray-500 text-white';
  };

  const getStatusLabel = (status: string): string => {
    if (status === 'checked_in') return 'Checked In';
    if (status === 'checked_out') return 'Checked Out';
    if (status === 'driver_left') return 'Driver Left';
    if (status === 'turned_away') return 'Turned Away';
    if (status === 'unloaded') return 'Unloaded';
    if (status === 'rejected') return 'Rejected';
    if (status === 'check_in_denial') return 'Denied';
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Daily Log" />
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Date Selector, Search & Counters */}
        <div className="mb-6 flex gap-4 items-end max-w-7xl mx-auto">
          <div>
            <label htmlFor="date-select" className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            <input
              id="date-select"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search by Reference #, Trailer, or Door
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                placeholder="Reference #, trailer, or door..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pr-9 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
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
          <div className="flex gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">
                Total Checked In
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {filteredCheckIns.length}
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-xs font-medium text-green-600 uppercase tracking-wider mb-1">
                Total Complete
              </div>
              <div className="text-2xl font-bold text-green-900">
                {filteredCheckIns.filter(checkIn => checkIn.end_time).length}
              </div>
            </div>

            <button
              onClick={() => setShowInProgressOnly(!showInProgressOnly)}
              className={`rounded-lg px-4 py-2 transition-colors border text-left ${
                showInProgressOnly
                  ? 'bg-yellow-400 border-yellow-500 ring-2 ring-yellow-300'
                  : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
              }`}
            >
              <div className="text-xs font-medium text-yellow-700 uppercase tracking-wider mb-1">
                In Progress
              </div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-yellow-900">
                  {filteredCheckIns.filter(checkIn => !checkIn.end_time && checkIn.status !== 'denied').length}
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver Info</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trailer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cust. Req. Date and Dest.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SCAC and Mode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dock</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-In Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appointment Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detention</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedCheckIns.map((checkIn) => (
                <tr key={checkIn.id} className="hover:bg-gray-50">
                  {/* Type */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      checkIn.load_type === 'inbound' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {checkIn.load_type === 'inbound' ? 'I' : 'O'}
                    </span>
                  </td>

                  {/* Driver Info */}
                  <td className="px-4 py-4 text-sm">
                    <div className="text-gray-900">{checkIn.carrier_name || 'N/A'}</div>
                    <div className="text-gray-700">{checkIn.driver_name || 'N/A'}</div>
                    <div className="text-gray-500">{formatPhoneNumber(checkIn.driver_phone)}</div>
                  </td>

                  {/* Trailer Info */}
                  <td className="px-4 py-4 text-sm text-gray-900">
                    <div>{checkIn.trailer_number || 'N/A'}</div>
                    <div className="text-gray-500">{checkIn.trailer_length ? `${checkIn.trailer_length}'` : ''}</div>
                  </td>

                  {/* Load Info */}
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

                  {/* Transport */}
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900">{checkIn.carrier || 'N/A'}</span>
                      <span className="font-semibold text-gray-900">{checkIn.mode || 'N/A'}</span>
                    </div>
                  </td>

                  {/* Reference # */}
                  <td className="font-bold text-gray-900">{checkIn.reference_number || 'N/A'}</td>

                  {/* Dock */}
                  <td className="font-bold text-gray-900">{checkIn.dock_number || 'N/A'}</td>

                  {/* Check-In Time */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatTimeInIndianapolis(checkIn.check_in_time, true)}
                  </td>

                  {/* Appointment Time */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {(() => {
                      const status = getAppointmentStatus(
                        checkIn.check_in_time,
                        checkIn.appointment_time,
                        checkIn.appointment_date
                      );
                      
                      const bgColor = 
                        status.color === 'green' ? 'bg-green-200' :
                        status.color === 'red' ? 'bg-red-200' :
                        status.color === 'yellow' ? 'bg-yellow-200' :
                        status.color === 'orange' ? 'bg-orange-200' :
                        'bg-gray-300';
                      
                      return (
                        <div className={`inline-block px-2 py-1 rounded ${bgColor}`}>
                          {formatAppointmentDateTime(checkIn.appointment_date, checkIn.appointment_time)}
                          {status.message && (
                            <div className="text-xs mt-1">{status.message}</div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* End Time */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {checkIn.end_time ? formatTimeInIndianapolis(checkIn.end_time, true) : (
                      checkIn.status === 'denied' ? (
                        <span className="text-red-500 font-medium">Denied</span>
                      ) : (
                        <span className="text-yellow-600 font-medium">In Progress</span>
                      )
                    )}
                  </td>

                  {/* Detention */}
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const { hasDetention, detentionDuration } = calculateDetention(
                        checkIn.check_in_time,
                        checkIn.end_time,
                        checkIn.appointment_time,
                        checkIn.appointment_date
                      );
                      return hasDetention ? (
                        <span className="text-red-600 font-semibold">⚠️ Detention: {detentionDuration}</span>
                      ) : null;
                    })()}
                  </td>

                  {/* Status — clickable if there are details */}
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

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleEdit(checkIn)}
                        className="text-blue-600 hover:text-blue-900 font-medium text-left"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleStatusChange(checkIn)}
                        className="text-green-600 hover:text-green-800 font-medium text-left"
                      >
                        Status
                      </button>
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
              ))}
            </tbody>
          </table>
        </div>
      </main>
        
      {/* Modals */}
      {selectedForStatusChange && (
        <StatusChangeModal
          checkIn={selectedForStatusChange}
          onClose={() => setSelectedForStatusChange(null)}
          onSuccess={handleStatusChangeSuccess}
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

      {/* Status Detail Popover */}
      {statusDetailCheckIn && (
        <StatusDetailPopover
          checkIn={statusDetailCheckIn}
          onClose={() => setStatusDetailCheckIn(null)}
        />
      )}
    </div>
  );
}
