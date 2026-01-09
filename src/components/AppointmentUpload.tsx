'use client';

import { useState } from 'react';
import { createAppointment, checkDuplicateAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';

interface AppointmentUploadProps {
  onUploadComplete: () => void;
}

export default function AppointmentUpload({ onUploadComplete }: AppointmentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  // Parse appointments from text file
  const parseAppointments = (text: string): AppointmentInput[] => {
    const appointments: AppointmentInput[] = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Skip empty lines or header lines
      if (!line.trim() || line.toLowerCase().includes('appointment') || line.toLowerCase().includes('date')) {
        continue;
      }

      try {
        // Split by tab, comma, or pipe
        const parts = line.split(/[\t,|]/).map(p => p.trim());
        
        if (parts.length < 2) continue; // Need at least date and time

        const [date, time, salesOrder, delivery, carrier, ...notesParts] = parts;
        
        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          console.warn(`Skipping invalid date: ${date}`);
          continue;
        }

        // Normalize time
        let normalizedTime = time.trim();
        if (!normalizedTime || normalizedTime === '') {
          normalizedTime = '08:00'; // Default time
        }

        appointments.push({
          appointment_date: date,
          scheduled_time: normalizedTime,
          sales_order: salesOrder?.trim() || '',
          delivery: delivery?.trim() || '',
          carrier: carrier?.trim() || '',
          notes: notesParts.join(' ').trim() || ''
        });
      } catch (error) {
        console.error('Error parsing line:', line, error);
      }
    }

    return appointments;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>;
    if (!file) return;

    setUploading(true);
    setMessage('Processing file...');

    try {
      const text = await file.text();
      const parsedAppointments = parseAppointments(text);

      if (parsedAppointments.length === 0) {
        setMessage('❌ No valid appointments found in file');
        setUploading(false);
        e.target.value = '';
        return;
      }

      let created = 0;
      let duplicates = 0;
      let overridden = 0;
      let skipped = 0;
      let errors = 0;

      for (const apt of parsedAppointments) {
        try {
          // Check for duplicates
          const duplicate = await checkDuplicateAppointment(
            apt.sales_order || '',
            apt.delivery || '',
            apt.appointment_date
          );

          if (duplicate) {
            duplicates++;
            const override = confirm(
              `⚠️ DUPLICATE FOUND!\n\n` +
              `Existing appointment:\n` +
              `  Sales Order: ${duplicate.sales_order || 'N/A'}\n` +
              `  Delivery: ${duplicate.delivery || 'N/A'}\n` +
              `  Time: ${duplicate.scheduled_time}\n\n` +
              `New appointment:\n` +
              `  Sales Order: ${apt.sales_order || 'N/A'}\n` +
              `  Delivery: ${apt.delivery || 'N/A'}\n` +
              `  Time: ${apt.scheduled_time}\n\n` +
              `Do you want to create this duplicate appointment?`
            );

            if (override) {
              await createAppointment({ ...apt, source: 'upload' });
              overridden++;
              created++;
            } else {
              skipped++;
            }
          } else {
            await createAppointment({ ...apt, source: 'upload' });
            created++;
          }
        } catch (error: any) {
          console.error('Error creating appointment:', error);
          errors++;
        }
      }

      // Build result message
      let resultMessage = `✅ Upload complete!\n\n`;
      resultMessage += `📊 Summary:\n`;
      resultMessage += `  • ${created} appointments created\n`;
      resultMessage += `  • ${parsedAppointments.length} total parsed\n`;
      
      if (duplicates > 0) {
        resultMessage += `\n⚠️ Duplicates:\n`;
        resultMessage += `  • ${duplicates} duplicates detected\n`;
        if (overridden > 0) {
          resultMessage += `  • ${overridden} duplicates overridden\n`;
        }
        if (skipped > 0) {
          resultMessage += `  • ${skipped} duplicates skipped\n`;
        }
      }
      
      if (errors > 0) {
        resultMessage += `\n❌ ${errors} errors occurred`;
      }
      
      setMessage(resultMessage);
      onUploadComplete();
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage(`❌ Error processing file: ${error.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Upload Appointments</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block mb-2">
            <span className="text-sm text-gray-700 mb-2 block">
              Upload a text file with appointments (tab, comma, or pipe-separated)
            </span>
            <input
              type="file"
              accept=".txt,.csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
          <p className="text-xs text-gray-500 mt-2">
            Expected format: Date, Time, Sales Order, Delivery, Carrier, Notes
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg whitespace-pre-line text-sm ${
            message.includes('❌')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : message.includes('⚠️')
              ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}>
            {message}
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4" 
                fill="none" 
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
              />
            </svg>
            <span className="text-blue-700 font-medium">Processing appointments...</span>
          </div>
        )}

        <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs text-gray-600 font-semibold mb-2">File Format Example:</p>
          <code className="text-xs text-gray-700 block">
            2025-01-15,08:00,SO123456,DL789012,Carrier Name,Special instructions
          </code>
        </div>
      </div>
    </div>
  );
}
