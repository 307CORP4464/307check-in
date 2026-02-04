import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

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

    // Parse Excel file
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to parse file. Please ensure it is a valid Excel or CSV file.' },
        { status: 400 }
      );
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet, { 
      raw: false, 
      defval: '' 
    }) as any[];

    console.log('Parsed data sample:', rawData.slice(0, 2));

    if (!rawData || rawData.length === 0) {
      return NextResponse.json(
        { error: 'No data found in file' },
        { status: 400 }
      );
    }

    // Verify required columns
    const firstRow = rawData[0];
    const requiredColumns = ['Apt. Start Date', 'Start Time', 'Sales Order', 'Delivery'];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingColumns.join(', ')}. Found columns: ${Object.keys(firstRow).join(', ')}` },
        { status: 400 }
      );
    }

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
        // Extract values
        const startDate = row['Apt. Start Date'] || '';
        const startTime = row['Start Time'] || '';
        const sales_order = row['Sales Order'] || '';
        const delivery = row['Delivery'] || '';

        // Validate required fields
        if (!startDate || !startTime || !sales_order || !delivery) {
          throw new Error('Missing required field(s)');
        }

        // Parse date (MM/DD/YYYY to YYYY-MM-DD)
        let formattedDate = '';
        if (typeof startDate === 'string' && startDate.includes('/')) {
          const [month, day, year] = startDate.split('/');
          if (!month || !day || !year) {
            throw new Error(`Invalid date format: ${startDate}`);
          }
          formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
          throw new Error(`Unsupported date format: ${startDate}`);
        }

        // Parse time (HH:MM:SS to HH:MM)
        let formattedTime = '';
        if (typeof startTime === 'string') {
          const cleanTime = startTime.trim();
          
          if (cleanTime.includes(':')) {
            const timeParts = cleanTime.split(':');
            if (timeParts.length >= 2) {
              const hours = timeParts[0].padStart(2, '0');
              const minutes = timeParts[1].padStart(2, '0');
              formattedTime = `${hours}:${minutes}`;
            } else {
              throw new Error(`Invalid time format: ${startTime}`);
            }
          } else {
            throw new Error(`Invalid time format: ${startTime}`);
          }
        } else if (typeof startTime === 'number') {
          const totalMinutes = Math.round(startTime * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else {
          throw new Error(`Unsupported time format: ${startTime}`);
        }

        // Check if appointment already exists
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

        // Skip if exact duplicate exists
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
          customer: '',
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
