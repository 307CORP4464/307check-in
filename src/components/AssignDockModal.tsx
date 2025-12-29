'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface AssignDockModalProps {
  checkIn: {
    id: string;
    driver_name?: string;
    company?: string;
    dock_number?: string;
    appointment_time?: string | null;
    carrier_name?: string;
    pickup_number?: string;
    driver_phone?: string;
    trailer_number?: string;
    trailer_length?: string;
    delivery_city?: string;
    delivery_state?: string;
    check_in_time?: string | null; // Changed from start_time
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function AssignDockModal({ checkIn, onClose, onSuccess }: AssignDockModalProps) {
  const [dockNumber, setDockNumber] = useState(checkIn.dock_number || '');
  const [appointmentTime, setAppointmentTime] = useState(checkIn.appointment_time || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const dockOptions = [
    'Ramp',
    ...Array.from({ length: 70 }, (_, i) => (i + 1).toString())
  ];

  const appointmentOptions = [
    { value: '0800', label: '08:00' },
    { value: '0900', label: '09:00' },
    { value: '0930', label: '09:30' },
    { value: '1000', label: '10:00' },
    { value: '1030', label: '10:30' },
    { value: '1100', label: '11:00' },
    { value: '1230', label: '12:30' },
    { value: '1300', label: '13:00' },
    { value: '1330', label: '13:30' },
    { value: '1400', label: '14:00' },
    { value: '1430', label: '14:30' },
    { value: '1500', label: '15:00' },
    { value: '1550', label: '15:50' },
    { value: 'work_in', label: 'Work In' },
    { value: 'paid_to_load', label: 'Paid to Load' },
    { value: 'paid_charge_customer', label: 'Paid - Charge Customer' },
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

  // Simple on-time logic: consider "on time" if check_in_time exists and is <= appointment_time
  const isOnTime = (): boolean | null => {
    const { appointment_time, check_in_time } = checkIn;
    if (!appointment_time || !check_in_time) return null;
    const appt = new Date(appointment_time).getTime();
    const checkIn = new Date(check_in_time).getTime();
    return checkIn <= appt;
  };

  const printReceipt = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the receipt');
      return;
    }

    const currentDate = new Date().toLocaleString();
    const dockDisplay = dockNumber === 'Ramp' ? 'Ramp' : `Dock ${dockNumber}`;

    const onTimeFlag = isOnTime();

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Load Assignment Receipt</title>
          <style>
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
            body {
              font-family: 'Courier New', monospace;
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

            .highlight {
              background-color: #ffeb3b;
              padding: 8px;
              margin: 10px 0 6px;
              border: 2px solid #000;
              text-align: center;
              font-weight: bold;
            }

            .bold {
              font-weight: bold;
            }

            .footer {
              text-align: center;
              margin-top: 14px;
              font-size: 12px;
            }

            .print-button {
              display: block;
              margin: 12px auto 0;
              padding: 8px 20px;
              background-color: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="receipt-header">
            <h1>Load Assignment</h1>
            <div>${currentDate}</div>
          </div>

          <div class="highlight">Pickup: ${checkIn.pickup_number ?? ''}</div>

          <div class="section">
            ${checkIn.carrier_name ? `
            <div class="row">
              <span class="label">Carrier</span>
              <span class="value">${checkIn.carrier_name}</span>
            </div>
            ` : ''
            }
            ${checkIn.driver_name ? `
            <div class="row">
              <span class="label">Driver</span>
              <span class="value">${checkIn.driver_name}</span>
            </div>
            ` : ''
            }
            ${checkIn.driver_phone ? `
            <div class="row">
              <span class="label">Driver Phone</span>
              <span class="value">${checkIn.driver_phone}</span>
            </div>
            ` : ''
            }
            ${checkIn.trailer_number ? `
            <div class="row">
              <span class="label">Trailer Number</span>
              <span class="value">${checkIn.trailer_number}</span>
            </div>
            ` : ''
            }
            ${checkIn.trailer_length ? `
            <div class="row">
              <span class="label">Trailer Length</span>
              <span class="value">${checkIn.trailer_length}</span>
            </div>
            ` : ''
            }
            ${checkIn.delivery_city || checkIn.delivery_state ? `
            <div class="row">
              <span class="label">Delivery City</span>
              <span class="value">${checkIn.delivery_city ?? ''}</span>
            </div>
            <div class="row">
              <span class="label">Delivery State</span>
              <span class="value">${checkIn.delivery_state ?? ''}</span>
            </div>
            ` : ''
            }
          </div>

          <div class="section">
            <div class="row">
              <span class="label">Appointment Time</span>
              <span class="value">${formatAppointmentTime(appointmentTime)}</span>
            </div>
            <div class="row">
              <span class="label">Check-in Time</span>
              <span class="value">${formatCheckInTime(checkIn.check_in_time)}</span>
            </div>
            <div class="row">
              <span class="label">Status</span>
              <span class="value">${onTimeFlag === null ? '' : onTimeFlag ? '<span class="bold">On Time</span>' : 'Not On Time'}</span>
            </div>
          </div>

          <div class="footer">
            <!-- Intentionally left blank per updated requirements -->
          </div>

          <button class="print-button no-print" onclick="window.print()">Print Receipt</button>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();

    // Auto-print after a short delay
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!appointmentTime) {
      setError('Please select an appointment time');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('check_ins')
        .update({
          dock_number: dockNumber,
          appointment_time: appointmentTime || null,
          status: 'checked_in',
          start_time: new Date().toISOString(),
        })
        .eq('id', checkIn.id);

      if (updateError) throw updateError;

      // Print receipt after successful assignment
      printReceipt();

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error assigning dock:', err);
      setError(err instanceof Error ? err.message : 'Failed to assign dock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Assign Dock & Appointment</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">Check-in ID:</p>
          <p className="font-semibold">#{checkIn.id.slice(0, 8)}</p>
          {checkIn.pickup_number && (
            <>
              <p className="text-sm text-gray-600 mt-2">Pickup Number:</p>
              <p className="font-semibold">{checkIn.pickup_number}</p>
            </>
          )}
          {checkIn.driver_name && (
            <>
              <p className="text-sm text-gray-600 mt-2">Driver:</p>
              <p className="font-semibold">{checkIn.driver_name}</p>
            </>
          )}
          {checkIn.carrier_name && (
            <>
              <p className="text-sm text-gray-600 mt-2">Carrier:</p>
              <p className="font-semibold">{checkIn.carrier_name}</p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Dock/Door Number *
            </label>
            <select
              value={dockNumber}
              onChange={(e) => setDockNumber(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Dock/Door</option>
              {dockOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'Ramp' ? 'Ramp' : `Dock ${option}`}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Appointment Time <span className="text-red-500">*</span>
            </label>
            <select
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select an appointment time</option>
              {appointmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 font-medium"
            >
              {loading ? 'Assigning...' : 'Assign'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
