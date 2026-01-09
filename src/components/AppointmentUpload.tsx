'use client';

import { useState } from 'react';
import { parseAppointments } from '@/lib/appointmentParser';
import { createAppointment, checkDuplicateAppointment } from '@/lib/appointmentsService';

interface AppointmentUploadProps {
  onUploadComplete: () => void;
}

export default function AppointmentUpload({ onUploadComplete }: AppointmentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>;
    if (!file) return;

    setUploading(true);
    setMessage('Processing file...');

    try {
      const text = await file.text();
      const parsedAppointments = parseAppointments(text);

      if (parsedAppointments.length === 0) {
        setMessage('No appointments found in file');
        return;
      }

      let created = 0;
      let duplicates = 0;
      let overridden = 0;

      for (const apt of parsedAppointments) {
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
            `Sales Order: ${duplicate.sales_order || 'N/A'}\n` +
            `Delivery: ${duplicate.delivery || 'N/A'}\n` +
            `Time: ${duplicate.scheduled_time}\n\n` +
            `New appointment:\n` +
            `Sales Order: ${apt.sales_order || 'N/A'}\n` +
            `Delivery: ${apt.delivery || 'N/A'}\n` +
            `Time: ${apt.scheduled_time}\n\n` +
            `Override and create new appointment?`
          );

          if (override) {
            await createAppointment({ ...apt, source: 'upload' });
            overridden++;
            created++;
          }
        } else {
          await createAppointment({ ...apt, source: 'upload' });
          created++;
        }
      }

      let resultMessage = `✅ Upload complete: ${created} appointments created`;
      if (duplicates > 0) {
        resultMessage += `\n⚠️ ${duplicates} duplicates found, ${overridden} overridden`;
      }
      
      setMessage(resultMessage);
      onUploadComplete();
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage(`❌ Error: ${error.message}`);
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
            <span className="sr-only">Choose file</span>
            <input
              type="file"
              accept=".txt"
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
        </div>

        {message && (
          <div className={`p-3 rounded whitespace-pre-line ${
            message.includes('Error') || message.includes('⚠️')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message}
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-blue-600">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Processing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
