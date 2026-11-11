// Tiny spaced-repetition schedule, measured in local calendar days.

export const DAY_MS = 86_400_000;

/** Local midnight of the day containing `ts`. */
export function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 'YYYY-MM-DD' in local time. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight `n` calendar days after the day containing `ts` (DST-safe). */
export function addDays(ts, n) {
  const d = new Date(dayStart(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Whole calendar days from `now` until `ts` (negative when overdue). */
export function daysUntil(ts, now) {
  return Math.round((dayStart(ts) - dayStart(now)) / DAY_MS);
}

/** First review gap after clearing a level, from first-try recall (0..1). */
export function firstInterval(recall) {
  if (recall >= 0.9) return 3;
  if (recall >= 0.7) return 2;
  return 1;
}

/** Next gap after a review: grow on a good review, reset to one day on a weak one. */
export function nextInterval(prevDays, recall) {
  if (recall < 0.8) return 1;
  return Math.min(60, Math.max(prevDays + 1, Math.round(prevDays * 2.5)));
}

export function isDue(nextReviewAt, now) {
  return nextReviewAt != null && dayStart(now) >= dayStart(nextReviewAt);
}

/** 'due now' | 'tomorrow' | 'in 3 days' */
export function describeDue(nextReviewAt, now) {
  const d = daysUntil(nextReviewAt, now);
  if (d <= 0) return 'due now';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}
