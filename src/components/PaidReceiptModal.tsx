'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TIMEZONE = 'America/Indiana/Indianapolis';
const FIXED_AMOUNT = '$204.00';

interface CheckIn {
  id: string;
  check_in_time: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  carrier_name?: string | null;
  trailer_number?: string | null;
  trailer_length?: string | null;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string | null;
  companion_reference?: string | null;
  dock_number?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  customer?: string | null;
  requested_ship_date?: string | null;
  carrier?: string | null;
  mode?: string | null;
  paid_receipt_snapshot?: PaidReceiptSnapshot | null;
}

export interface PaidReceiptSnapshot {
  paymentType: PaymentType;
  checkNumber: string;
  receivedBy: string;
  notes: string;
  printedAt: string;
  // Frozen check-in fields at time of original print
  check_in_time: string;
  driver_name: string | null;
  driver_phone: string | null;
  carrier_name: string | null;
  trailer_number: string | null;
  trailer_length: string | null;
  load_type: 'inbound' | 'outbound' | undefined;
  reference_number: string | null;
  companion_reference: string | null;
  dock_number: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  customer: string | null;
  requested_ship_date: string | null;
  carrier: string | null;
  mode: string | null;
}

interface PaidReceiptModalProps {
  isOpen: boolean;
  checkIn: CheckIn;
  onClose: () => void;
  /** 
   * When true, the modal is read-only and uses the saved snapshot for reprinting.
   * When false (default), it's the first-print flow with editable fields.
   */
  reprintMode?: boolean;
}

type PaymentType = 'cash' | 'check' | 'money_order';

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: 'Cash',
  check: 'Check',
  money_order: 'Venmo',
};

const formatTimeInIndianapolis = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return 'N/A';
  }
};

const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return 'N/A';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

// ── Shared receipt HTML generator ─────────────────────────────────────────────
const buildReceiptHTML = (
  snapshot: PaidReceiptSnapshot
): string => {
  const checkInTime = formatTimeInIndianapolis(snapshot.check_in_time);
  const loadTypeLabel = snapshot.load_type === 'inbound' ? 'Inbound' : 'Outbound';
  const paymentLabel = PAYMENT_TYPE_LABELS[snapshot.paymentType];
  const printedAt = formatTimeInIndianapolis(snapshot.printedAt);

  const checkLine = snapshot.paymentType === 'check'
    ? `<div class="row"><span class="label">Check #:</span><span class="value">${snapshot.checkNumber}</span></div>`
    : '';

  const receivedByLine = snapshot.receivedBy.trim()
    ? `<div class="row"><span class="label">Received By:</span><span class="value">${snapshot.receivedBy}</span></div>`
    : '';

  const notesLine = snapshot.notes.trim()
    ? `<div class="notes-box"><span class="label">Notes:</span> <span class="notes-text">${snapshot.notes}</span></div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Paid to Load Receipt</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            .no-print { display: none; }
            @page { margin: 0.4in; size: letter portrait; }
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            background: #fff;
            color: #111;
            margin: 0;
            padding: 0;
          }
          .page {
            max-width: 420px;
            margin: 0 auto;
            padding: 24px 20px;
          }
          .header {
            text-align: center;
            border-bottom: 3px double #000;
            padding-bottom: 14px;
            margin-bottom: 14px;
          }
          .header .company {
            font-size: 9px;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: #555;
            margin-bottom: 5px;
          }
          .header h1 {
            margin: 0 0 3px;
            font-size: 22px;
            font-weight: 900;
            letter-spacing: -0.5px;
            text-transform: uppercase;
          }
          .header .subtitle {
            font-size: 9px;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #777;
          }
          .receipt-meta {
            font-size: 9px;
            color: #666;
            margin-bottom: 14px;
            text-align: right;
          }
          .reason-banner {
            border: 1px solid #bbb;
            border-left: 4px solid #111;
            background: #f7f7f7;
            padding: 8px 12px;
            margin-bottom: 12px;
            font-size: 10px;
            line-height: 1.5;
            color: #333;
          }
          .reason-banner strong {
            display: block;
            font-size: 8px;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #888;
            margin-bottom: 3px;
          }
          .payment-box {
            background: #111;
            color: #fff;
            border-radius: 4px;
            padding: 14px 12px;
            margin: 12px 0;
            text-align: center;
          }
          .payment-box .amount-label {
            font-size: 8px;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: #aaa;
            margin-bottom: 5px;
          }
          .payment-box .amount {
            font-size: 36px;
            font-weight: 900;
            letter-spacing: -1px;
            line-height: 1;
          }
          .payment-box .type {
            font-size: 10px;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #ccc;
            margin-top: 5px;
          }
          .section {
            border: 1px solid #ddd;
            border-radius: 3px;
            padding: 8px 10px;
            margin-bottom: 8px;
          }
          .section-title {
            font-size: 8px;
            font-weight: bold;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #888;
            margin-bottom: 6px;
            border-bottom: 1px dashed #ccc;
            padding-bottom: 4px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin: 4px 0;
            gap: 8px;
          }
          .label {
            font-weight: bold;
            font-size: 10px;
            color: #555;
            white-space: nowrap;
          }
          .value {
            font-size: 11px;
            text-align: right;
            word-break: break-word;
          }
          .notes-box {
            margin-top: 8px;
            font-size: 10px;
            color: #555;
            border-top: 1px dashed #ccc;
            padding-top: 6px;
          }
          .notes-text { font-style: italic; }
          .footer {
            margin-top: 16px;
            border-top: 1px dashed #ccc;
            padding-top: 10px;
            text-align: center;
          }
          .footer p {
            font-size: 8px;
            color: #888;
            margin: 2px 0;
          }
          .print-btn {
            display: block;
            width: 100%;
            margin-top: 20px;
            padding: 12px;
            background: #111;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
            cursor: pointer;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .print-btn:hover { background: #333; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="company">Warehouse Operations</div>
            <h1>Paid to Load</h1>
            <div class="subtitle">Payment Receipt</div>
          </div>

          <div class="receipt-meta">
            Check-In: ${checkInTime}
            &nbsp;|&nbsp;
            Originally Printed: ${printedAt}
          </div>

          <div class="reason-banner">
            <strong>Reason for Charge</strong>
            This fee of ${FIXED_AMOUNT} is charged for same-day loading services provided without a scheduled appointment.
          </div>

          <div class="payment-box">
            <div class="amount-label">Amount Collected</div>
            <div class="amount">${FIXED_AMOUNT}</div>
            <div class="type">${paymentLabel}</div>
          </div>

          <div class="section">
            <div class="section-title">Payment Details</div>
            <div class="row"><span class="label">Payment Type:</span><span class="value">${paymentLabel}</span></div>
            ${checkLine}
            ${receivedByLine}
          </div>

          <div class="section">
            <div class="section-title">Load Information</div>
            <div class="row"><span class="label">Type:</span><span class="value">${loadTypeLabel}</span></div>
            <div class="row"><span class="label">Reference #:</span><span class="value">${snapshot.reference_number || 'N/A'}</span></div>
            ${snapshot.companion_reference ? `<div class="row"><span class="label">Companion Ref:</span><span class="value">${snapshot.companion_reference}</span></div>` : ''}
            ${snapshot.customer ? `<div class="row"><span class="label">Customer:</span><span class="value">${snapshot.customer}</span></div>` : ''}
            ${snapshot.ship_to_city || snapshot.ship_to_state ? `<div class="row"><span class="label">Destination:</span><span class="value">${[snapshot.ship_to_city, snapshot.ship_to_state].filter(Boolean).join(', ')}</span></div>` : ''}
            ${snapshot.requested_ship_date ? `<div class="row"><span class="label">Ship Date:</span><span class="value">${snapshot.requested_ship_date}</span></div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">Driver & Carrier</div>
            <div class="row"><span class="label">Driver:</span><span class="value">${snapshot.driver_name || 'N/A'}</span></div>
            <div class="row"><span class="label">Phone:</span><span class="value">${formatPhoneNumber(snapshot.driver_phone)}</span></div>
            <div class="row"><span class="label">Carrier:</span><span class="value">${snapshot.carrier_name || 'N/A'}</span></div>
            <div class="row"><span class="label">Trailer #:</span><span class="value">${snapshot.trailer_number || 'N/A'}${snapshot.trailer_length ? ` (${snapshot.trailer_length}')` : ''}</span></div>
            ${notesLine}
          </div>

          <div class="footer">
            <p>This receipt confirms payment was collected for loading services.</p>
            <p>Present this copy to the guard upon exit.</p>
          </div>

          <button class="print-btn no-print" onclick="window.print()">Print Receipt</button>
        </div>

        <script>
          window.onload = function () {
            setTimeout(function () { window.print(); }, 250);
          };
        </script>
      </body>
    </html>
  `;
};

export default function PaidReceiptModal({ isOpen, checkIn, onClose, reprintMode = false }: PaidReceiptModalProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [checkError, setCheckError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  // ── Reprint mode: use saved snapshot directly ─────────────────────────────
  if (reprintMode) {
    const snapshot = checkIn.paid_receipt_snapshot;

    const handleReprint = () => {
      if (!snapshot) {
        alert('No saved receipt found for this check-in.');
        return;
      }
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups to print the receipt.');
        return;
      }
      printWindow.document.write(buildReceiptHTML(snapshot));
      printWindow.document.close();
    };

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-2xl max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Reprint Paid Receipt</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Ref: <span className="font-semibold text-gray-700">{checkIn.reference_number || 'N/A'}</span>
                {checkIn.companion_reference && (
                  <span className="text-gray-400"> / {checkIn.companion_reference}</span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-4">
            {!snapshot ? (
              <div className="text-center py-6 text-gray-500">
                <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium">No original receipt found.</p>
                <p className="text-xs text-gray-400 mt-1">The original receipt was not saved for this check-in.</p>
              </div>
            ) : (
              <>
                {/* Snapshot summary — read-only */}
                <div className="bg-gray-900 text-white rounded-lg px-5 py-4 text-center">
                  <p className="text-xs tracking-widest uppercase text-gray-400 mb-1">Amount</p>
                  <p className="text-4xl font-black">{FIXED_AMOUNT}</p>
                  <p className="text-xs text-gray-400 mt-1.5">{PAYMENT_TYPE_LABELS[snapshot.paymentType]}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2 text-sm">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Original Receipt Details</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div><span className="text-gray-500">Payment: </span><span className="font-medium">{PAYMENT_TYPE_LABELS[snapshot.paymentType]}</span></div>
                    {snapshot.paymentType === 'check' && snapshot.checkNumber && (
                      <div><span className="text-gray-500">Check #: </span><span className="font-medium">{snapshot.checkNumber}</span></div>
                    )}
                    {snapshot.receivedBy && (
                      <div><span className="text-gray-500">Received by: </span><span className="font-medium">{snapshot.receivedBy}</span></div>
                    )}
                    <div><span className="text-gray-500">Driver: </span><span className="font-medium">{snapshot.driver_name || 'N/A'}</span></div>
                    <div><span className="text-gray-500">Carrier: </span><span className="font-medium">{snapshot.carrier_name || 'N/A'}</span></div>
                    <div><span className="text-gray-500">Trailer: </span><span className="font-medium">{snapshot.trailer_number || 'N/A'}</span></div>
                    <div className="col-span-2"><span className="text-gray-500">Originally printed: </span><span className="font-medium">{formatTimeInIndianapolis(snapshot.printedAt)}</span></div>
                  </div>
                  {snapshot.notes && (
                    <div className="pt-2 border-t border-gray-200">
                      <span className="text-gray-500">Notes: </span>
                      <span className="italic text-gray-700">{snapshot.notes}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-center text-gray-400">
                  This will reprint the exact original receipt. No fields can be changed.
                </p>
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {snapshot && (
              <button
                type="button"
                onClick={handleReprint}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Reprint Receipt
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── First-print mode: editable fields, saves snapshot on print ───────────
  const handlePrint = async () => {
    if (paymentType === 'check' && !checkNumber.trim()) {
      setCheckError('Please enter the check number.');
      return;
    }
    setCheckError('');
    setSaving(true);

    // Build the snapshot from current check-in state + user inputs
    const snapshot: PaidReceiptSnapshot = {
      paymentType,
      checkNumber,
      receivedBy,
      notes,
      printedAt: new Date().toISOString(),
      check_in_time: checkIn.check_in_time,
      driver_name: checkIn.driver_name ?? null,
      driver_phone: checkIn.driver_phone ?? null,
      carrier_name: checkIn.carrier_name ?? null,
      trailer_number: checkIn.trailer_number ?? null,
      trailer_length: checkIn.trailer_length ?? null,
      load_type: checkIn.load_type,
      reference_number: checkIn.reference_number ?? null,
      companion_reference: checkIn.companion_reference ?? null,
      dock_number: checkIn.dock_number ?? null,
      ship_to_city: checkIn.ship_to_city ?? null,
      ship_to_state: checkIn.ship_to_state ?? null,
      customer: checkIn.customer ?? null,
      requested_ship_date: checkIn.requested_ship_date ?? null,
      carrier: checkIn.carrier ?? null,
      mode: checkIn.mode ?? null,
    };

    // Save snapshot to Supabase
    const { error } = await supabase
      .from('check_ins')
      .update({ paid_receipt_snapshot: snapshot })
      .eq('id', checkIn.id);

    setSaving(false);

    if (error) {
      console.error('Failed to save receipt snapshot:', error);
      // Still allow printing even if save fails
    }

    // Open print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the receipt.');
      return;
    }
    printWindow.document.write(buildReceiptHTML(snapshot));
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Print Paid Receipt</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Ref: <span className="font-semibold text-gray-700">{checkIn.reference_number || 'N/A'}</span>
              {checkIn.companion_reference && (
                <span className="text-gray-400"> / {checkIn.companion_reference}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Fixed amount callout */}
          <div className="bg-gray-900 text-white rounded-lg px-5 py-4 text-center">
            <p className="text-xs tracking-widest uppercase text-gray-400 mb-1">Amount</p>
            <p className="text-4xl font-black">{FIXED_AMOUNT}</p>
            <p className="text-xs text-gray-400 mt-1.5">Same-day loading — no scheduled appointment</p>
          </div>

          {/* Load Info Summary (read-only) */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Load Information</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div>
                <span className="text-gray-500">Type: </span>
                <span className="font-medium text-gray-900 capitalize">{checkIn.load_type || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Check-In: </span>
                <span className="font-medium text-gray-900">{formatTimeInIndianapolis(checkIn.check_in_time)}</span>
              </div>
              <div>
                <span className="text-gray-500">Driver: </span>
                <span className="font-medium text-gray-900">{checkIn.driver_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Carrier: </span>
                <span className="font-medium text-gray-900">{checkIn.carrier_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Trailer: </span>
                <span className="font-medium text-gray-900">
                  {checkIn.trailer_number || 'N/A'}
                  {checkIn.trailer_length ? ` (${checkIn.trailer_length}')` : ''}
                </span>
              </div>
              {checkIn.customer && (
                <div>
                  <span className="text-gray-500">Customer: </span>
                  <span className="font-medium text-gray-900">{checkIn.customer}</span>
                </div>
              )}
              {(checkIn.ship_to_city || checkIn.ship_to_state) && (
                <div className="col-span-2">
                  <span className="text-gray-500">Destination: </span>
                  <span className="font-medium text-gray-900">
                    {[checkIn.ship_to_city, checkIn.ship_to_state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Payment Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(PAYMENT_TYPE_LABELS) as [PaymentType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setPaymentType(type);
                    setCheckError('');
                    if (type !== 'check') setCheckNumber('');
                  }}
                  className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    paymentType === type
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Check Number */}
          {paymentType === 'check' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Check Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={checkNumber}
                onChange={(e) => {
                  setCheckNumber(e.target.value);
                  setCheckError('');
                }}
                placeholder="e.g., 1042"
                className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  checkError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
                autoFocus
              />
              {checkError && <p className="text-xs text-red-600 mt-1">{checkError}</p>}
            </div>
          )}

          {/* Received By */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Received By <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes to appear on the receipt..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={saving}
            className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Receipt
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
