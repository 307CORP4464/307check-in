'use client';

import { useState } from 'react';

const TIMEZONE = 'America/Indiana/Indianapolis';

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
}

interface PaidReceiptModalProps {
  isOpen: boolean;
  checkIn: CheckIn;
  onClose: () => void;
}

type PaymentType = 'cash' | 'check' | 'money_order' | 'other';

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: 'Cash',
  check: 'Check',
  money_order: 'Money Order',
  other: 'Other',
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

export default function PaidReceiptModal({ isOpen, checkIn, onClose }: PaidReceiptModalProps) {
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [amountError, setAmountError] = useState('');

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow digits and one decimal point
    if (/^\d*\.?\d{0,2}$/.test(val)) {
      setAmount(val);
      setAmountError('');
    }
  };

  const handlePrint = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setAmountError('Please enter a valid amount.');
      return;
    }
    if (paymentType === 'check' && !checkNumber.trim()) {
      setAmountError('Please enter the check number.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the receipt.');
      return;
    }

    const printedAt = new Date().toLocaleString('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const dockDisplay = checkIn.dock_number === 'Ramp'
      ? 'Ramp'
      : checkIn.dock_number
        ? `Dock ${checkIn.dock_number}`
        : 'Not Assigned';

    const loadTypeLabel = checkIn.load_type === 'inbound' ? 'Inbound' : 'Outbound';

    const paymentLabel = PAYMENT_TYPE_LABELS[paymentType];
    const checkLine = paymentType === 'check'
      ? `<div class="row"><span class="label">Check #:</span><span class="value">${checkNumber}</span></div>`
      : '';

    const notesLine = notes.trim()
      ? `<div class="notes-section"><div class="label">Notes:</div><div class="notes-text">${notes}</div></div>`
      : '';

    const receivedByLine = receivedBy.trim()
      ? `<div class="row"><span class="label">Received By:</span><span class="value">${receivedBy}</span></div>`
      : '';

    const formattedAmount = parseFloat(amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Paid to Load Receipt</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              .no-print { display: none; }
              @page { margin: 0.4in; size: 4in 6in; }
            }
            * { box-sizing: border-box; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; background: #fff; color: #111; margin: 0; padding: 0; }
            .page { max-width: 380px; margin: 0 auto; padding: 20px 16px; }

            /* Header */
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 12px; }
            .header .company { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #555; margin-bottom: 4px; }
            .header h1 { margin: 0 0 2px; font-size: 20px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; }
            .header .subtitle { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #777; }

            /* Receipt ID */
            .receipt-meta { display: flex; justify-content: space-between; font-size: 9px; color: #666; margin-bottom: 12px; }

            /* Sections */
            .section { border: 1px solid #ddd; border-radius: 3px; padding: 8px 10px; margin-bottom: 8px; }
            .section-title { font-size: 8px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #888; margin-bottom: 6px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
            .row { display: flex; justify-content: space-between; align-items: baseline; margin: 4px 0; gap: 8px; }
            .label { font-weight: bold; font-size: 10px; color: #555; white-space: nowrap; }
            .value { font-size: 11px; text-align: right; word-break: break-word; }

            /* Payment highlight box */
            .payment-box { background: #111; color: #fff; border-radius: 4px; padding: 12px; margin: 10px 0; text-align: center; }
            .payment-box .amount-label { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #aaa; margin-bottom: 4px; }
            .payment-box .amount { font-size: 32px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
            .payment-box .type { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #ccc; margin-top: 4px; }

            /* Notes */
            .notes-section { margin-top: 6px; }
            .notes-text { font-size: 10px; color: #555; margin-top: 2px; font-style: italic; }

            /* Signature block */
            .sig-block { margin-top: 14px; display: flex; justify-content: space-between; gap: 16px; }
            .sig-item { flex: 1; }
            .sig-line { border-bottom: 1px solid #000; height: 24px; margin-bottom: 3px; }
            .sig-label { font-size: 8px; color: #888; text-align: center; letter-spacing: 1px; }

            /* Footer */
            .footer { margin-top: 14px; border-top: 1px dashed #ccc; padding-top: 10px; text-align: center; }
            .footer p { font-size: 8px; color: #888; margin: 2px 0; }

            /* Copy marker */
            .copy-badge { display: inline-block; border: 1px solid #000; padding: 1px 6px; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }

            /* Print button */
            .print-btn { display: block; width: 100%; margin-top: 20px; padding: 12px; background: #111; color: #fff; border: none; border-radius: 4px; font-size: 14px; font-family: inherit; cursor: pointer; letter-spacing: 1px; text-transform: uppercase; }
            .print-btn:hover { background: #333; }

            /* Page break between copies */
            .page-break { page-break-before: always; }
          </style>
        </head>
        <body>

          <!-- FACILITY COPY -->
          <div class="page">
            <div class="header">
              <div class="company">Warehouse Operations</div>
              <h1>Paid to Load</h1>
              <div class="subtitle">Payment Receipt</div>
            </div>

            <div class="receipt-meta">
              <span>Printed: ${printedAt}</span>
              <span class="copy-badge">Facility Copy</span>
            </div>

            <!-- Payment Amount -->
            <div class="payment-box">
              <div class="amount-label">Amount Collected</div>
              <div class="amount">${formattedAmount}</div>
              <div class="type">${paymentLabel}</div>
            </div>

            <!-- Payment Details -->
            <div class="section">
              <div class="section-title">Payment Details</div>
              <div class="row"><span class="label">Payment Type:</span><span class="value">${paymentLabel}</span></div>
              ${checkLine}
              ${receivedByLine}
            </div>

            <!-- Load Info -->
            <div class="section">
              <div class="section-title">Load Information</div>
              <div class="row"><span class="label">Type:</span><span class="value">${loadTypeLabel}</span></div>
              <div class="row"><span class="label">Reference #:</span><span class="value">${checkIn.reference_number || 'N/A'}</span></div>
              ${checkIn.companion_reference ? `<div class="row"><span class="label">Companion Ref:</span><span class="value">${checkIn.companion_reference}</span></div>` : ''}
              <div class="row"><span class="label">Dock:</span><span class="value">${dockDisplay}</span></div>
              ${checkIn.customer ? `<div class="row"><span class="label">Customer:</span><span class="value">${checkIn.customer}</span></div>` : ''}
              ${checkIn.ship_to_city || checkIn.ship_to_state ? `<div class="row"><span class="label">Destination:</span><span class="value">${[checkIn.ship_to_city, checkIn.ship_to_state].filter(Boolean).join(', ')}</span></div>` : ''}
              ${checkIn.requested_ship_date ? `<div class="row"><span class="label">Ship Date:</span><span class="value">${checkIn.requested_ship_date}</span></div>` : ''}
            </div>

            <!-- Driver / Carrier Info -->
            <div class="section">
              <div class="section-title">Driver & Carrier</div>
              <div class="row"><span class="label">Driver:</span><span class="value">${checkIn.driver_name || 'N/A'}</span></div>
              <div class="row"><span class="label">Phone:</span><span class="value">${formatPhoneNumber(checkIn.driver_phone)}</span></div>
              <div class="row"><span class="label">Carrier:</span><span class="value">${checkIn.carrier_name || 'N/A'}</span></div>
              <div class="row"><span class="label">Trailer #:</span><span class="value">${checkIn.trailer_number || 'N/A'}${checkIn.trailer_length ? ` (${checkIn.trailer_length}')` : ''}</span></div>
              <div class="row"><span class="label">Check-In:</span><span class="value">${formatTimeInIndianapolis(checkIn.check_in_time)}</span></div>
            </div>

            ${notesLine}

            <!-- Signature -->
            <div class="sig-block">
              <div class="sig-item">
                <div class="sig-line"></div>
                <div class="sig-label">Driver Signature</div>
              </div>
              <div class="sig-item">
                <div class="sig-line"></div>
                <div class="sig-label">Received By</div>
              </div>
            </div>

            <div class="footer">
              <p>This receipt confirms payment was collected for loading services.</p>
              <p>Keep this copy for your records.</p>
            </div>

            <button class="print-btn no-print" onclick="window.print()">Print Receipt</button>
          </div>

          <!-- DRIVER COPY -->
          <div class="page page-break">
            <div class="header">
              <div class="company">Warehouse Operations</div>
              <h1>Paid to Load</h1>
              <div class="subtitle">Payment Receipt</div>
            </div>

            <div class="receipt-meta">
              <span>Printed: ${printedAt}</span>
              <span class="copy-badge">Driver Copy</span>
            </div>

            <!-- Payment Amount -->
            <div class="payment-box">
              <div class="amount-label">Amount Collected</div>
              <div class="amount">${formattedAmount}</div>
              <div class="type">${paymentLabel}</div>
            </div>

            <!-- Payment Details -->
            <div class="section">
              <div class="section-title">Payment Details</div>
              <div class="row"><span class="label">Payment Type:</span><span class="value">${paymentLabel}</span></div>
              ${checkLine}
              ${receivedByLine}
            </div>

            <!-- Load Info -->
            <div class="section">
              <div class="section-title">Load Information</div>
              <div class="row"><span class="label">Type:</span><span class="value">${loadTypeLabel}</span></div>
              <div class="row"><span class="label">Reference #:</span><span class="value">${checkIn.reference_number || 'N/A'}</span></div>
              ${checkIn.companion_reference ? `<div class="row"><span class="label">Companion Ref:</span><span class="value">${checkIn.companion_reference}</span></div>` : ''}
              <div class="row"><span class="label">Dock:</span><span class="value">${dockDisplay}</span></div>
              ${checkIn.customer ? `<div class="row"><span class="label">Customer:</span><span class="value">${checkIn.customer}</span></div>` : ''}
              ${checkIn.ship_to_city || checkIn.ship_to_state ? `<div class="row"><span class="label">Destination:</span><span class="value">${[checkIn.ship_to_city, checkIn.ship_to_state].filter(Boolean).join(', ')}</span></div>` : ''}
            </div>

            <!-- Driver / Carrier Info -->
            <div class="section">
              <div class="section-title">Driver & Carrier</div>
              <div class="row"><span class="label">Driver:</span><span class="value">${checkIn.driver_name || 'N/A'}</span></div>
              <div class="row"><span class="label">Carrier:</span><span class="value">${checkIn.carrier_name || 'N/A'}</span></div>
              <div class="row"><span class="label">Trailer #:</span><span class="value">${checkIn.trailer_number || 'N/A'}${checkIn.trailer_length ? ` (${checkIn.trailer_length}')` : ''}</span></div>
              <div class="row"><span class="label">Check-In:</span><span class="value">${formatTimeInIndianapolis(checkIn.check_in_time)}</span></div>
            </div>

            ${notesLine}

            <!-- Signature -->
            <div class="sig-block">
              <div class="sig-item">
                <div class="sig-line"></div>
                <div class="sig-label">Driver Signature</div>
              </div>
              <div class="sig-item">
                <div class="sig-line"></div>
                <div class="sig-label">Received By</div>
              </div>
            </div>

            <div class="footer">
              <p>This receipt confirms payment was collected for loading services.</p>
              <p>Present this copy to the guard upon exit.</p>
            </div>
          </div>

          <script>
            window.onload = function () {
              setTimeout(function () { window.print(); }, 250);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
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

          {/* Load Info Summary (read-only) */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Load Information</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div>
                <span className="text-gray-500">Type: </span>
                <span className="font-medium text-gray-900 capitalize">{checkIn.load_type || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Dock: </span>
                <span className="font-medium text-gray-900">
                  {checkIn.dock_number === 'Ramp' ? 'Ramp' : checkIn.dock_number ? `Dock ${checkIn.dock_number}` : 'N/A'}
                </span>
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

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Amount Collected <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-base">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                className={`w-full pl-7 pr-4 py-2.5 border rounded-lg text-base font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  amountError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
            </div>
            {amountError && (
              <p className="text-xs text-red-600 mt-1">{amountError}</p>
            )}
          </div>

          {/* Payment Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Payment Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(PAYMENT_TYPE_LABELS) as [PaymentType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setPaymentType(type);
                    setAmountError('');
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

          {/* Check Number — only shown when payment type is 'check' */}
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
                  setAmountError('');
                }}
                placeholder="e.g., 1042"
                className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  amountError && !checkNumber.trim() ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
                autoFocus
              />
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
            className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
