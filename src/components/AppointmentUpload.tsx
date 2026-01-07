'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { bulkCreateAppointments } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';
import { supabase } from '@/lib/supabase';

export default function AppointmentUpload({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.>[0]</a>;
    if (!file) return;

    setUploading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames>[0]</a>];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const appointments: AppointmentInput[] = [];

      for (const row of jsonData as any[]) {
        // Parse date
        let date: string;
        if (typeof row['Apt. Start Date'] === 'number') {
          const excelDate = XLSX.SSF.parse_date_code(row['Apt. Start Date']);
          date = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
        } else {
          date = new Date(row['Apt. Start Date']).toISOString().split('T')>[0]</a>;
        }

        // Parse time
        let time: string;
        if (typeof row['Start Time'] === 'number') {
          const totalMinutes = Math.round(row['Start Time'] * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          time = String(hours).padStart(2, '0') + String(minutes).padStart(2, '0');
        } else {
          const timeStr = row['Start Time'].toString();
          time = timeStr.replace(':', '').substring(0, 4);
        }

        // Check if already exists
        const { data: existing } = await supabase
          .from('appointments')
          .select('id')
          .eq('scheduled_date', date)
          .eq('scheduled_time', time)
          .eq('sales_order', String(row['Sales Order']))
          .eq('delivery', String(row['Delivery']));

        if (!existing || existing.length === 0) {
          appointments.push({
            scheduled_date: date,
            scheduled_time: time,
            sales_order: String(row['Sales Order']),
            delivery: String(row['Delivery']),
            source: 'excel'
          });
        }
      }

      if (appointments.length > 0) {
        const count = await bulkCreateAppointments(appointments);
        alert(`Successfully imported ${count} appointments`);
        onUploadComplete();
      } else {
        alert('No new appointments to import');
      }

      // Reset file input
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file. Please check the format.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-blue-50 p-6 rounded-lg mb-6">
      <h3 className="text-lg font-semibold mb-4">Upload Daily Appointments</h3>
      <div className="flex items-center gap-4">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={uploading}
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none"
        />
        {uploading && <span className="text-blue-600">Uploading...</span>}
      </div>
      <p className="text-sm text-gray-600 mt-2">
        Upload Excel file with columns: Apt. Start Date, Start Time, Sales Order, Delivery
      </p>
    </div>
  );
}

