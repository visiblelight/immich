import { captureTime, confirmedCameraZone } from './capture-time.ts';
import type { DisplayPhoto } from './content.ts';

type CaptureDisplay = Pick<DisplayPhoto, 'takenAt' | 'localTakenAt' | 'timeZone' | 'captureStatus'>;
export function captureChange(before: CaptureDisplay, after: CaptureDisplay) {
  const caption = (photo: CaptureDisplay) => {
    const label = captureTime(photo).label;
    const zone = ['unknown', 'suggested', 'conflict', 'stale'].includes(photo.captureStatus ?? '')
      ? null : photo.timeZone || confirmedCameraZone(photo);
    return label + (zone ? ' · ' + zone : '');
  };
  return {
    before: before.localTakenAt ?? null,
    after: after.localTakenAt ?? null,
    beforeCaption: caption(before),
    afterCaption: caption(after),
    beforeInstant: before.takenAt ?? null,
    afterInstant: after.takenAt ?? null,
    destinationPending: ['verified', 'confirmed'].includes(after.captureStatus ?? '') && !after.timeZone,
    secondsChanged: before.takenAt && after.takenAt ? (Date.parse(after.takenAt) - Date.parse(before.takenAt)) / 1000 : 0,
    dateChanged: before.localTakenAt?.slice(0, 10) !== after.localTakenAt?.slice(0, 10),
  };
}
