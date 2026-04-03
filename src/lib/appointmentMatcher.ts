/**
 * appointmentMatcher.ts
 *
 * Shared utility for matching a check-in reference number to the correct
 * appointment when multiple appointments share a common prefix (e.g. "NR.").
 *
 * The previous approach split reference strings on whitespace/punctuation and
 * built a flat map, which caused both "NR. 2400" and "NR. 2401" to be indexed
 * under the collision key "nr." — whichever was written last would win.
 *
 * This module replaces that with a scored best-match search:
 *   3 — exact full-string match          ("NR. 2401" vs "NR. 2401")
 *   2 — one string fully contains other  ("2401"     vs "NR. 2401")
 *   1 — at least one token overlaps      (fallback partial match)
 *   0 — no match
 *
 * The appointment with the highest score wins. Ties keep the first found
 * (appointments should be pre-sorted by time ascending so earlier appts
 * don't incorrectly steal a later check-in's slot).
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
}

interface AppointmentCandidate extends AppointmentInfo {
  /** The raw sales_order or delivery value from the DB row */
  rawRef: string;
}

/**
 * Splits a reference string into an array of tokens.
 * Using an array instead of Set to avoid --downlevelIteration requirement.
 */
const tokenise = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[,;\s|]+/)
    .map(t => t.trim())
    .filter(Boolean);

/**
 * Score how well `checkInRef` matches `appointmentRef`.
 * Both inputs should already be lowercased and trimmed.
 */
const scoreMatch = (checkInRef: string, appointmentRef: string): number => {
  if (checkInRef === appointmentRef) return 3;                        // exact
  if (checkInRef.includes(appointmentRef) ||
      appointmentRef.includes(checkInRef)) return 2;                 // substring

  // Token overlap fallback — use arrays + indexOf to avoid Set iteration
  const ciTokens = tokenise(checkInRef);
  const apTokens = tokenise(appointmentRef);
  for (let i = 0; i < ciTokens.length; i++) {
    const t = ciTokens[i];
    if (t.length > 1 && apTokens.indexOf(t) !== -1) return 1;       // token overlap
  }
  return 0;
};

/**
 * Given a list of candidate appointments (each carrying the raw ref string
 * they were indexed under), returns the best-matching one for `checkInRef`,
 * or `undefined` if nothing scores above 0.
 */
export const findBestAppointment = (
  checkInRef: string,
  candidates: AppointmentCandidate[]
): AppointmentInfo | undefined => {
  const needle = checkInRef.trim().toLowerCase();
  let best: AppointmentInfo | undefined;
  let bestScore = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const score = scoreMatch(needle, candidate.rawRef.trim().toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
    if (bestScore === 3) break; // can't do better than exact
  }

  return bestScore > 0 ? best : undefined;
};

/**
 * Given all the appointment rows returned from Supabase and a list of
 * reference numbers from a check-in, returns the AppointmentInfo for the
 * best-matching appointment, or undefined.
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
  }>
): AppointmentInfo | undefined => {
  // Build a flat list of candidates — one entry per (appointment, field) pair
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
    };
    // Index the full field value — NOT individual tokens
    if (apt.sales_order && apt.sales_order.trim()) {
      candidates.push({ ...info, rawRef: apt.sales_order.trim() });
    }
    if (apt.delivery && apt.delivery.trim()) {
      candidates.push({ ...info, rawRef: apt.delivery.trim() });
    }
  }

  // Try each check-in ref in order; track the overall best score
  let best: AppointmentInfo | undefined;
  let bestScore = 0;

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const match = findBestAppointment(ref, candidates);
    if (!match) continue;

    // Re-score to get the actual score for comparison
    let score = 0;
    for (let j = 0; j < candidates.length; j++) {
      const c = candidates[j];
      if (c.time === match.time && c.date === match.date) {
        const s = scoreMatch(ref.trim().toLowerCase(), c.rawRef.trim().toLowerCase());
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
