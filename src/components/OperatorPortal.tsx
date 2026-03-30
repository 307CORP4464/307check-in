'use client';
import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TIMEZONE = 'America/Indiana/Indianapolis';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckIn {
  id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: string;
  driver_name?: string;
  carrier_name?: string;
  trailer_number?: string;
  trailer_length?: string;
  load_type?: 'inbound' | 'outbound';
  reference_number?: string;
  dock_number?: string;
  appointment_time?: string | null;
  appointment_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  customer?: string;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  carrier?: string | null;
  mode?: string | null;
  notes?: string;
}

interface Operator {
  id: string;
  name: string;
  pin: string;
  role: 'operator' | 'manager';
  active: boolean;
}

interface Assignment {
  id: string;
  operator_id: string;
  check_in_id: string;
  queue_position: number;
  assigned_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  assigned_by: string;
  status: 'queued' | 'in_progress' | 'completed';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
};

const formatApptTime = (t: string | null | undefined): string => {
  if (!t) return 'N/A';
  if (t === 'work_in') return 'Work In';
  if (['LTL', 'Paid', 'Charge'].includes(t)) return t;
  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}:${t.slice(2)}`;
  return t;
};

/**
 * Priority scoring for the load queue.
 * Lower score = higher priority.
 *
 * Tiers:
 *   0–99   : On-time / early appointments  (checked in ≤ appt time)
 *   100–199: Work-ins                       (FIFO within tier)
 *   200–299: Special types (LTL/Paid/Charge)
 *   300–399: Late arrivals                  (late but still need loading)
 *   900+   : No appointment info
 *
 * Within each tier we add minutes-waited (capped at 99) so longer waits
 * bubble up without tier-hopping.
 */
const getPriorityScore = (checkIn: CheckIn): number => {
  const now = Date.now();
  const checkedInMs = new Date(checkIn.check_in_time).getTime();
  const waitedMins = Math.min(Math.floor((now - checkedInMs) / 60000), 99);

  const appt = checkIn.appointment_time;
  if (!appt || appt === 'null') return 900 + waitedMins;

  if (appt === 'work_in' || appt === 'Work In') return 100 + (99 - waitedMins); // longer wait = higher priority within WI

  if (['LTL', 'Paid', 'Charge'].includes(appt)) return 200 + waitedMins;

  if (/^\d{4}$/.test(appt)) {
    const aptHour = parseInt(appt.slice(0, 2));
    const aptMin = parseInt(appt.slice(2));
    const now2 = new Date();
    const aptMs = new Date(
      now2.getFullYear(), now2.getMonth(), now2.getDate(), aptHour, aptMin
    ).getTime();
    const checkInMs2 = new Date(checkIn.check_in_time).getTime();
    const lateByMins = Math.floor((checkInMs2 - aptMs) / 60000);

    if (lateByMins <= 0) return 0 + (99 - waitedMins);   // on time: reward longer wait
    return 300 + Math.min(lateByMins, 99);               // late: penalise by how late
  }

  return 900 + waitedMins;
};

const getPriorityLabel = (checkIn: CheckIn): { label: string; color: string } => {
  const score = getPriorityScore(checkIn);
  if (score < 100) return { label: 'On Time', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  if (score < 200) return { label: 'Work In', color: 'bg-sky-100 text-sky-800 border-sky-200' };
  if (score < 300) return { label: 'Special', color: 'bg-violet-100 text-violet-800 border-violet-200' };
  if (score < 900) return { label: 'Late', color: 'bg-amber-100 text-amber-800 border-amber-200' };
  return { label: 'No Appt', color: 'bg-gray-100 text-gray-600 border-gray-200' };
};

const elapsed = (from: string): string => {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ── Seed operators (replace with your DB table) ────────────────────────────────
// In production these live in an `operators` table in Supabase.
// For now we keep a local fallback so the UI works without DB changes.
const DEFAULT_OPERATORS: Operator[] = [
  { id: 'op1', name: 'Alex R.', pin: '1111', role: 'operator', active: true },
  { id: 'op2', name: 'Jordan M.', pin: '2222', role: 'operator', active: true },
  { id: 'op3', name: 'Casey T.', pin: '3333', role: 'operator', active: true },
  { id: 'mgr1', name: 'Manager', pin: '9999', role: 'manager', active: true },
];

// ── Operator Login Screen ─────────────────────────────────────────────────────

interface LoginProps {
  operators: Operator[];
  onLogin: (op: Operator) => void;
}

function OperatorLogin({ operators, onLogin }: LoginProps) {
  const [selectedOp, setSelectedOp] = useState<Operator | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handlePinKey = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4 && selectedOp) {
      if (next === selectedOp.pin) {
        setError('');
        onLogin(selectedOp);
      } else {
        setError('Incorrect PIN. Try again.');
        setTimeout(() => { setPin(''); setError(''); }, 1200);
      }
    }
  };

  const handleBack = () => {
    setPin(p => p.slice(0, -1));
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 mb-4 shadow-lg shadow-blue-500/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Operator Portal</h1>
          <p className="text-slate-400 text-sm mt-1">Loading Dock Management</p>
        </div>

        <div className="bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700">
          {!selectedOp ? (
            /* Operator Selection */
            <div className="p-6">
              <p className="text-slate-300 text-sm font-medium mb-4 text-center">Select your name to continue</p>
              <div className="space-y-2">
                {operators.filter(o => o.active).map(op => (
                  <button
                    key={op.id}
                    onClick={() => { setSelectedOp(op); setPin(''); setError(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-blue-500 transition-all group"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${op.role === 'manager' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
                      {op.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="text-white font-medium text-sm">{op.name}</div>
                      <div className="text-slate-400 text-xs capitalize">{op.role}</div>
                    </div>
                    <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* PIN Entry */
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => { setSelectedOp(null); setPin(''); setError(''); }} className="text-slate-400 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedOp.role === 'manager' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
                    {selectedOp.name.charAt(0)}
                  </div>
                  <span className="text-white font-medium">{selectedOp.name}</span>
                </div>
              </div>

              <p className="text-slate-300 text-sm text-center mb-4">Enter your 4-digit PIN</p>

              {/* PIN dots */}
              <div className="flex justify-center gap-3 mb-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-blue-400 border-blue-400 scale-110' : 'border-slate-500'}`} />
                ))}
              </div>

              {error && <p className="text-red-400 text-xs text-center mb-3 animate-pulse">{error}</p>}

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
                  <button
                    key={i}
                    onClick={() => key === '⌫' ? handleBack() : key !== '' ? handlePinKey(key) : undefined}
                    disabled={key === ''}
                    className={`h-12 rounded-xl text-lg font-medium transition-all ${
                      key === '' ? 'invisible' :
                      key === '⌫' ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:scale-95' :
                      'bg-slate-700 text-white hover:bg-blue-600 active:scale-95 active:bg-blue-700'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Load Card ─────────────────────────────────────────────────────────────────

interface LoadCardProps {
  checkIn: CheckIn;
  assignment: Assignment;
  position: number;
  isActive: boolean;
  onStart: () => void;
  onComplete: () => void;
}

function LoadCard({ checkIn, assignment, position, isActive, onStart, onComplete }: LoadCardProps) {
  const priority = getPriorityLabel(checkIn);
  const [tick, setTick] = useState(0);

  // Re-render every minute so elapsed time stays fresh
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const isInProgress = assignment.status === 'in_progress';
  const isQueued = assignment.status === 'queued';

  return (
    <div className={`rounded-2xl border transition-all ${
      isActive && isInProgress
        ? 'bg-white border-blue-300 shadow-lg shadow-blue-100 ring-2 ring-blue-200'
        : isActive && isQueued
        ? 'bg-white border-slate-200 shadow-md'
        : 'bg-slate-50 border-slate-200 opacity-75'
    }`}>
      {/* Card header */}
      <div className={`px-4 py-2.5 rounded-t-2xl flex items-center justify-between ${
        isInProgress ? 'bg-blue-600' : 'bg-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            isInProgress ? 'bg-blue-400 text-white' : 'bg-slate-500 text-white'
          }`}>{position}</span>
          <span className="text-white font-semibold text-sm">
            {isInProgress ? '● Loading in progress' : isQueued && position === 1 ? 'Up next' : `Queue position ${position}`}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priority.color}`}>
          {priority.label}
        </span>
      </div>

      {/* Card body */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Reference #</p>
            <p className="font-bold text-slate-900 text-base">{checkIn.reference_number || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Door</p>
            <p className="font-bold text-slate-900 text-base">
              {checkIn.dock_number === 'Ramp' ? 'Ramp' : checkIn.dock_number ? `Door ${checkIn.dock_number}` : 'TBD'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Carrier</p>
            <p className="font-semibold text-slate-700">{checkIn.carrier_name || checkIn.carrier || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Trailer</p>
            <p className="font-semibold text-slate-700">
              {checkIn.trailer_number || 'N/A'}
              {checkIn.trailer_length ? ` (${checkIn.trailer_length}')` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Appointment</p>
            <p className="font-semibold text-slate-700">{formatApptTime(checkIn.appointment_time)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Check-in</p>
            <p className="font-semibold text-slate-700">{formatTime(checkIn.check_in_time)}</p>
          </div>
          {(checkIn.ship_to_city || checkIn.ship_to_state) && (
            <div className="col-span-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Destination</p>
              <p className="font-semibold text-slate-700">
                {[checkIn.ship_to_city, checkIn.ship_to_state].filter(Boolean).join(', ')}
              </p>
            </div>
          )}
          {checkIn.customer && (
            <div className="col-span-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Customer</p>
              <p className="font-semibold text-slate-700">{checkIn.customer}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Type</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              checkIn.load_type === 'inbound' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
            }`}>
              {checkIn.load_type === 'inbound' ? 'Inbound' : 'Outbound'}
            </span>
          </div>
          {checkIn.mode && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Mode</p>
              <p className="font-semibold text-slate-700">{checkIn.mode}</p>
            </div>
          )}
        </div>

        {/* Timing info */}
        {isInProgress && assignment.started_at && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-blue-700 text-sm font-medium">
              Started at {formatTime(assignment.started_at)} · {elapsed(assignment.started_at)} elapsed
            </span>
          </div>
        )}

        {/* Action buttons */}
        {isActive && (
          <div className="flex gap-2">
            {isQueued && position === 1 && (
              <button
                onClick={onStart}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-sm transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Load
              </button>
            )}
            {isInProgress && (
              <button
                onClick={onComplete}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-sm transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Complete Load
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manager Assignment Panel ───────────────────────────────────────────────────

interface ManagerPanelProps {
  operators: Operator[];
  unassignedLoads: CheckIn[];
  assignments: Assignment[];
  allCheckIns: CheckIn[];
  onAssign: (checkInId: string, operatorId: string) => void;
  onUnassign: (assignmentId: string) => void;
  onReorder: (assignmentId: string, direction: 'up' | 'down') => void;
}

function ManagerPanel({ operators, unassignedLoads, assignments, allCheckIns, onAssign, onUnassign, onReorder }: ManagerPanelProps) {
  const [selectedOp, setSelectedOp] = useState<string>(operators.filter(o => o.role === 'operator')[0]?.id || '');
  const [tab, setTab] = useState<'queue' | 'unassigned'>('queue');

  const opAssignments = assignments
    .filter(a => a.operator_id === selectedOp && a.status !== 'completed')
    .sort((a, b) => a.queue_position - b.queue_position);

  const getCheckIn = (id: string) => allCheckIns.find(c => c.id === id);

  const sortedUnassigned = [...unassignedLoads].sort((a, b) => getPriorityScore(a) - getPriorityScore(b));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-sm">Manager View</h1>
            <p className="text-slate-400 text-xs">Load Assignment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-1 rounded-lg border border-amber-500/30">
            {unassignedLoads.length} unassigned
          </span>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Operator selector */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-2">Select Operator</p>
          <div className="flex flex-wrap gap-2">
            {operators.filter(o => o.role === 'operator' && o.active).map(op => (
              <button
                key={op.id}
                onClick={() => setSelectedOp(op.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                  selectedOp === op.id
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  selectedOp === op.id ? 'bg-blue-400 text-white' : 'bg-slate-200 text-slate-600'
                }`}>{op.name.charAt(0)}</div>
                {op.name}
                <span className={`text-xs rounded-full px-1.5 ${
                  selectedOp === op.id ? 'bg-blue-500 text-blue-100' : 'bg-slate-200 text-slate-500'
                }`}>
                  {assignments.filter(a => a.operator_id === op.id && a.status !== 'completed').length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-200 rounded-xl p-1 mb-4">
          <button
            onClick={() => setTab('queue')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'queue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {selectedOp ? operators.find(o => o.id === selectedOp)?.name.split(' ')[0] + "'s Queue" : 'Queue'}
            {opAssignments.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs rounded-full px-1.5">{opAssignments.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('unassigned')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'unassigned' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Unassigned
            {unassignedLoads.length > 0 && (
              <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs rounded-full px-1.5">{unassignedLoads.length}</span>
            )}
          </button>
        </div>

        {tab === 'queue' && (
          <div className="space-y-2">
            {opAssignments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-slate-400 text-sm">No loads assigned yet.</p>
                <button onClick={() => setTab('unassigned')} className="mt-2 text-blue-600 text-sm hover:underline">
                  View unassigned loads →
                </button>
              </div>
            ) : opAssignments.map((asgn, idx) => {
              const ci = getCheckIn(asgn.check_in_id);
              if (!ci) return null;
              const priority = getPriorityLabel(ci);
              return (
                <div key={asgn.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-3 ${
                  asgn.status === 'in_progress' ? 'border-blue-300 shadow-md' : 'border-slate-200'
                }`}>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => onReorder(asgn.id, 'up')}
                      disabled={idx === 0}
                      className="w-6 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onReorder(asgn.id, 'down')}
                      disabled={idx === opAssignments.length - 1}
                      className="w-6 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    asgn.status === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>{idx + 1}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{ci.reference_number || 'N/A'}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${priority.color}`}>{priority.label}</span>
                      {asgn.status === 'in_progress' && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                          In Progress
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {ci.dock_number ? `Door ${ci.dock_number}` : 'No door'} · {ci.carrier_name || ci.carrier || 'N/A'} · {formatApptTime(ci.appointment_time)}
                    </p>
                  </div>

                  <button
                    onClick={() => onUnassign(asgn.id)}
                    disabled={asgn.status === 'in_progress'}
                    className="text-slate-300 hover:text-red-500 disabled:opacity-20 transition-colors p-1"
                    title="Remove from queue"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'unassigned' && (
          <div className="space-y-2">
            {sortedUnassigned.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-slate-400 text-sm">All checked-in loads have been assigned. 🎉</p>
              </div>
            ) : sortedUnassigned.map((ci) => {
              const priority = getPriorityLabel(ci);
              return (
                <div key={ci.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{ci.reference_number || 'N/A'}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${priority.color}`}>{priority.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        ci.load_type === 'inbound' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                      }`}>{ci.load_type === 'inbound' ? 'Inbound' : 'Outbound'}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ci.dock_number ? `Door ${ci.dock_number}` : 'No door'} · {ci.carrier_name || ci.carrier || 'N/A'}
                      · Appt: {formatApptTime(ci.appointment_time)} · Checked in: {formatTime(ci.check_in_time)}
                    </p>
                  </div>
                  <button
                    onClick={() => selectedOp && onAssign(ci.id, selectedOp)}
                    disabled={!selectedOp}
                    className="shrink-0 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold transition-all disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Assign
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Operator Dashboard ────────────────────────────────────────────────────────

interface OperatorDashboardProps {
  operator: Operator;
  assignments: Assignment[];
  allCheckIns: CheckIn[];
  onStart: (assignmentId: string) => void;
  onComplete: (assignmentId: string) => void;
  onLogout: () => void;
}

function OperatorDashboard({ operator, assignments, allCheckIns, onStart, onComplete, onLogout }: OperatorDashboardProps) {
  const myAssignments = assignments
    .filter(a => a.operator_id === operator.id && a.status !== 'completed')
    .sort((a, b) => a.queue_position - b.queue_position);

  const completedToday = assignments.filter(
    a => a.operator_id === operator.id && a.status === 'completed'
  ).length;

  const getCheckIn = (id: string) => allCheckIns.find(c => c.id === id);
  const inProgress = myAssignments.find(a => a.status === 'in_progress');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {operator.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-white font-bold text-sm leading-none">{operator.name}</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {completedToday > 0 ? `${completedToday} completed today` : 'No loads completed yet'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {inProgress && (
            <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/30 rounded-lg px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-300 text-xs font-medium">Loading</span>
            </div>
          )}
          <button onClick={onLogout} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors">
            Log out
          </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {myAssignments.length === 0 ? (
          <div className="mt-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-slate-700 font-semibold mb-1">No loads assigned</h3>
            <p className="text-slate-400 text-sm">Your manager will assign loads shortly.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {myAssignments.map((asgn, idx) => {
              const ci = getCheckIn(asgn.check_in_id);
              if (!ci) return null;
              return (
                <LoadCard
                  key={asgn.id}
                  checkIn={ci}
                  assignment={asgn}
                  position={idx + 1}
                  isActive={idx === 0 || asgn.status === 'in_progress'}
                  onStart={() => onStart(asgn.id)}
                  onComplete={() => onComplete(asgn.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root: OperatorPortal ───────────────────────────────────────────────────────

export default function OperatorPortal() {
  const [operators] = useState<Operator[]>(DEFAULT_OPERATORS);
  const [currentUser, setCurrentUser] = useState<Operator | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load today's active check-ins ─────────────────────────────────────────
  const fetchCheckIns = useCallback(async () => {
    try {
      const now = new Date();
      const tz = TIMEZONE;
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      const today = `${y}-${m}-${d}`;

      const { zonedTimeToUtc } = await import('date-fns-tz');
      const start = zonedTimeToUtc(`${today} 00:00:00`, tz);
      const end = zonedTimeToUtc(`${today} 23:59:59`, tz);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', start.toISOString())
        .lte('check_in_time', end.toISOString())
        .is('end_time', null)           // only loads not yet completed
        .neq('status', 'denied')
        .neq('status', 'turned_away')
        .neq('status', 'rejected')
        .order('check_in_time', { ascending: true });

      if (!error && data) setCheckIns(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load assignments from Supabase (or localStorage fallback) ─────────────
  const fetchAssignments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('operator_assignments')
        .select('*')
        .neq('status', 'completed');

      if (!error && data) {
        setAssignments(data);
        return;
      }
    } catch { /* table may not exist yet */ }

    // Fallback: session storage so state survives page refresh during dev
    try {
      const raw = sessionStorage.getItem('op_assignments');
      if (raw) setAssignments(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persistAssignments = (next: Assignment[]) => {
    setAssignments(next);
    try { sessionStorage.setItem('op_assignments', JSON.stringify(next)); } catch { /* ignore */ }
    // Also upsert to Supabase if the table exists
    supabase.from('operator_assignments').upsert(next).then(() => { /* fire and forget */ });
  };

  useEffect(() => {
    fetchCheckIns();
    fetchAssignments();

    const channel = supabase
      .channel('operator_portal_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, fetchCheckIns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operator_assignments' }, fetchAssignments)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCheckIns, fetchAssignments]);

  // ── Assignment actions ────────────────────────────────────────────────────

  const handleAssign = (checkInId: string, operatorId: string) => {
    const opAsgns = assignments.filter(a => a.operator_id === operatorId && a.status !== 'completed');
    const maxPos = opAsgns.reduce((max, a) => Math.max(max, a.queue_position), 0);

    const newAsgn: Assignment = {
      id: `asgn_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      operator_id: operatorId,
      check_in_id: checkInId,
      queue_position: maxPos + 1,
      assigned_at: new Date().toISOString(),
      assigned_by: currentUser?.id || 'system',
      status: 'queued',
      started_at: null,
      completed_at: null,
    };
    persistAssignments([...assignments, newAsgn]);
  };

  const handleUnassign = (assignmentId: string) => {
    const next = assignments.filter(a => a.id !== assignmentId);
    // Re-number positions for that operator
    const removed = assignments.find(a => a.id === assignmentId);
    if (removed) {
      const renumbered = next.map(a => {
        if (a.operator_id === removed.operator_id && a.queue_position > removed.queue_position) {
          return { ...a, queue_position: a.queue_position - 1 };
        }
        return a;
      });
      persistAssignments(renumbered);
    } else {
      persistAssignments(next);
    }
  };

  const handleReorder = (assignmentId: string, direction: 'up' | 'down') => {
    const asgn = assignments.find(a => a.id === assignmentId);
    if (!asgn || asgn.status === 'in_progress') return;

    const opAsgns = assignments
      .filter(a => a.operator_id === asgn.operator_id && a.status !== 'completed')
      .sort((a, b) => a.queue_position - b.queue_position);

    const idx = opAsgns.findIndex(a => a.id === assignmentId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= opAsgns.length) return;
    if (opAsgns[swapIdx].status === 'in_progress') return;

    const swapped = [...assignments];
    const aIdx = swapped.findIndex(a => a.id === opAsgns[idx].id);
    const bIdx = swapped.findIndex(a => a.id === opAsgns[swapIdx].id);
    const posA = swapped[aIdx].queue_position;
    swapped[aIdx] = { ...swapped[aIdx], queue_position: swapped[bIdx].queue_position };
    swapped[bIdx] = { ...swapped[bIdx], queue_position: posA };
    persistAssignments(swapped);
  };

  const handleStart = (assignmentId: string) => {
    const next = assignments.map(a =>
      a.id === assignmentId ? { ...a, status: 'in_progress' as const, started_at: new Date().toISOString() } : a
    );
    persistAssignments(next);

    // Also write start_time back to check_in row
    const asgn = assignments.find(a => a.id === assignmentId);
    if (asgn) {
      supabase.from('check_ins')
        .update({ start_time: new Date().toISOString(), status: 'in_progress' })
        .eq('id', asgn.check_in_id)
        .then(() => { /* fire and forget */ });
    }
  };

  const handleComplete = (assignmentId: string) => {
    const now = new Date().toISOString();
    const asgn = assignments.find(a => a.id === assignmentId);
    const next = assignments.map(a =>
      a.id === assignmentId ? { ...a, status: 'completed' as const, completed_at: now } : a
    );
    persistAssignments(next);

    // Write end_time back to check_in row
    if (asgn) {
      supabase.from('check_ins')
        .update({ end_time: now, status: 'unloaded' })
        .eq('id', asgn.check_in_id)
        .then(() => { fetchCheckIns(); });
    }
  };

  // ── Derived: unassigned loads ─────────────────────────────────────────────
  const assignedCheckInIds = new Set(
    assignments.filter(a => a.status !== 'completed').map(a => a.check_in_id)
  );
  const unassignedLoads = checkIns.filter(ci => !assignedCheckInIds.has(ci.id));

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!currentUser) {
    return <OperatorLogin operators={operators} onLogin={setCurrentUser} />;
  }

  if (currentUser.role === 'manager') {
    return (
      <div>
        <ManagerPanel
          operators={operators}
          unassignedLoads={unassignedLoads}
          assignments={assignments}
          allCheckIns={checkIns}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onReorder={handleReorder}
        />
        <div className="fixed bottom-4 right-4">
          <button
            onClick={() => setCurrentUser(null)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl border border-slate-600 shadow-lg transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <OperatorDashboard
      operator={currentUser}
      assignments={assignments}
      allCheckIns={checkIns}
      onStart={handleStart}
      onComplete={handleComplete}
      onLogout={() => setCurrentUser(null)}
    />
  );
}
