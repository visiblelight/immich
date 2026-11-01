import {correctedCapture, type CaptureEvidence} from './capture-evidence.ts';

/** Call only after source-clock signature, confirmed decision and previous evidence binding match. */
export function reuseCameraZone(before: CaptureEvidence, after: CaptureEvidence, sourceZone: string) {
  const cameraFields=['clock','explicitOffset','dateSource','gpsUtc','gpsStatus','gpsPositionValid'] as const;
  if (!after.clock || cameraFields.some(key=>before[key]!==after[key])) return null;
  try {
    const resolved=correctedCapture(after,sourceZone);
    // Newly usable GPS must not contradict an old decision made without that cross-check.
    const usable=(e:CaptureEvidence)=>!!e.gpsUtc&&e.gpsPositionValid&&e.gpsPositionMatches&&
      (!e.gpsStatus||['A','Measurement Active','Active'].includes(e.gpsStatus));
    if(!usable(before)&&usable(after)&&Math.abs(Date.parse(resolved.takenAt)-Date.parse(after.gpsUtc!))>120000)return null;
    return resolved;
  } catch { return null; }
}
