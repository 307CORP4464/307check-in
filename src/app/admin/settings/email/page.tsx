// app/admin/settings/email/page.tsx
'use client';

import { useState } from 'react';

export default function EmailSettings() {
  const [settings, setSettings] = useState({
    enableCheckInEmails: true,
    enableDockAssignmentEmails: true,
    enableStatusChangeEmails: true,
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Email Settings</h1>
      
      <div className="space-y-4">
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={settings.enableCheckInEmails}
            onChange={(e) => setSettings({...settings, enableCheckInEmails: e.target.checked})}
            className="w-4 h-4"
          />
          <span>Send Check-In Confirmation Emails</span>
        </label>
        
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={settings.enableDockAssignmentEmails}
            onChange={(e) => setSettings({...settings, enableDockAssignmentEmails: e.target.checked})}
            className="w-4 h-4"
          />
          <span>Send Dock Assignment Emails</span>
        </label>
        
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={settings.enableStatusChangeEmails}
            onChange={(e) => setSettings({...settings, enableStatusChangeEmails: e.target.checked})}
            className="w-4 h-4"
          />
          <span>Send Status Change Emails</span>
        </label>
      </div>
      
      <button className="mt-6 px-4 py-2 bg-blue-600 text-white rounded">
        Save Settings
      </button>
    </div>
  );
}
