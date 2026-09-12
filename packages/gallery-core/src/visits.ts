export interface VisitEvidence {
  id: string;
  country: string;
  takenAt: string | null;
  localTakenAt: string | null;
  timeZone: string | null;
}
export interface InferredVisit {
  id: string;
  country: string;
  start: string | null;
  end: string | null;
  photoIds: string[];
}
export function knownTimeZone(zone: string | null | undefined) {
  if (!zone) return false;
  if (/^(UTC|GMT)([+-](\d|1[0-4])(:[0-5]\d)?)?$/.test(zone)) return true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}
export function evidenceDate(photo: VisitEvidence) {
  if (!knownTimeZone(photo.timeZone) || !photo.localTakenAt || !photo.takenAt) return null;
  const time = Date.parse(photo.takenAt),
    local = Date.parse(photo.localTakenAt);
  if (!Number.isFinite(time) || !Number.isFinite(local)) return null;
  return { time, date: new Date(local).toISOString().slice(0, 10) };
}
/** Pure inference over already authorized, country-resolved, Asset-deduplicated
 * evidence. Public IDs must be Gallery photo IDs, never Immich Asset IDs.
 */
export function inferVisits(photos: VisitEvidence[], gapDays = 30): InferredVisit[] {
  if (!Number.isInteger(gapDays) || gapDays < 1 || gapDays > 365) throw new Error('Invalid visit gap');
  const seen = new Set<string>();
  const dated: { photo: VisitEvidence; time: number; date: string }[] = [],
    unknown = new Map<string, InferredVisit>();
  for (const photo of photos) {
    if (seen.has(photo.id)) throw new Error('Visit evidence must be deduplicated');
    seen.add(photo.id);
    const date = evidenceDate(photo);
    if (date) dated.push({ photo, ...date });
    else {
      const visit = unknown.get(photo.country) ?? {
        id: `undated-${photo.country}`,
        country: photo.country,
        start: null,
        end: null,
        photoIds: [],
      };
      visit.photoIds.push(photo.id);
      unknown.set(photo.country, visit);
    }
  }
  dated.sort((a, b) => a.time - b.time || a.photo.id.localeCompare(b.photo.id));
  const visits: InferredVisit[] = [],
    last = new Map<string, { time: number; visit: InferredVisit }>();
  let recent: { country: string; time: number } | undefined, previous: typeof recent;
  for (let i = 0; i < dated.length;) {
    let end = i + 1;
    while (end < dated.length && dated[end]!.time === dated[i]!.time) end++;
    const bucket = dated.slice(i, end);
    for (const { photo, time, date } of bucket) {
      const prior = last.get(photo.country);
      const foreign = recent?.country === photo.country ? previous : recent;
      const split =
        !prior ||
        time - prior.time > gapDays * 86400000 ||
        (foreign !== undefined && foreign.time > prior.time && foreign.time < time);
      const visit = split
        ? { id: `auto-${photo.id}`, country: photo.country, start: date, end: date, photoIds: [] }
        : prior!.visit;
      if (split) visits.push(visit);
      visit.start = visit.start! < date ? visit.start : date;
      visit.end = visit.end! > date ? visit.end : date;
      visit.photoIds.push(photo.id);
      last.set(photo.country, { time, visit });
    }
    for (const { photo, time } of bucket) {
      if (recent?.country !== photo.country) {
        previous = recent;
        recent = { country: photo.country, time };
      } else recent.time = time;
    }
    i = end;
  }
  return [...visits, ...unknown.values()].sort(
    (a, b) => (b.start ?? '').localeCompare(a.start ?? '') || a.id.localeCompare(b.id),
  );
}
