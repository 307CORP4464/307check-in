// src/app/dashboard/page.tsx or similar

'use client';

import { useEffect, useState } from 'react';

export default function CSRDashboard() {
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCheckIns() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/check-ins', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setCheckIns(data.checkIns || []);
      } catch (err) {
        console.error('Fetch error:', err);
        setError('Failed to fetch check-ins');
      } finally {
        setLoading(false);
      }
    }

    fetchCheckIns();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h1>CSR Dashboard</h1>
      <div>Pending Check-Ins: {checkIns.length}</div>
      {/* Rest of your component */}
    </div>
  );
}
