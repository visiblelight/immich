import type { DisplayPhoto } from './content.ts';
import { offsetZone, validCaptureZone } from './capture-evidence.ts';

/** Only derive a camera offset after its instant has been explicitly verified/confirmed. */
export function confirmedCameraZone(photo: Pick<DisplayPhoto, 'localTakenAt' | 'takenAt' | 'timeZone' | 'captureStatus'>) {
  if (photo.timeZone || !['verified', 'confirmed'].includes(photo.captureStatus ?? '') || !photo.localTakenAt || !photo.takenAt) return null;
  const offset = (Date.parse(photo.localTakenAt) - Date.parse(photo.takenAt)) / 60000;
  return Number.isInteger(offset) && offset >= -720 && offset <= 840 ? offsetZone(offset) : null;
}

/** Immich encodes wall-clock fields in localDateTime as UTC: do not convert them again. */
export function captureTime(
  photo: Pick<DisplayPhoto, 'localTakenAt' | 'takenAt' | 'timeZone' | 'captureStatus'>,
) {
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
  const known = validCaptureZone(zone);
  if (photo.captureStatus && ['suggested', 'unknown', 'conflict', 'stale'].includes(photo.captureStatus))
    return { label: '相机记录时间', value: `${value}（时区待核对）` };
  if (photo.captureStatus && ['verified', 'confirmed'].includes(photo.captureStatus) && !known) {
    const cameraZone = confirmedCameraZone(photo);
    return { label: '相机时间', value: `${value}${cameraZone ? ' · ' + cameraZone : ''}（拍摄地点时区待确认）` };
  }
  return known
    ? { label: '当地拍摄时间', value: `${value} · ${zone}` }
    : { label: '记录时间', value: `${value}（时区未知）` };
}
