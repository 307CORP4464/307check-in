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
      timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch { return '—'; }
};

const formatApptTime = (t: string | null | undefined): string => {
  if (!t) return 'N/A';
  if (t === 'work_in') return 'Work In';
  if (['LTL', 'Paid', 'Charge'].includes(t)) return t;
  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}:${t.slice(2)}`;
  return t;
};

const elapsed = (from: string): string => {
  const ms = Date.now() - new Date(from).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * Priority scoring — lower = higher priority.
 *
 * Tier   0–99  : On-time / early appointments (reward longer wait within tier)
 * Tier 100–199 : Work-ins (FIFO by wait time)
 * Tier 200–299 : Special types (LTL / Paid / Charge)
 * Tier 300–399 : Late arrivals (penalised by lateness, never dropped)
 * Tier 900+    : No appointment info
 *
 * Auto-assign ONLY fires when an operator completes a load — never proactively.
 */
const getPriorityScore = (checkIn: CheckIn): number => {
  const checkedInMs = new Date(checkIn.check_in_time).getTime();
  const waitedMins  = Math.min(Math.floor((Date.now() - checkedInMs) / 60000), 99);
  const appt        = checkIn.appointment_time;

  if (!appt || appt === 'null') return 900 + waitedMins;
  if (appt === 'work_in' || appt === 'Work In') return 100 + (99 - waitedMins);
  if (['LTL', 'Paid', 'Charge'].includes(appt)) return 200 + waitedMins;

  if (/^\d{4}$/.test(appt)) {
    const now2   = new Date();
    const aptMs  = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(),
                            parseInt(appt.slice(0, 2)), parseInt(appt.slice(2))).getTime();
    const lateBy = Math.floor((checkedInMs - aptMs) / 60000);
    return lateBy <= 0 ? (99 - waitedMins) : 300 + Math.min(lateBy, 99);
  }
  return 900 + waitedMins;
};

const getPriorityLabel = (ci: CheckIn): { label: string; color: string } => {
  const s = getPriorityScore(ci);
  if (s < 100) return { label: 'On Time', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  if (s < 200) return { label: 'Work In', color: 'bg-sky-100 text-sky-800 border-sky-200' };
  if (s < 300) return { label: 'Special', color: 'bg-violet-100 text-violet-800 border-violet-200' };
  if (s < 900) return { label: 'Late',    color: 'bg-amber-100 text-amber-800 border-amber-200' };
  return             { label: 'No Appt', color: 'bg-gray-100 text-gray-600 border-gray-200' };
};

// ── Default operators ─────────────────────────────────────────────────────────
// Replace with a Supabase fetch once the `operators` table is live.
const DEFAULT_OPERATORS: Operator[] = [
  { id: 'op1',  name: 'Alex R.',   pin: '1111', role: 'operator', active: true },
  { id: 'op2',  name: 'Jordan M.', pin: '2222', role: 'operator', active: true },
  { id: 'op3',  name: 'Casey T.',  pin: '3333', role: 'operator', active: true },
  { id: 'mgr1', name: 'Manager',   pin: '9999', role: 'manager',  active: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────

function OperatorLogin({ operators, onLogin }: { operators: Operator[]; onLogin: (op: Operator) => void }) {
  const [selected, setSelected] = useState<Operator | null>(null);
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState('');

  const handlePinKey = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4 && selected) {
      if (next === selected.pin) { setError(''); onLogin(selected); }
      else {
        setError('Incorrect PIN. Try again.');
        setTimeout(() => { setPin(''); setError(''); }, 1200);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 mb-4 shadow-lg shadow-blue-500/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Operator Portal</h1>
          <p className="text-slate-400 text-sm mt-1">Loading Dock Management</p>
        </div>

        <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700">
          {!selected ? (
            <div className="p-6">
              <p className="text-slate-300 text-sm font-medium mb-4 text-center">Select your name to continue</p>
              <div className="space-y-2">
                {operators.filter(o => o.active).map(op => (
                  <button key={op.id} onClick={() => { setSelected(op); setPin(''); setError(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-blue-500 transition-all group">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${op.role === 'manager' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
                      {op.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="text-white font-medium text-sm">{op.name}</div>
                      <div className="text-slate-400 text-xs capitalize">{op.role}</div>
                    </div>
                    <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => { setSelected(null); setPin(''); setError(''); }} className="text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selected.role === 'manager' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
                    {selected.name.charAt(0)}
                  </div>
                  <span className="text-white font-medium">{selected.name}</span>
                </div>
              </div>
              <p className="text-slate-300 text-sm text-center mb-4">Enter your 4-digit PIN</p>
              <div className="flex justify-center gap-3 mb-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-blue-400 border-blue-400 scale-110' : 'border-slate-500'}`} />
                ))}
              </div>
              {error && <p className="text-red-400 text-xs text-center mb-3 animate-pulse">{error}</p>}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
                  <button key={i}
                    onClick={() => key === '⌫' ? setPin(p => p.slice(0,-1)) : key !== '' ? handlePinKey(key) : undefined}
                    disabled={key === ''}
                    className={`h-12 rounded-xl text-lg font-medium transition-all ${
                      key === ''  ? 'invisible' :
                      key === '⌫' ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:scale-95' :
                                    'bg-slate-700 text-white hover:bg-blue-600 active:scale-95 active:bg-blue-700'
                    }`}>{key}
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

// ─────────────────────────────────────────────────────────────────────────────
// LOAD CARD  (shared between operator dashboard and manager board)
// ─────────────────────────────────────────────────────────────────────────────

function LoadCard({ checkIn, assignment, position, isActive, onStart, onComplete }: {
  checkIn: CheckIn; assignment: Assignment; position: number;
  isActive: boolean; onStart: () => void; onComplete: () => void;
}) {
  const priority    = getPriorityLabel(checkIn);
  const isIP        = assignment.status === 'in_progress';
  const isQueued    = assignment.status === 'queued';
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t); }, []);

  return (
    <div className={`rounded-2xl border transition-all ${
      isIP      ? 'bg-white border-blue-300 shadow-lg ring-2 ring-blue-200'
      : isActive ? 'bg-white border-slate-200 shadow-md'
      :            'bg-slate-50 border-slate-200 opacity-70'
    }`}>
      <div className={`px-4 py-2.5 rounded-t-2xl flex items-center justify-between ${isIP ? 'bg-blue-600' : 'bg-slate-700'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isIP ? 'bg-blue-400 text-white' : 'bg-slate-500 text-white'}`}>{position}</span>
          <span className="text-white font-semibold text-sm">
            {isIP ? '● Loading in progress' : position === 1 ? 'Up next' : `Queue position ${position}`}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priority.color}`}>{priority.label}</span>
      </div>

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
            <p className="font-semibold text-slate-700">{checkIn.trailer_number || 'N/A'}{checkIn.trailer_length ? ` (${checkIn.trailer_length}')` : ''}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Appointment</p>
            <p className="font-semibold text-slate-700">{formatApptTime(checkIn.appointment_time)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Check-in</p>
            <p className="font-semibold text-slate-700">{formatTime(checkIn.check_in_time)}</p>
          </div>
          {checkIn.customer && (
            <div className="col-span-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Customer</p>
              <p className="font-semibold text-slate-700">{checkIn.customer}</p>
            </div>
          )}
          {(checkIn.ship_to_city || checkIn.ship_to_state) && (
            <div className="col-span-2">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Destination</p>
              <p className="font-semibold text-slate-700">{[checkIn.ship_to_city, checkIn.ship_to_state].filter(Boolean).join(', ')}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Type</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${checkIn.load_type === 'inbound' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
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

        {isIP && assignment.started_at && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-blue-700 text-sm font-medium">
              Started {formatTime(assignment.started_at)} · {elapsed(assignment.started_at)} elapsed
            </span>
          </div>
        )}

        {isActive && (
          <div className="flex gap-2">
            {isQueued && position === 1 && (
              <button onClick={onStart}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Load
              </button>
            )}
            {isIP && (
              <button onClick={onComplete}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2">
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

// ─────────────────────────────────────────────────────────────────────────────
// MANAGER BOARD
// Two-column layout:
//   Left  — operator lanes showing in-progress status, queue order, timing
//   Right — unassigned pool sorted by priority; tap a load then pick operator
// ─────────────────────────────────────────────────────────────────────────────

function ManagerBoard({ operators, unassignedLoads, assignments, allCheckIns, onAssign, onUnassign, onReorder, onLogout }: {
  operators: Operator[]; unassignedLoads: CheckIn[]; assignments: Assignment[];
  allCheckIns: CheckIn[];
  onAssign: (checkInId: string, operatorId: string) => void;
  onUnassign: (assignmentId: string) => void;
  onReorder: (assignmentId: string, direction: 'up' | 'down') => void;
  onLogout: () => void;
}) {
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const sortedPool   = [...unassignedLoads].sort((a, b) => getPriorityScore(a) - getPriorityScore(b));
  const activeOps    = operators.filter(o => o.role === 'operator' && o.active);
  const getCheckIn   = (id: string) => allCheckIns.find(c => c.id === id);
  const getOpQueue   = (opId: string) =>
    assignments.filter(a => a.operator_id === opId && a.status !== 'completed')
               .sort((a, b) => a.queue_position - b.queue_position);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-3 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-none">Manager Board</h1>
            <p className="text-slate-400 text-xs mt-0.5">Live load assignment &amp; queue</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {unassignedLoads.length > 0 && (
            <span className="bg-amber-500/20 text-amber-300 text-xs px-2.5 py-1 rounded-lg border border-amber-500/30 font-medium">
              {unassignedLoads.length} unassigned
            </span>
          )}
          <button onClick={onLogout} className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-slate-700 border border-slate-700 transition-colors">
            Log out
          </button>
        </div>
      </div>

      {/* Body — fixed height columns */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Operator lanes ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold px-1">Operator Queues</p>

          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
            {activeOps.map(op => {
              const queue      = getOpQueue(op.id);
              const inProgress = queue.find(a => a.status === 'in_progress');
              const ipCi       = inProgress ? getCheckIn(inProgress.check_in_id) : null;

              return (
                <div key={op.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                  {/* Lane header */}
                  <div className={`px-4 py-3 flex items-center justify-between ${inProgress ? 'bg-blue-600' : 'bg-slate-700'}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${inProgress ? 'bg-blue-400 text-white' : 'bg-slate-500 text-white'}`}>
                        {op.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm leading-none">{op.name}</p>
                        <p className="text-slate-300 text-xs mt-0.5 truncate">
                          {inProgress && ipCi ? (
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse inline-block shrink-0" />
                              {ipCi.reference_number || '—'}
                              {inProgress.started_at ? ` · ${elapsed(inProgress.started_at)}` : ''}
                              {ipCi.dock_number ? ` · Door ${ipCi.dock_number}` : ''}
                            </span>
                          ) : queue.length > 0 ? `${queue.length} in queue` : 'Available — no loads assigned'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                      inProgress         ? 'bg-blue-500/40 text-blue-100'
                      : queue.length > 0 ? 'bg-slate-500/40 text-slate-300'
                      :                    'bg-emerald-500/30 text-emerald-300'
                    }`}>
                      {inProgress ? 'Active' : queue.length > 0 ? `${queue.length} queued` : 'Free'}
                    </span>
                  </div>

                  {/* Queue rows */}
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {queue.length === 0 ? (
                      <div className="px-4 py-5 text-center text-slate-400 text-xs">No loads assigned</div>
                    ) : queue.map((asgn, idx) => {
                      const ci = getCheckIn(asgn.check_in_id);
                      if (!ci) return null;
                      const pr  = getPriorityLabel(ci);
                      const isIP = asgn.status === 'in_progress';
                      return (
                        <div key={asgn.id} className={`px-3 py-2.5 flex items-center gap-2 ${isIP ? 'bg-blue-50' : ''}`}>
                          {/* Reorder controls + position badge */}
                          <div className="flex flex-col items-center gap-0 shrink-0">
                            <button onClick={() => onReorder(asgn.id, 'up')} disabled={idx === 0 || isIP}
                              className="w-5 h-4 flex items-center justify-center text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isIP ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                              {idx + 1}
                            </span>
                            <button onClick={() => onReorder(asgn.id, 'down')} disabled={idx === queue.length - 1 || isIP}
                              className="w-5 h-4 flex items-center justify-center text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>

                          {/* Load detail */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{ci.reference_number || 'N/A'}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${pr.color}`}>{pr.label}</span>
                              {isIP && inProgress?.started_at && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                                  {elapsed(inProgress.started_at)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {ci.dock_number ? (ci.dock_number === 'Ramp' ? 'Ramp' : `Door ${ci.dock_number}`) : 'No door'}
                              {' · '}{ci.carrier_name || ci.carrier || 'N/A'}
                              {' · '}Appt: {formatApptTime(ci.appointment_time)}
                              {' · '}In: {formatTime(ci.check_in_time)}
                            </p>
                          </div>

                          {/* Remove (disabled while in progress) */}
                          <button onClick={() => onUnassign(asgn.id)} disabled={isIP}
                            title={isIP ? 'Cannot remove an in-progress load' : 'Remove from queue'}
                            className="text-slate-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors p-1 shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Unassigned pool ── */}
        <div className="w-80 xl:w-96 shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Unassigned Loads</p>
            <p className="text-slate-400 text-xs mt-0.5">Priority-sorted · select a load then choose an operator</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sortedPool.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-slate-500 text-sm font-medium">All loads assigned</p>
                <p className="text-slate-400 text-xs mt-1">New check-ins will appear here automatically.</p>
              </div>
            ) : sortedPool.map((ci, poolIdx) => {
              const pr         = getPriorityLabel(ci);
              const isSelected = assignTarget === ci.id;
              return (
                <div key={ci.id}>
                  {/* Priority rank indicator */}
                  {poolIdx === 0 && (
                    <p className="text-xs text-emerald-600 font-semibold px-1 mb-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                      </svg>
                      Highest priority
                    </p>
                  )}

                  {/* Load row */}
                  <button onClick={() => setAssignTarget(isSelected ? null : ci.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                        : 'bg-slate-50 border-slate-200 hover:border-blue-200 hover:bg-blue-50/40'
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{ci.reference_number || 'N/A'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${pr.color}`}>{pr.label}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ci.load_type === 'inbound' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                            {ci.load_type === 'inbound' ? 'IB' : 'OB'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {ci.dock_number ? (ci.dock_number === 'Ramp' ? 'Ramp' : `Door ${ci.dock_number}`) : 'No door'}
                          {' · '}{ci.carrier_name || ci.carrier || 'N/A'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Appt: {formatApptTime(ci.appointment_time)} · In: {formatTime(ci.check_in_time)}
                        </p>
                      </div>
                      <svg className={`w-4 h-4 shrink-0 mt-1 transition-transform ${isSelected ? 'rotate-180 text-blue-500' : 'text-slate-300'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Operator picker — expands on selection */}
                  {isSelected && (
                    <div className="mt-1 ml-2 p-2 bg-white rounded-xl border border-blue-200 shadow-sm">
                      <p className="text-xs text-slate-500 font-medium mb-2 px-1">Assign to:</p>
                      <div className="space-y-1">
                        {activeOps.map(op => {
                          const opQ  = getOpQueue(op.id);
                          const hasIP = opQ.some(a => a.status === 'in_progress');
                          return (
                            <button key={op.id}
                              onClick={() => { onAssign(ci.id, op.id); setAssignTarget(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-blue-600 group transition-all border border-transparent hover:border-blue-600">
                              <div className="w-7 h-7 rounded-full bg-blue-100 group-hover:bg-blue-500 flex items-center justify-center text-xs font-bold text-blue-700 group-hover:text-white transition-colors shrink-0">
                                {op.name.charAt(0)}
                              </div>
                              <div className="text-left min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-800 group-hover:text-white">{op.name}</p>
                                <p className="text-xs text-slate-400 group-hover:text-blue-200">
                                  {hasIP ? `Loading · ${opQ.length} in queue` : opQ.length > 0 ? `${opQ.length} queued` : 'Free'}
                                </p>
                              </div>
                              <svg className="w-4 h-4 text-slate-300 group-hover:text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

function OperatorDashboard({ operator, assignments, allCheckIns, onStart, onComplete, onLogout }: {
  operator: Operator; assignments: Assignment[]; allCheckIns: CheckIn[];
  onStart: (id: string) => void; onComplete: (id: string) => void; onLogout: () => void;
}) {
  const myQueue = assignments
    .filter(a => a.operator_id === operator.id && a.status !== 'completed')
    .sort((a, b) => a.queue_position - b.queue_position);

  const completedToday = assignments.filter(a => a.operator_id === operator.id && a.status === 'completed').length;
  const inProgress     = myQueue.find(a => a.status === 'in_progress');
  const getCheckIn     = (id: string) => allCheckIns.find(c => c.id === id);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {operator.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-white font-bold text-sm leading-none">{operator.name}</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {completedToday > 0 ? `${completedToday} load${completedToday > 1 ? 's' : ''} completed today` : 'No loads completed yet'}
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
        {myQueue.length === 0 ? (
          <div className="mt-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-slate-700 font-semibold mb-1">No loads assigned</h3>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">Your manager will assign loads, or the next available load will be queued automatically when you finish your current one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {myQueue.map((asgn, idx) => {
              const ci = getCheckIn(asgn.check_in_id);
              if (!ci) return null;
              return (
                <LoadCard key={asgn.id} checkIn={ci} assignment={asgn} position={idx + 1}
                  isActive={idx === 0 || asgn.status === 'in_progress'}
                  onStart={() => onStart(asgn.id)}
                  onComplete={() => onComplete(asgn.id)} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT — OperatorPortal
// ─────────────────────────────────────────────────────────────────────────────

export default function OperatorPortal() {
  const [operators]    = useState<Operator[]>(DEFAULT_OPERATORS);
  const [currentUser,  setCurrentUser]  = useState<Operator | null>(null);
  const [checkIns,     setCheckIns]     = useState<CheckIn[]>([]);
  const [assignments,  setAssignments]  = useState<Assignment[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Fetch today's active check-ins ────────────────────────────────────────
  const fetchCheckIns = useCallback(async () => {
    try {
      const now   = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now);
      const today = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;

      const { zonedTimeToUtc } = await import('date-fns-tz');
      const start = zonedTimeToUtc(`${today} 00:00:00`, TIMEZONE);
      const end   = zonedTimeToUtc(`${today} 23:59:59`, TIMEZONE);

      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .gte('check_in_time', start.toISOString())
        .lte('check_in_time', end.toISOString())
        .is('end_time', null)
        .not('status', 'in', '("denied","turned_away","rejected","check_in_denial")')
        .order('check_in_time', { ascending: true });

      if (!error && data) setCheckIns(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // ── Fetch active assignments ──────────────────────────────────────────────
  const fetchAssignments = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('operator_assignments').select('*').neq('status', 'completed');
      if (!error && data) { setAssignments(data); return; }
    } catch { /* table may not exist yet */ }
    try {
      const raw = sessionStorage.getItem('op_assignments');
      if (raw) setAssignments(JSON.parse(raw));
    } catch { /**/ }
  }, []);

  const persist = useCallback((next: Assignment[]) => {
    setAssignments(next);
    try { sessionStorage.setItem('op_assignments', JSON.stringify(next)); } catch { /**/ }
    supabase.from('operator_assignments').upsert(next).then(() => { /**/ });
  }, []);

  useEffect(() => {
    fetchCheckIns();
    fetchAssignments();
    const ch = supabase.channel('op_portal_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, fetchCheckIns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operator_assignments' }, fetchAssignments)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchCheckIns, fetchAssignments]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const assignedIds     = new Set(assignments.filter(a => a.status !== 'completed').map(a => a.check_in_id));
  const unassignedLoads = checkIns.filter(ci => !assignedIds.has(ci.id));

  // ── Manager actions ───────────────────────────────────────────────────────

  const handleAssign = useCallback((checkInId: string, operatorId: string) => {
    setAssignments(current => {
      const opQ  = current.filter(a => a.operator_id === operatorId && a.status !== 'completed');
      const maxP = opQ.reduce((mx, a) => Math.max(mx, a.queue_position), 0);
      const newA: Assignment = {
        id:             `asgn_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        operator_id:    operatorId,
        check_in_id:    checkInId,
        queue_position: maxP + 1,
        assigned_at:    new Date().toISOString(),
        assigned_by:    'manager',
        status:         'queued',
        started_at:     null,
        completed_at:   null,
      };
      const next = [...current, newA];
      try { sessionStorage.setItem('op_assignments', JSON.stringify(next)); } catch { /**/ }
      supabase.from('operator_assignments').upsert([newA]).then(() => { /**/ });
      return next;
    });
  }, []);

  const handleUnassign = useCallback((assignmentId: string) => {
    setAssignments(current => {
      const removed = current.find(a => a.id === assignmentId);
      const next    = current.filter(a => a.id !== assignmentId);
      const renumbered = removed
        ? next.map(a => a.operator_id === removed.operator_id && a.queue_position > removed.queue_position
            ? { ...a, queue_position: a.queue_position - 1 } : a)
        : next;
      try { sessionStorage.setItem('op_assignments', JSON.stringify(renumbered)); } catch { /**/ }
      supabase.from('operator_assignments').delete().eq('id', assignmentId).then(() => { /**/ });
      return renumbered;
    });
  }, []);

  const handleReorder = useCallback((assignmentId: string, direction: 'up' | 'down') => {
    setAssignments(current => {
      const asgn = current.find(a => a.id === assignmentId);
      if (!asgn || asgn.status === 'in_progress') return current;
      const opQ     = current.filter(a => a.operator_id === asgn.operator_id && a.status !== 'completed').sort((a, b) => a.queue_position - b.queue_position);
      const idx     = opQ.findIndex(a => a.id === assignmentId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= opQ.length || opQ[swapIdx].status === 'in_progress') return current;
      const next = [...current];
      const aI   = next.findIndex(a => a.id === opQ[idx].id);
      const bI   = next.findIndex(a => a.id === opQ[swapIdx].id);
      const posA = next[aI].queue_position;
      next[aI]   = { ...next[aI], queue_position: next[bI].queue_position };
      next[bI]   = { ...next[bI], queue_position: posA };
      try { sessionStorage.setItem('op_assignments', JSON.stringify(next)); } catch { /**/ }
      supabase.from('operator_assignments').upsert([next[aI], next[bI]]).then(() => { /**/ });
      return next;
    });
  }, []);

  // ── Operator actions ──────────────────────────────────────────────────────

  const handleStart = useCallback((assignmentId: string) => {
    const now = new Date().toISOString();
    setAssignments(current => {
      const next = current.map(a => a.id === assignmentId ? { ...a, status: 'in_progress' as const, started_at: now } : a);
      try { sessionStorage.setItem('op_assignments', JSON.stringify(next)); } catch { /**/ }
      supabase.from('operator_assignments').update({ status: 'in_progress', started_at: now }).eq('id', assignmentId).then(() => { /**/ });
      return next;
    });
    // Write start_time to check_in row
    const asgn = assignments.find(a => a.id === assignmentId);
    if (asgn) supabase.from('check_ins').update({ start_time: now, status: 'in_progress' }).eq('id', asgn.check_in_id).then(() => { /**/ });
  }, [assignments]);

  /**
   * handleComplete
   * 1. Mark assignment completed, write end_time to check_ins row.
   * 2. After check-ins refresh, if unassigned loads exist, auto-assign the
   *    top-priority one to this operator. This is the ONLY auto-assign trigger.
   */
  const handleComplete = useCallback((assignmentId: string) => {
    const now  = new Date().toISOString();
    const asgn = assignments.find(a => a.id === assignmentId);
    if (!asgn) return;

    // Mark done
    setAssignments(current => {
      const next = current.map(a => a.id === assignmentId ? { ...a, status: 'completed' as const, completed_at: now } : a);
      try { sessionStorage.setItem('op_assignments', JSON.stringify(next)); } catch { /**/ }
      supabase.from('operator_assignments').update({ status: 'completed', completed_at: now }).eq('id', assignmentId).then(() => { /**/ });
      return next;
    });

    // Write back end_time, then auto-assign next load
    supabase.from('check_ins')
      .update({ end_time: now, status: 'unloaded' })
      .eq('id', asgn.check_in_id)
      .then(() => {
        fetchCheckIns().then(() => {
          // Read freshest state to find next load
          setCheckIns(latestCIs => {
            setAssignments(latestAsgns => {
              const nowAssigned = new Set(
                latestAsgns.filter(a => a.status !== 'completed').map(a => a.check_in_id)
              );
              // Exclude the load we just finished
              nowAssigned.add(asgn.check_in_id);

              const pool = latestCIs
                .filter(ci => !nowAssigned.has(ci.id))
                .sort((a, b) => getPriorityScore(a) - getPriorityScore(b));

              // Only auto-assign if something is waiting
              if (pool.length === 0) return latestAsgns;

              const nextLoad = pool[0];
              const opQ      = latestAsgns.filter(a => a.operator_id === asgn.operator_id && a.status !== 'completed');
              const maxP     = opQ.reduce((mx, a) => Math.max(mx, a.queue_position), 0);

              const autoA: Assignment = {
                id:             `asgn_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                operator_id:    asgn.operator_id,
                check_in_id:    nextLoad.id,
                queue_position: maxP + 1,
                assigned_at:    new Date().toISOString(),
                assigned_by:    'system',
                status:         'queued',
                started_at:     null,
                completed_at:   null,
              };

              const withAuto = [...latestAsgns, autoA];
              try { sessionStorage.setItem('op_assignments', JSON.stringify(withAuto)); } catch { /**/ }
              supabase.from('operator_assignments').upsert([autoA]).then(() => { /**/ });
              return withAuto;
            });
            return latestCIs;
          });
        });
      });
  }, [assignments, fetchCheckIns]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!currentUser) return <OperatorLogin operators={operators} onLogin={setCurrentUser} />;

  if (currentUser.role === 'manager') {
    return (
      <ManagerBoard
        operators={operators}
        unassignedLoads={unassignedLoads}
        assignments={assignments}
        allCheckIns={checkIns}
        onAssign={handleAssign}
        onUnassign={handleUnassign}
        onReorder={handleReorder}
        onLogout={() => setCurrentUser(null)}
      />
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
