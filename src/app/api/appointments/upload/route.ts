import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';
import * as XLSX from 'xlsx';

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

    // Validate file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'text/csv'
    ];

    const fileName = file.name.toLowerCase();
    const validExtensions = ['.xls', '.xlsx', '.xlsm', '.csv'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xls, .xlsx, or .csv)' },
        { status: 400 }
      );
    }

    // Read file as buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with raw values
    const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' }) as any[];

    if (!rawData || rawData.length === 0) {
      return NextResponse.json(
        { error: 'No data found in Excel file' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      total: rawData.length
    };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNumber = i + 2; // +2 because Excel rows start at 1 and we have a header row

      try {
        // Extract values from Excel - handle different column name variations
        const startDate = row['Apt. Start Date'] || row['Start Date'] || row['Date'] || '';
        const startTime = row['Start Time'] || row['Time'] || '';
        const salesOrder = row['Sales Order'] || row['SalesOrder'] || '';
        const delivery = row['Delivery'] || '';

        // Validate required fields
        if (!startDate) {
          throw new Error('Apt. Start Date is required');
        }
        if (!startTime) {
          throw new Error('Start Time is required');
        }
        if (!salesOrder) {
          throw new Error('Sales Order is required');
        }
        if (!delivery) {
          throw new Error('Delivery is required');
        }

        // Parse and format date (MM/DD/YYYY to YYYY-MM-DD)
        let formattedDate = startDate;
        if (typeof startDate === 'string' && startDate.includes('/')) {
          const [month, day, year] = startDate.split('/');
          formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else if (typeof startDate === 'number') {
          // Handle Excel serial date
          const excelDate = XLSX.SSF.parse_date_code(startDate);
          formattedDate = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
        }

        // Format time (HH:MM:SS to HH:MM)
        let formattedTime = startTime;
        if (typeof startTime === 'string' && startTime.includes(':')) {
          const timeParts = startTime.split(':');
          formattedTime = `${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}`;
        } else if (typeof startTime === 'number') {
          // Handle Excel time decimal (e.g., 0.5 = 12:00 PM)
          const totalMinutes = Math.round(startTime * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        // Create appointment object
        const mappedAppointment: AppointmentInput = {
          date: formattedDate,
          time: formattedTime,
          salesOrder: String(salesOrder).trim(),
          delivery: String(delivery).trim(),
          source: 'upload'
        };

        await createAppointment(mappedAppointment);
        results.success++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(
          `Row ${rowNumber}: ${errorMessage}`
        );
      }
    }

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
