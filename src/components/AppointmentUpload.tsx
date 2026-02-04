// @/components/AppointmentUpload.tsx
'use client';

import { useState } from 'react';

interface AppointmentUploadProps {
  onUploadComplete: () => void;
}

export default function AppointmentUpload({ onUploadComplete }: AppointmentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>;
    if (!selectedFile) return;

    const validExtensions = ['.xls', '.xlsx', '.csv', '.txt'];
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setMessage('❌ Invalid file type. Please upload .xls, .xlsx, .csv, or .txt file');
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
    setMessage('');
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setMessage('Processing file...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/appointments/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      let resultMessage = `✅ Upload complete!\n\n`;
      resultMessage += `📊 Summary:\n`;
      resultMessage += `  • ${result.success} appointments created\n`;
      resultMessage += `  • ${result.total} total rows processed\n`;
      
      if (result.failed > 0) {
        resultMessage += `\n❌ Failed:\n`;
        resultMessage += `  • ${result.failed} appointments failed\n\n`;
        resultMessage += `Errors:\n`;
        result.errors.slice(0, 5).forEach((error: string) => {
          resultMessage += `  • ${error}\n`;
        });
        if (result.errors.length > 5) {
          resultMessage += `  • ... and ${result.errors.length - 5} more errors\n`;
        }
      }
      
      setMessage(resultMessage);
      setFile(null);
      
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      onUploadComplete();
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage(`❌ Error processing file: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csv = [
      'Apt. Start Date,Start Time,Customer,Sales Order,Delivery', // ✅ UPDATED
      '01/09/2026,08:00:00,ACME Corp,2616791,86630766',
      '01/09/2026,09:00:00,TechCo,2624547,86634397',
      '01/09/2026,10:30:00,BuildCo,2616755,86630763'
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appointment_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Upload Appointments</h2>
      
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800 mb-2 font-semibold">
          📋 Required Excel Columns:
        </p>
        <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
          <li><strong>Apt. Start Date</strong> - Format: MM/DD/YYYY (e.g., 01/09/2026)</li>
          <li><strong>Start Time</strong> - Format: HH:MM:SS (e.g., 08:00:00)</li>
          <li><strong>Customer</strong> - Customer name (required)</li> {/* ✅ ADDED */}
          <li><strong>Sales Order</strong> - Sales order number</li>
          <li><strong>Delivery</strong> - Delivery number</li>
        </ul>
        <button
          onClick={downloadTemplate}
          className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline font-medium flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Sample Template
        </button>
      </div>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="file-input" className="block mb-2">
            <span className="text-sm font-medium text-gray-700 mb-2 block">
              Select Excel or CSV File
            </span>
            <input
              id="file-input"
              type="file"
              accept=".xls,.xlsx,.csv,.txt"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed
                border border-gray-300 rounded-lg
                cursor-pointer"
            />
          </label>
          {file && (
            <p className="text-sm text-gray-600 mt-2">
              Selected: <span className="font-medium">{file.name}</span>
            </p>
          )}
        </div>

        {file && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg
              hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
              transition-colors font-medium flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Appointments
              </>
            )}
          </button>
        )}

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
          <p className="text-xs text-gray-600 font-semibold mb-2">Supported File Types:</p>
          <ul className="text-xs text-gray-700 space-y-1">
            <li>• Excel files (.xls, .xlsx)</li>
            <li>• CSV files (.csv)</li>
            <li>• Text files (.txt) with tab/comma/pipe separated values</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
