export interface CaptureStateInput {
  capture_status: string;
  has_location: boolean;
  evidence: { clock: string | null } | null;
  refresh_state: string | null;
  refresh_expired: boolean;
}

export function captureIsReading(photo: CaptureStateInput) {
  return ['queued', 'reading'].includes(photo.refresh_state ?? '') && !photo.refresh_expired;
}

/** Processing and missing location are not requests for a human time decision. */
export function captureReviewState(photo: CaptureStateInput) {
  if (captureIsReading(photo)) return 'updating';
  if (photo.refresh_expired || photo.refresh_state === 'failed') return 'failed';
  if (photo.capture_status === 'stale') return 'updating';
  if (['verified', 'confirmed'].includes(photo.capture_status)) return 'confirmed';
  if (photo.capture_status === 'legacy') return 'legacy';
  if (!photo.has_location && photo.evidence?.clock && photo.capture_status !== 'conflict') return 'original';
  return 'review';
}
