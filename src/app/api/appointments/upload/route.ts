import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// Flexible column finder - checks trimmed, case-insensitive, with/without periods
function findColumnKey(rowKeys: string[], ...possibleNames: string[]): string | undefined {
  for (const key of rowKeys) {
    const cleaned = key.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    for (const name of possibleNames) {
      const cleanedName = name.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
      if (cleaned === cleanedName) {
        return key; // Return ORIGINAL key for row access
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
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse file
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 });
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to parse file. Please ensure it is a valid Excel or CSV file.' },
        { status: 400 }
      );
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return NextResponse.json({ error: 'No worksheet found in file.' }, { status: 400 });
    }

    // STEP 1: Try standard parse (header on row 1)
let rawData = XLSX.utils.sheet_to_json(worksheet, {
  raw: false,
  defval: ''
}) as any[];

console.log('=== UPLOAD DEBUG ===');
console.log('Sheet ref:', worksheet['!ref']);
console.log('Standard parse row count:', rawData.length);

// Log actual cell contents for debugging
const ref = worksheet['!ref'];
if (ref) {
  // Log first 10 cells to see what's actually in the sheet
  const cellsToCheck = ['A1','B1','C1','D1','E1','A2','B2','C2','D2','E2'];
  for (const addr of cellsToCheck) {
    const cell = worksheet[addr];
    console.log(`Cell ${addr}:`, cell ? JSON.stringify(cell) : 'undefined');
  }
}

// STEP 2: If empty, try to find header row with enhanced detection
if (!rawData || rawData.length === 0) {
  console.log('Standard parse empty. Scanning for header row...');

  const allRows = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: '',
    header: 1
  }) as any[][];

  console.log('Raw array row count:', allRows.length);
  if (allRows.length > 0) {
    console.log('First 5 raw rows:', JSON.stringify(allRows.slice(0, 5)));
  }

  // NEW: Check if data might be in a single column (TMS export issue)
  // Some TMS systems export with tab or pipe delimiters inside a single Excel column
  if (allRows.length > 0 && allRows[0].length === 1) {
    console.log('Single column detected - attempting to re-parse as delimited text');

    const singleColText = allRows
      .map((row) => String(row[0] || '').trim())
      .filter((line) => line.length > 0);

    if (singleColText.length > 0) {
      // Detect delimiter: tab, pipe, or comma
      const firstLine = singleColText[0];
      let delimiter = '\t';
      if (firstLine.includes('|')) delimiter = '|';
      else if (firstLine.includes(',') && !firstLine.includes('\t')) delimiter = ',';

      const headers = firstLine.split(delimiter).map((h: string) => h.trim());
      console.log('Detected headers from single column:', headers);

      if (headers.length >= 3) {
        rawData = singleColText.slice(1).map((line) => {
          const values = line.split(delimiter).map((v: string) => v.trim());
          const obj: any = {};
          headers.forEach((h: string, idx: number) => {
            obj[h] = values[idx] || '';
          });
          return obj;
        }).filter((row: any) => {
          // Filter out completely empty rows
          return Object.values(row).some((v: any) => String(v || '').trim().length > 0);
        });

        console.log('Re-parsed from single column, row count:', rawData.length);
      }
    }
  }

  // If still empty, do the normal header row scan
  if (!rawData || rawData.length === 0) {
    let headerIndex = -1;
    for (let r = 0; r < Math.min(allRows.length, 30); r++) {
      if (!allRows[r]) continue;

      // Skip rows where all cells are empty
      const nonEmptyCells = allRows[r].filter(
        (cell: any) => String(cell || '').trim().length > 0
      );
      if (nonEmptyCells.length === 0) continue;

      const rowText = allRows[r]
        .map((cell: any) => String(cell || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim())
        .join('|');

      console.log(`Scanning row ${r}: "${rowText}"`);

      if (
        (rowText.includes('sales order') || rowText.includes('salesorder')) &&
        (rowText.includes('delivery') || rowText.includes('del'))
      ) {
        headerIndex = r;
        console.log(`Header found at row ${r}`);
        break;
      }

      if (rowText.includes('apt') || rowText.includes('start date') || rowText.includes('appointment')) {
        headerIndex = r;
        console.log(`Header found (lenient) at row ${r}`);
        break;
      }
    }

    if (headerIndex >= 0) {
      rawData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: '',
        range: headerIndex
      }) as any[];
      console.log('Re-parsed with range, row count:', rawData.length);
    }
  }

  // LAST RESORT: Try re-reading the buffer with different options
  if (!rawData || rawData.length === 0) {
    console.log('All parse attempts failed. Trying cellDates + different read options...');
    try {
      const wb2 = XLSX.read(buffer, {
        type: 'buffer',
        raw: true,
        cellDates: true,
        cellNF: false,
        cellText: true,
        WTF: true // Throw on unexpected records to surface hidden issues
      });
      const ws2 = wb2.Sheets[wb2.SheetNames[0]];
      if (ws2) {
        rawData = XLSX.utils.sheet_to_json(ws2, { raw: false, defval: '' }) as any[];
        console.log('Retry with raw:true succeeded, row count:', rawData.length);
      }
    } catch (retryErr) {
      console.error('Retry parse error:', retryErr);
    }
  }

  if (!rawData || rawData.length === 0) {
    const firstNonEmpty = allRows.find(
      (row) => row && row.some((cell: any) => String(cell || '').trim().length > 0)
    );
    return NextResponse.json(
      {
        error: `Could not identify header row. First non-empty content: ${
          firstNonEmpty ? JSON.stringify(firstNonEmpty) : 'all rows empty'
        }. Expected columns: Apt. Start Date, Start Time, Customer, Sales Order, Delivery. Try re-saving your file: Open in Excel → Select all data → Copy → Paste into a NEW workbook → Save as .xlsx`
      },
      { status: 400 }
    );
  }
}


    // STEP 3: Map columns flexibly
    const firstRow = rawData[0];
    const allKeys = Object.keys(firstRow);
    console.log('Detected columns:', allKeys);

    const dateCol = findColumnKey(allKeys, 'Apt. Start Date', 'Apt Start Date', 'Start Date', 'Date', 'Appointment Date', 'Appt Date');
    const timeCol = findColumnKey(allKeys, 'Start Time', 'Time', 'Appointment Time', 'Appt Time');
    const customerCol = findColumnKey(allKeys, 'Customer', 'Customer Name', 'Cust', 'Client', 'Ship-to Name');
    const salesOrderCol = findColumnKey(allKeys, 'Sales Order', 'SalesOrder', 'Sales_Order', 'SO', 'Order', 'SO Number');
    const deliveryCol = findColumnKey(allKeys, 'Delivery', 'Delivery Number', 'Del', 'Delivery#', 'Del Number');

    console.log('Column mapping:', { dateCol, timeCol, customerCol, salesOrderCol, deliveryCol });

    const missingCols: string[] = [];
    if (!dateCol) missingCols.push('Apt. Start Date');
    if (!timeCol) missingCols.push('Start Time');
    if (!salesOrderCol) missingCols.push('Sales Order');
    if (!deliveryCol) missingCols.push('Delivery');

    if (missingCols.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required columns: ${missingCols.join(', ')}. Found columns: ${allKeys.join(', ')}`
        },
        { status: 400 }
      );
    }

    // STEP 4: Process rows
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
        const startDate = String(row[dateCol!] || '').trim();
        const startTime = row[timeCol!];
        const customer = customerCol ? String(row[customerCol] || '').trim() : '';
        const sales_order = String(row[salesOrderCol!] || '').trim();
        const delivery = String(row[deliveryCol!] || '').trim();

        // Skip blank rows
        if (!startDate && !startTime && !sales_order && !delivery) {
          results.total--;
          continue;
        }

        if (!startDate || !startTime || !sales_order || !delivery) {
          throw new Error(
            `Missing field(s) - Date:"${startDate}" Time:"${startTime}" SO:"${sales_order}" Del:"${delivery}"`
          );
        }

        // Parse date
        let formattedDate = '';
        if (startDate.includes('/')) {
          const parts = startDate.split('/');
          if (parts.length === 3) {
            let [month, day, year] = parts;
            if (year.length === 2) year = '20' + year;
            formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            throw new Error(`Invalid date: ${startDate}`);
          }
        } else if (startDate.includes('-')) {
          formattedDate = startDate;
        } else {
          throw new Error(`Unsupported date format: ${startDate}`);
        }

        // Parse time
        let formattedTime = '';
        const timeStr = String(startTime).trim();

        if (timeStr.includes(':')) {
          const parts = timeStr.split(':');
          formattedTime = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        } else if (/^\d*\.?\d+$/.test(timeStr)) {
          // Excel decimal time
          const decimal = parseFloat(timeStr);
          const totalMins = Math.round(decimal * 24 * 60);
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          formattedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        } else {
          throw new Error(`Invalid time: ${startTime}`);
        }

        // Duplicate check
        const { data: existing, error: checkErr } = await supabase
          .from('appointments')
          .select('id')
          .eq('appointment_date', formattedDate)
          .eq('appointment_time', formattedTime)
          .eq('sales_order', sales_order)
          .eq('delivery', delivery);

        if (checkErr) throw new Error(`DB check failed: ${checkErr.message}`);

        if (existing && existing.length > 0) {
          results.skipped++;
          continue;
        }

        // Create appointment
        const appointmentData: AppointmentInput = {
          appointment_date: formattedDate,
          appointment_time: formattedTime,
          sales_order: sales_order,
          delivery: delivery,
          notes: '',
          customer: customer,   // ✅ CUSTOMER IS NOW INCLUDED
          source: 'excel' as const
        };

        console.log(`Row ${rowNumber}:`, appointmentData);
        await createAppointment(appointmentData);
        results.success++;

      } catch (error) {
        results.failed++;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Row ${rowNumber}: ${msg}`);
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
