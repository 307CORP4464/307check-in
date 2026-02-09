import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// Helper to normalize column names (handles whitespace, case, special chars)
function normalizeColumnName(col: string): string {
  return col
    .trim()
    .replace(/\s+/g, ' ')        // collapse multiple spaces
    .replace(/[^\x20-\x7E]/g, '') // remove non-printable/BOM characters
    .toLowerCase();
}

// Map normalized names to expected field names
function findColumn(row: any, possibleNames: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const key of keys) {
    const normalized = normalizeColumnName(key);
    for (const name of possibleNames) {
      if (normalized === name.toLowerCase()) {
        return key; // return the ORIGINAL key so we can access row[key]
      }
    }
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Read file as buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse file
    let workbook;
    try {
      workbook = XLSX.read(buffer, { 
        type: 'buffer', 
        raw: false,
        codepage: 65001  // Force UTF-8
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to parse file. Please ensure it is a valid Excel or CSV file.' },
        { status: 400 }
      );
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return NextResponse.json(
        { error: 'No worksheet found in file.' },
        { status: 400 }
      );
    }

    // Log the sheet range for debugging
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    console.log('Sheet range:', worksheet['!ref']);
    console.log('Rows:', range.e.r - range.s.r + 1, 'Cols:', range.e.c - range.s.c + 1);

    // Try parsing with different options
    let rawData = XLSX.utils.sheet_to_json(worksheet, { 
      raw: false, 
      defval: '' 
    }) as any[];

    // If empty, try with header detection from different rows
    if (!rawData || rawData.length === 0) {
      console.log('First parse returned empty. Trying with range option...');
      
      // Try reading raw cell values to find where data starts
      const allRows = XLSX.utils.sheet_to_json(worksheet, { 
        raw: false, 
        defval: '',
        header: 1  // Returns array of arrays instead of objects
      }) as any[][];

      console.log('Raw rows found:', allRows.length);
      console.log('First 5 rows:', JSON.stringify(allRows.slice(0, 5)));

      if (allRows.length === 0) {
        return NextResponse.json(
          { error: 'No data found in file. The file appears to be empty.' },
          { status: 400 }
        );
      }

      // Find the header row (the one containing "Sales Order" or similar)
      let headerRowIndex = -1;
      for (let r = 0; r < Math.min(allRows.length, 10); r++) {
        const rowStr = allRows[r].map((c: any) => String(c).toLowerCase()).join(' ');
        if (rowStr.includes('sales order') || rowStr.includes('delivery') || rowStr.includes('apt.')) {
          headerRowIndex = r;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return NextResponse.json(
          { 
            error: `Could not find header row. First row contains: ${JSON.stringify(allRows[0])}. Expected columns: Apt. Start Date, Start Time, Customer, Sales Order, Delivery` 
          },
          { status: 400 }
        );
      }

      console.log('Header row found at index:', headerRowIndex);

      // Re-parse with correct header row
      if (headerRowIndex > 0) {
        rawData = XLSX.utils.sheet_to_json(worksheet, { 
          raw: false, 
          defval: '',
          range: headerRowIndex  // Skip rows before header
        }) as any[];
        console.log('Re-parsed data count:', rawData.length);
      }
    }

    if (!rawData || rawData.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found after header. Please check your file format.' },
        { status: 400 }
      );
    }

    // Log what we found
    const firstRow = rawData[0];
    const foundColumns = Object.keys(firstRow);
    console.log('Found columns:', foundColumns);
    console.log('Parsed data sample:', rawData.slice(0, 2));

    // Use flexible column matching
    const dateCol = findColumn(firstRow, ['Apt. Start Date', 'Apt Start Date', 'Start Date', 'Date', 'Appointment Date']);
    const timeCol = findColumn(firstRow, ['Start Time', 'Time', 'Appointment Time']);
    const customerCol = findColumn(firstRow, ['Customer', 'Customer Name', 'Cust', 'Client']);
    const salesOrderCol = findColumn(firstRow, ['Sales Order', 'Sales_Order', 'SalesOrder', 'SO', 'Order']);
    const deliveryCol = findColumn(firstRow, ['Delivery', 'Delivery Number', 'Del', 'Delivery#']);

    // Check required columns
    const missing: string[] = [];
    if (!dateCol) missing.push('Apt. Start Date');
    if (!timeCol) missing.push('Start Time');
    if (!salesOrderCol) missing.push('Sales Order');
    if (!deliveryCol) missing.push('Delivery');

    if (missing.length > 0) {
      return NextResponse.json(
        { 
          error: `Missing required columns: ${missing.join(', ')}. Found columns: ${foundColumns.join(', ')}` 
        },
        { status: 400 }
      );
    }

    console.log('Column mapping:', { dateCol, timeCol, customerCol, salesOrderCol, deliveryCol });

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
      total: rawData.length
    };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNumber = i + 2;

      try {
        // Extract values using matched column names
        const startDate = row[dateCol!] || '';
        const startTime = row[timeCol!] || '';
        const customer = customerCol ? (row[customerCol] || '') : '';  // ✅ CUSTOMER EXTRACTED
        const sales_order = row[salesOrderCol!] || '';
        const delivery = row[deliveryCol!] || '';

        // Skip completely empty rows
        if (!startDate && !startTime && !sales_order && !delivery) {
          results.total--;
          continue;
        }

        // Validate required fields
        if (!startDate || !startTime || !sales_order || !delivery) {
          throw new Error(`Missing required field(s) - Date: "${startDate}", Time: "${startTime}", SO: "${sales_order}", Del: "${delivery}"`);
        }

        // Parse date (MM/DD/YYYY to YYYY-MM-DD)
        let formattedDate = '';
        const dateStr = String(startDate).trim();
        
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            let [month, day, year] = parts;
            // Handle 2-digit year
            if (year.length === 2) year = '20' + year;
            formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            throw new Error(`Invalid date format: ${startDate}`);
          }
        } else if (dateStr.includes('-')) {
          // Already in YYYY-MM-DD or similar
          formattedDate = dateStr;
        } else {
          throw new Error(`Unsupported date format: ${startDate}`);
        }

        // Parse time
        let formattedTime = '';
        const timeVal = startTime;
        
        if (typeof timeVal === 'string') {
          const cleanTime = timeVal.trim();
          if (cleanTime.includes(':')) {
            const timeParts = cleanTime.split(':');
            if (timeParts.length >= 2) {
              const hours = timeParts[0].padStart(2, '0');
              const minutes = timeParts[1].padStart(2, '0');
              formattedTime = `${hours}:${minutes}`;
            } else {
              throw new Error(`Invalid time format: ${startTime}`);
            }
          } else if (/^\d+(\.\d+)?$/.test(cleanTime)) {
            // Handle decimal time (Excel serial time)
            const decimal = parseFloat(cleanTime);
            const totalMinutes = Math.round(decimal * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          } else {
            throw new Error(`Invalid time format: ${startTime}`);
          }
        } else if (typeof timeVal === 'number') {
          const totalMinutes = Math.round(timeVal * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else {
          throw new Error(`Unsupported time format: ${startTime}`);
        }

        // Check for duplicates
        const { data: existingAppointments, error: checkError } = await supabase
          .from('appointments')
          .select('id, source')
          .eq('appointment_date', formattedDate)
          .eq('appointment_time', formattedTime)
          .eq('sales_order', String(sales_order).trim())
          .eq('delivery', String(delivery).trim());

        if (checkError) {
          throw new Error(`Database check failed: ${checkError.message}`);
        }

        if (existingAppointments && existingAppointments.length > 0) {
          results.skipped++;
          console.log(`Row ${rowNumber} skipped: Duplicate appointment`);
          continue;
        }

        // Create appointment
        const appointmentData: AppointmentInput = {
          appointment_date: formattedDate,
          appointment_time: formattedTime,
          sales_order: String(sales_order).trim(),
          delivery: String(delivery).trim(),
          notes: '',
          customer: String(customer).trim(),  // ✅ CUSTOMER NOW INCLUDED
          source: 'excel' as const
        };

        console.log(`Row ${rowNumber} processed:`, appointmentData);

        await createAppointment(appointmentData);
        results.success++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Row ${rowNumber}: ${errorMessage}`);
        console.error(`Row ${rowNumber} error:`, error);
      }
    }

    console.log('Upload results:', results);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process upload', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
