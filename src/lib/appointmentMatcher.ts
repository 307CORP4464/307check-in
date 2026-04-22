/**
 * appointmentMatcher.ts
 *
 * Shared utility for matching a check-in reference number to the correct
 * appointment when multiple appointments share a common prefix (e.g. "NR.").
 *
 * Scoring:
 *   3 — exact full-string match          ("NR. 2401" vs "NR. 2401")
 *   2 — one string fully contains other  ("2401"     vs "NR. 2401")
 *   1 — at least one token overlaps      (fallback partial match)
 *   0 — no match
 */

export interface AppointmentInfo {
  time: string | null;
  date: string | null;
  customer: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  carrier: string | null;
  mode: string | null;
  requested_ship_date: string | null;
  notes: string | null;
}

interface AppointmentCandidate extends AppointmentInfo {
  rawRef: string;
}

/** Splits a reference string into an array of lowercase tokens. */
const tokenise = (val: string): string[] => {
  const parts = val.toLowerCase().split(/[\s,;|./-]+/);
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) result.push(parts[i]);
  }
  return result;
};

/**
 * Returns a match score 0-3 between a check-in ref and an appointment ref.
 *   3 = exact full match
 *   2 = one fully contains the other
 *   1 = token overlap
 *   0 = no match
 */
const scoreMatch = (checkInRef: string, appointmentRef: string): number => {
  const ci = checkInRef.trim().toLowerCase();
  const ap = appointmentRef.trim().toLowerCase();
  if (ci === ap) return 3;
  if (ci.includes(ap) || ap.includes(ci)) return 2;
  const ciTokens = tokenise(ci);
  const apTokens = tokenise(ap);
  for (let i = 0; i < ciTokens.length; i++) {
    if (ciTokens[i].length <= 1) continue;
    for (let j = 0; j < apTokens.length; j++) {
      if (ciTokens[i] === apTokens[j]) return 1;
    }
  }
  return 0;
};

/**
 * Finds the best-matching AppointmentInfo for a single check-in reference
 * from a flat list of candidates.
 */
export const findBestAppointment = (
  checkInRef: string,
  candidates: AppointmentCandidate[]
): AppointmentInfo | undefined => {
  const needle = checkInRef.trim().toLowerCase();
  let best: AppointmentInfo | undefined;
  let bestScore = 0;

  for (let i = 0; i < candidates.length; i++) {
    const score = scoreMatch(needle, candidates[i].rawRef.trim().toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      best = candidates[i];
    }
    if (bestScore === 3) break;
  }

  return bestScore > 0 ? best : undefined;
};

/**
 * Given all appointment rows returned from Supabase and the list of
 * reference numbers from a check-in, returns the AppointmentInfo for the
 * best-matching appointment, or undefined if none matched.
 *
 * @param refs          Reference numbers from the check-in (already split/trimmed)
 * @param appointments  Raw Supabase rows with sales_order / delivery fields
 */
export const matchAppointmentToCheckIn = (
  refs: string[],
  appointments: Array<{
    sales_order?: string | null;
    delivery?: string | null;
    appointment_time?: string | null;
    appointment_date?: string | null;
    customer?: string | null;
    ship_to_city?: string | null;
    ship_to_state?: string | null;
    carrier?: string | null;
    mode?: string | null;
    requested_ship_date?: string | null;
    notes?: string | null;
  }>
): AppointmentInfo | undefined => {
  const candidates: AppointmentCandidate[] = [];

  for (let i = 0; i < appointments.length; i++) {
    const apt = appointments[i];
    const info: AppointmentInfo = {
      time: apt.appointment_time ?? null,
      date: apt.appointment_date ?? null,
      customer: apt.customer ?? null,
      ship_to_city: apt.ship_to_city ?? null,
      ship_to_state: apt.ship_to_state ?? null,
      carrier: apt.carrier ?? null,
      mode: apt.mode ?? null,
      requested_ship_date: apt.requested_ship_date ?? null,
      notes: apt.notes ?? null,
    };
    if (apt.sales_order && apt.sales_order.trim()) {
      candidates.push({ ...info, rawRef: apt.sales_order.trim() });
    }
    if (apt.delivery && apt.delivery.trim()) {
      candidates.push({ ...info, rawRef: apt.delivery.trim() });
    }
  }

  let best: AppointmentInfo | undefined;
  let bestScore = 0;

  for (let i = 0; i < refs.length; i++) {
    const match = findBestAppointment(refs[i], candidates);
    if (!match) continue;

    let score = 0;
    for (let j = 0; j < candidates.length; j++) {
      const c = candidates[j];
      if (c.time === match.time && c.date === match.date) {
        const s = scoreMatch(refs[i].trim().toLowerCase(), c.rawRef.trim().toLowerCase());
        if (s > score) score = s;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
    if (bestScore === 3) break;
  }

  return best;
};
