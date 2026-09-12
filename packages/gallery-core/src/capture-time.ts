import type { DisplayPhoto } from './content.ts';

/** Immich encodes wall-clock fields in localDateTime as UTC: do not convert them again. */
export function captureTime(photo: Pick<DisplayPhoto, 'localTakenAt' | 'takenAt' | 'timeZone'>) {
  const local = photo.localTakenAt;
  if (!local || !Number.isFinite(Date.parse(local))) return { label: '拍摄时间', value: '时间未知' };
  const value = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(local));
  const zone = photo.timeZone?.trim();
  let known = false;
  if (zone) {
    known = /^(?:UTC|GMT)(?:[+-](?:[0-9]|1[0-4])(?::[0-5][0-9])?)?$/.test(zone);
    if (!known)
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
        known = true;
      } catch {
        /* Unknown source zone. */
      }
  }
  return known
    ? { label: '当地拍摄时间', value: `${value} · ${zone}` }
    : { label: '记录时间', value: `${value}（时区未知）` };
}
