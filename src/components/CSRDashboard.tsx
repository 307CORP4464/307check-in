import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import Link from 'next/link';
import AssignDockModal from './AssignDockModal';

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  company?: string;
  purpose?: string;
  dock_number?: string;
  appointment_time?: string | null;
}

export default function CSRDashboard() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckIn | null>(null);
  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
  const [selectedForDock, setSelectedForDock] = useState<CheckIn | null>(null);
  const [isDockModalOpen, setIsDockModalOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
      }
    };
    getUser();
  }, [supabase]);

  useEffect(() => {
    fetchCheckIns();
    
    const channel = supabase
      .channel('check_ins_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_ins' },
        () => {
          fetchCheckIns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const fetchCheckIns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      setCheckIns(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleCheckOut = async (checkIn: CheckIn) => {
    setSelectedCheckIn(checkIn);
    setIsCheckOutModalOpen(true);
  };

  const confirmCheckOut = async () => {
    if (!selectedCheckIn) return;

    try {
      const { error } = await supabase
        .from('check_ins')
        .update({
          check_out_time: new Date().toISOString(),
          status: 'checked_out'
        })
        .eq('id', selectedCheckIn.id);

      if (error) throw error;

      setIsCheckOutModalOpen(false);
      setSelectedCheckIn(null);
      fetchCheckIns();
    } catch (err) {
      console.error('Error checking out:', err);
      alert('Failed to check out');
    }
  };

  const handleAssignDock = (checkIn: CheckIn) => {
    setSelectedForDock(checkIn);
    setIsDockModalOpen(true);
  };

  const handleDockAssignSuccess = () => {
    fetchCheckIns();
  };

  const calculateDwellTime = (checkIn: CheckIn): string => {
    const start = parseISO(checkIn.check_in_time);
    const end = checkIn.check_out_time ? parseISO(checkIn.check_out_time) : new Date();
    const minutes = differenceInMinutes(end, start);
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getDwellTimeColor = (checkIn: CheckIn): string => {
    const start = parseISO(checkIn.check_in_time);
    const end = checkIn.check_out_time ? parseISO(checkIn.check_out_time) : new Date();
    const minutes = differenceInMinutes(end, start);
    
    if (minutes < 30) return 'text-green-600';
    if (minutes < 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const colors = {
      checked_in: 'bg-green-100 text-green-800',
      checked_out: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CSR Dashboard</h1>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-1">Logged in as: {userEmail}</p>
              )}
            </div>
            <div className="flex gap-3">
              <Link
                href="/logs"
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
              >
                View Logs
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Check-ins</h3>
            <p className="text-3xl font-bold mt-2">{checkIns.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Currently Checked In</h3>
            <p className="text-3xl font-bold mt-2 text-green-600">
              {checkIns.filter(ci => ci.status === 'checked_in').length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Checked Out</h3>
            <p className="text-3xl font-bold mt-2 text-gray-600">
              {checkIns.filter(ci => ci.status === 'checked_out').length}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold">Recent Check-ins</h2>
          </div>
          
          {checkIns.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No check-ins found
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {checkIns.map((ci) => {
                const dwell = calculateDwellTime(ci);
                const dwellColor = getDwellTimeColor(ci);
                return (
                  <div key={ci.id} className="bg-white border rounded-lg p-4 shadow-sm flex flex-col">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-lg font-semibold">Check-in #{ci.id.slice(0, 8)}</div>
                        <div className="text-sm text-gray-600">
                          Check-in: {format(parseISO(ci.check_in_time), 'yyyy-MM-dd HH:mm')}
                        </div>
                        {ci.check_out_time && (
                          <div className="text-sm text-gray-600">
                            Check-out: {format(parseISO(ci.check_out_time), 'yyyy-MM-dd HH:mm')}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={ci.status} />
                    </div>

                    {ci.driver_name && (
                      <div className="mt-3 text-sm">
                        <span className="font-medium">Driver:</span> {ci.driver_name}
                      </div>
                    )}
                    {ci.company && (
                      <div className="text-sm">
                        <span className="font-medium">Company:</span> {ci.company}
                      </div>
                    )}
                    {ci.purpose && (
                      <div className="text-sm">
                        <span className="font-medium">Purpose:</span> {ci.purpose}
                      </div>
                    )}

                    {ci.dock_number && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-sm">
                          <span className="font-medium">Dock:</span> {ci.dock_number}
                        </div>
                        {ci.appointment_time && (
                          <div className="text-sm">
                            <span className="font-medium">Appointment:</span>{' '}
                            {format(parseISO(ci.appointment_time), 'MMM dd, HH:mm')}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Dwell Time:</span>
                        <span className={`text-sm font-bold ${dwellColor}`}>{dwell}</span>
                      </div>
                    </div>

                    {ci.status === 'checked_in' && (
                      <div className="mt-4 space-y-2">
                        <button
                          onClick={() => handleAssignDock(ci)}
                          className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
                        >
                          {ci.dock_number ? 'Update Dock' : 'Assign Dock'}
                        </button>
                        <button
                          onClick={() => handleCheckOut(ci)}
                          className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          Check Out
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isCheckOutModalOpen && selectedCheckIn && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Confirm Check Out</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to check out Check-in #{selectedCheckIn.id.slice(0, 8)}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmCheckOut}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setIsCheckOutModalOpen(false);
                  setSelectedCheckIn(null);
                }}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isDockModalOpen && selectedForDock && (
        <AssignDockModal
          checkIn={selectedForDock}
          onClose={() => {
            setIsDockModalOpen(false);
            setSelectedForDock(null);
          }}
          onSuccess={handleDockAssignSuccess}
        />
      )}
    </div>
  );
}
