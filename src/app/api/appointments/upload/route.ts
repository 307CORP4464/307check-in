import { NextRequest, NextResponse } from 'next/server';
import { createAppointment } from '@/lib/appointmentsService';
import { AppointmentInput } from '@/types/appointments';
import * as XLSX from 'xlsx';

function findColumnKey(rowKeys: string[], ...possibleNames: string[]): string | undefined {
  for (const key of rowKeys) {
    const cleaned = key.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    for (const name of possibleNames) {
      const cleanedName = name.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
      if (cleaned === cleanedName) {
        return key;
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

    let rawData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: ''
    }) as any[];

    if (!rawData || rawData.length === 0) {
      const allRows = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: '',
        header: 1
      }) as any[][];

      if (allRows.length > 0 && allRows[0].length === 1) {
        const singleColText = allRows
          .map((row) => String(row[0] || '').trim())
          .filter((line) => line.length > 0);

        if (singleColText.length > 0) {
          const firstLine = singleColText[0];
          let delimiter = '\t';
          if (firstLine.includes('|')) delimiter = '|';
          else if (firstLine.includes(',') && !firstLine.includes('\t')) delimiter = ',';

          const headers = firstLine.split(delimiter).map((h: string) => h.trim());

          if (headers.length >= 3) {
            rawData = singleColText.slice(1).map((line) => {
              const values = line.split(delimiter).map((v: string) => v.trim());
              const obj: any = {};
              headers.forEach((h: string, idx: number) => {
                obj[h] = values[idx] || '';
              });
              return obj;
            }).filter((row: any) => {
              return Object.values(row).some((v: any) => String(v || '').trim().length > 0);
            });
          }
        }
      }

      if (!rawData || rawData.length === 0) {
        let headerIndex = -1;
        for (let r = 0; r < Math.min(allRows.length, 30); r++) {
          if (!allRows[r]) continue;

          const nonEmptyCells = allRows[r].filter(
            (cell: any) => String(cell || '').trim().length > 0
          );
          if (nonEmptyCells.length === 0) continue;

          const rowText = allRows[r]
            .map((cell: any) => String(cell || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim())
            .join('|');

          if (
            (rowText.includes('sales order') || rowText.includes('salesorder')) &&
            (rowText.includes('delivery') || rowText.includes('del'))
          ) {
            headerIndex = r;
            break;
          }

          if (rowText.includes('apt') || rowText.includes('start date') || rowText.includes('appointment')) {
            headerIndex = r;
            break;
          }
        }

        if (headerIndex >= 0) {
          rawData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            defval: '',
            range: headerIndex
          }) as any[];
        }
      }

      if (!rawData || rawData.length === 0) {
        try {
          const wb2 = XLSX.read(buffer, {
            type: 'buffer',
            raw: true,
            cellDates: true,
            cellNF: false,
            cellText: true,
          });
          const ws2 = wb2.Sheets[wb2.SheetNames[0]];
          if (ws2) {
            rawData = XLSX.utils.sheet_to_json(ws2, { raw: false, defval: '' }) as any[];
          }
        } catch (retryErr) {
          console.error('Retry parse error:', retryErr);
        }
      }

      if (!rawData || rawData.length === 0) {
        const allRowsCheck = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          defval: '',
          header: 1
        }) as any[][];
        const firstNonEmpty = allRowsCheck.find(
          (row) => row && row.some((cell: any) => String(cell || '').trim().length > 0)
        );
        return NextResponse.json(
          {
            error: `Could not identify header row. First non-empty content: ${
              firstNonEmpty ? JSON.stringify(firstNonEmpty) : 'all rows empty'
            }. Expected columns: Apt. Start Date, Start Time, Sales Order, Delivery. Try re-saving your file.`
          },
          { status: 400 }
        );
      }
    }

    const firstRow = rawData[0];
    const allKeys = Object.keys(firstRow);

    const dateCol = findColumnKey(allKeys,
      'Apt. Start Date', 'Apt Start Date', 'Start Date', 'Date', 'Appointment Date', 'Appt Date'
    );
    const timeCol = findColumnKey(allKeys,
      'Start Time', 'Time', 'Appointment Time', 'Appt Time'
    );
    const customerCol = findColumnKey(allKeys,
      'Customer', 'Customer Name', 'Cust', 'Client', 'Ship-to Name'
    );
    const salesOrderCol = findColumnKey(allKeys,
      'Sales Order', 'SalesOrder', 'Sales_Order', 'SO', 'Order', 'SO Number'
    );
    const deliveryCol = findColumnKey(allKeys,
      'Delivery', 'Delivery Number', 'Del', 'Delivery#', 'Del Number'
    );
    const carrierCol = findColumnKey(allKeys,
      'Carrier', 'Carrier Name', 'Carrier ID', 'SCAC'
    );
    const modeCol = findColumnKey(allKeys,
      'Mode', 'Ship Mode', 'Shipment Mode', 'Transport Mode'
    );
    const requestedShipDateCol = findColumnKey(allKeys,
      'Requested Ship Date', 'Req Ship Date', 'Ship Date', 'Requested Shipment Date'
    );
    const shipToCityCol = findColumnKey(allKeys,
      'Ship-to City', 'Ship To City', 'ShipToCity', 'Destination City', 'City'
    );
    const shipToStateCol = findColumnKey(allKeys,
      'Ship-to State', 'Ship To State', 'ShipToState', 'Destination State', 'State'
    );

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
        const carrier = carrierCol ? String(row[carrierCol] || '').trim() : '';
        const mode = modeCol ? String(row[modeCol] || '').trim() : '';
        const requestedShipDateRaw = requestedShipDateCol
          ? String(row[requestedShipDateCol] || '').trim()
          : '';
        const ship_to_city = shipToCityCol ? String(row[shipToCityCol] || '').trim() : '';
        const ship_to_state = shipToStateCol ? String(row[shipToStateCol] || '').trim() : '';

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

        // Parse appointment date
        let formattedDate = '';
        if (startDate.includes('/')) {
          const parts = startDate.split('/');
          if (parts.length === 3) {
            let [month, day, year] = parts;
            if (year.length === 2) year = '20' + year;
            formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        } else if (startDate.includes('-')) {
          formattedDate = startDate;
        } else {
          const serial = parseFloat(startDate);
          if (!isNaN(serial)) {
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + serial * 86400000);
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            formattedDate = `${y}-${m}-${d}`;
          }
        }

        if (!formattedDate) {
          throw new Error(`Could not parse date: "${startDate}"`);
        }

        // Parse requested ship date (optional)
        let formattedRequestedShipDate: string | null = null;
        if (requestedShipDateRaw) {
          if (requestedShipDateRaw.includes('/')) {
            const parts = requestedShipDateRaw.split('/');
            if (parts.length === 3) {
              let [month, day, year] = parts;
              if (year.length === 2) year = '20' + year;
              formattedRequestedShipDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
          } else if (requestedShipDateRaw.includes('-')) {
            formattedRequestedShipDate = requestedShipDateRaw;
          }
        }

        // Parse time
        let formattedTime = '';
        const timeStr = String(startTime || '').trim();
        if (timeStr.toLowerCase().includes('work in')) {
          formattedTime = 'Work In';
        } else {
          const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(:\d{2})?/);
          if (timeMatch) {
            formattedTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
          } else {
            const timeNum = parseFloat(timeStr);
            if (!isNaN(timeNum)) {
              const totalMinutes = Math.round(timeNum * 24 * 60);
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            } else {
              throw new Error(`Could not parse time: "${timeStr}"`);
            }
          }
        }

        const appointmentData: AppointmentInput = {
          appointment_date: formattedDate,
          appointment_time: formattedTime,
          customer: customer || undefined,
          sales_order,
          delivery,
          carrier: carrier || undefined,
          mode: mode || undefined,
          requested_ship_date: formattedRequestedShipDate || undefined,
          ship_to_city: ship_to_city || undefined,
          ship_to_state: ship_to_state || undefined,
          source: 'upload'
        };

        await createAppointment(appointmentData);
        results.success++;

      } catch (error: any) {
        results.failed++;
        results.errors.push(`Row ${rowNumber}: ${error.message}`);
        console.error(`Row ${rowNumber} error:`, error.message);
      }
    }

    console.log('Upload results:', results);
    return NextResponse.json(results);

  } catch (error: any) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
