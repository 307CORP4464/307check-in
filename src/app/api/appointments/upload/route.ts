// src/app/api/appointments/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';

// Helper function to parse Excel date serial number
function parseExcelDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info;
}

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to parse time
function parseTime(timeValue: any): string {
  if (typeof timeValue === 'number') {
    // Excel time as fraction of day
    const totalMinutes = Math.round(timeValue * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  
  if (typeof timeValue === 'string') {
    // Already formatted time string
    const match = timeValue.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
  }
  
  return '08:00'; // Default fallback
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse workbook
    let workbook: XLSX.WorkBook;
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      const text = buffer.toString('utf-8');
      workbook = XLSX.read(text, { type: 'string' });
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log('📊 Parsed rows:', data.length);
    console.log('📋 First row sample:', data[0]);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      total: data.length
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row: any = data[i];
      
      try {
        // Find column values (case-insensitive)
        const dateKey = Object.keys(row).find(k => 
          k.toLowerCase().includes('apt') && k.toLowerCase().includes('start') && k.toLowerCase().includes('date')
        ) || 'Apt. Start Date';
        
        const timeKey = Object.keys(row).find(k => 
          k.toLowerCase().includes('start') && k.toLowerCase().includes('time')
        ) || 'Start Time';
        
        const customerKey = Object.keys(row).find(k => 
          k.toLowerCase() === 'customer'
        ) || 'Customer';
        
        const soKey = Object.keys(row).find(k => 
          k.toLowerCase().includes('sales') && k.toLowerCase().includes('order')
        ) || 'Sales Order';
        
        const deliveryKey = Object.keys(row).find(k => 
          k.toLowerCase().includes('delivery')
        ) || 'Delivery';

        const rawDate = row[dateKey];
        const rawTime = row[timeKey];
        const customer = row[customerKey];
        const sales_order = row[soKey];
        const delivery = row[deliveryKey];

        // Validate required fields
        if (!rawDate) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing date`);
          continue;
        }

        if (!rawTime) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing time`);
          continue;
        }

        if (!customer) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing customer`);
          continue;
        }

        if (!sales_order && !delivery) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing both Sales Order and Delivery`);
          continue;
        }

        // Parse date
        let formattedDate: string;
        if (typeof rawDate === 'number') {
          const excelDate = parseExcelDate(rawDate);
          formattedDate = formatDate(excelDate);
        } else if (typeof rawDate === 'string') {
          const dateParts = rawDate.split('/');
          if (dateParts.length === 3) {
            const month = dateParts[0].padStart(2, '0');
            const day = dateParts[1].padStart(2, '0');
            const year = dateParts[2];
            formattedDate = `${year}-${month}-${day}`;
          } else {
            formattedDate = rawDate;
          }
        } else {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Invalid date format`);
          continue;
        }

        // Parse time
        const formattedTime = parseTime(rawTime);

        console.log(`📝 Row ${i + 1}:`, {
          date: formattedDate,
          time: formattedTime,
          customer: String(customer).trim(),
          so: sales_order,
          delivery: delivery
        });

        // Create appointment - NOW INCLUDING CUSTOMER
        const appointmentData: AppointmentInput = {
          appointment_date: formattedDate,
          appointment_time: formattedTime,
          customer: String(customer).trim(), // ✅ ADDED
          sales_order: String(sales_order).trim(),
          delivery: String(delivery).trim(),
          notes: '',
          source: 'upload'
        };

        await createAppointment(appointmentData);
        results.success++;
        console.log(`✅ Row ${i + 1} created successfully`);

      } catch (error: any) {
        results.failed++;
        const errorMsg = `Row ${i + 1}: ${error.message}`;
        results.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log('📊 Upload results:', results);

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
