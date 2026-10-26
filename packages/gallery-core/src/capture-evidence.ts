/** Clock fields are deliberately encoded in UTC; they are not an instant until a source zone is known. */
export interface CaptureEvidence {
  clock: string | null;
  explicitOffset: number | null;
  dateSource: string;
  destinationZone: string | null;
  gpsUtc: string | null;
  gpsStatus: string | null;
  gpsPositionValid: boolean;
  gpsPositionMatches: boolean;
}
export interface CaptureResult {
  status: 'verified' | 'suggested' | 'unknown' | 'conflict';
  reason: string;
  sourceZone: string | null;
  takenAt: string | null;
  localTakenAt: string | null;
  timeZone: string | null;
  gpsDifferenceSeconds: number | null;
}
export function validClock(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))
    return false;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 19) === value.slice(0, 19);
}
export function offsetZone(minutes: number) {
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
}
export function offsetMinutes(zone: string): number | null {
  if (zone === 'UTC' || zone === 'GMT') return 0;
  const m = /^(?:UTC|GMT)([+-])(\d{1,2})(?::([0-5]\d))?$/.exec(zone);
  if (!m) return null;
  const n = (Number(m[2]) * 60 + Number(m[3] ?? 0)) * (m[1] === '-' ? -1 : 1);
  return n >= -720 && n <= 840 ? n : null;
}
export function clockAt(instant: number, zone: string): string {
  const offset = offsetMinutes(zone);
  if (offset !== null) return new Date(instant + offset * 60000).toISOString();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${String(((instant % 1000) + 1000) % 1000).padStart(3, '0')}Z`;
}
export function instantForClock(clock: string, zone: string): number {
  if (!validClock(clock)) throw new Error('相机记录时间无效。');
  const wall = Date.parse(clock),
    offset = offsetMinutes(zone);
  if (offset !== null) return wall - offset * 60000;
  // Gather historical offsets on both sides of transitions; reject ambiguous/nonexistent wall clocks.
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 3) {
    const candidate = wall + h * 3600000;
    offsets.add(Date.parse(clockAt(candidate, zone)) - candidate);
  }
  const matches = [...offsets].map((o) => wall - o).filter((t) => Date.parse(clockAt(t, zone)) === wall);
  if (matches.length !== 1) throw new Error('该时间处于夏令时切换的重复或缺失时段，请改用明确的 UTC 偏移。');
  return matches[0]!;
}
export function correctedCapture(e: CaptureEvidence, sourceZone: string) {
  if (!e.clock) throw new Error('缺少相机拍摄时间，不能校正。');
  const instant = instantForClock(e.clock, sourceZone);
  return {
    takenAt: new Date(instant).toISOString(),
    localTakenAt: e.destinationZone ? clockAt(instant, e.destinationZone) : e.clock,
    timeZone: e.destinationZone,
  };
}
export function analyzeCapture(e: CaptureEvidence): CaptureResult {
  const result: CaptureResult = {
    status: 'unknown',
    reason: '缺少拍摄时区及可靠 GPS 时间，请核对相机设置。',
    sourceZone: null,
    takenAt: null,
    localTakenAt: e.clock,
    timeZone: null,
    gpsDifferenceSeconds: null,
  };
  if (!e.clock || !validClock(e.clock)) return { ...result, reason: '没有可用的相机拍摄时间。' };
  const gps = e.gpsUtc && validClock(e.gpsUtc) ? Date.parse(e.gpsUtc) : null;
  const invalidFix = !!e.gpsStatus && !['A', 'Measurement Active', 'Active'].includes(e.gpsStatus);
  const gpsUsable = gps !== null && !invalidFix && e.gpsPositionValid && e.gpsPositionMatches;
  if (e.dateSource.endsWith(':GPSDateTime') && !gpsUsable)
    return { ...result, reason: '只有 GPS 时间且定位不可核实，不能认作已确认的拍摄时间。' };
  if (e.explicitOffset !== null) {
    if (!Number.isInteger(e.explicitOffset) || e.explicitOffset < -720 || e.explicitOffset > 840)
      return { ...result, status: 'conflict', reason: '拍摄时区字段超出合法范围。' };
    const sourceZone = offsetZone(e.explicitOffset),
      correction = correctedCapture(e, sourceZone);
    const difference = gpsUsable ? (Date.parse(correction.takenAt) - gps!) / 1000 : null;
    if (difference !== null && Math.abs(difference) > 120)
      return {
        ...result,
        status: 'conflict',
        reason: '明确拍摄时区与 GPS 时间相差超过两分钟，需核对定位是否陈旧或相机时钟是否准确。',
        gpsDifferenceSeconds: difference,
      };
    return {
      ...result,
      ...correction,
      status: 'verified',
      sourceZone,
      reason: e.destinationZone
        ? '拍摄时区明确，已按拍摄地点历史时区换算。'
        : '拍摄时区明确，缺少可靠位置，保留相机时区时间。',
      gpsDifferenceSeconds: difference,
    };
  }
  if (!gpsUsable)
    return {
      ...result,
      reason: invalidFix
        ? 'GPS 标记无效，不能用于推断拍摄时区。'
        : gps !== null && !e.gpsPositionMatches
          ? 'GPS 位置与当前地点不一致，请人工核对。'
          : result.reason,
    };
  const delta = Date.parse(e.clock) - gps!,
    offset = Math.round(delta / 900000) * 15;
  const drift = (delta - offset * 60000) / 1000;
  if (offset < -720 || offset > 840 || Math.abs(drift) > 120)
    return {
      ...result,
      status: 'conflict',
      reason: 'GPS 时间与相机钟表无法对应到合理时区，可能存在旧定位或时钟偏差。',
      gpsDifferenceSeconds: drift,
    };
  const sourceZone = offsetZone(offset);
  return {
    ...result,
    ...correctedCapture(e, sourceZone),
    status: 'suggested',
    sourceZone,
    reason: `GPS 时间支持相机使用 ${sourceZone}，仍需确认相机设置；不自动应用。`,
    gpsDifferenceSeconds: drift,
  };
}
