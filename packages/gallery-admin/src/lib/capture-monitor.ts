import {captureIsReading, captureReviewState, type CaptureStateInput} from '@gallery/core';

type Row = CaptureStateInput & {asset_id: string; source_signature: string};
type MonitorOptions = {
  rows: () => Row[];
  blocked: () => boolean;
  refresh: () => Promise<void>;
  enqueue: (ids: string[]) => Promise<void>;
  refreshed: () => void;
  queued: (ids: string[]) => void;
  error: (stage: 'refresh' | 'enqueue', ids: string[]) => void;
  now?: () => number;
};

/** One request per changed source; failed reads require an explicit retry. No timers survive the page. */
export function createCaptureMonitor(options: MonitorOptions) {
  const attempts = new Map<string, string>(), now = options.now ?? Date.now;
  let running = false, stopped = false, last = -Infinity, readFailed = false;
  return {
    stop() { stopped = true; },
    async tick(force = false) {
      const active = options.rows().some(p => captureReviewState(p) === 'updating');
      if (stopped || running || options.blocked() || (!force && now() - last < (active && !readFailed ? 2500 : 15000))) return;
      running = true;
      let stage: 'refresh' | 'enqueue' = 'refresh';
      let ids: string[] = [];
      try {
        await options.refresh();
        if (stopped) return;
        readFailed = false;
        options.refreshed();
        if (options.blocked()) return;
        const changed = options.rows().filter(p => p.capture_status === 'stale' &&
          captureReviewState(p) === 'updating' && !captureIsReading(p) && attempts.get(p.asset_id) !== p.source_signature).slice(0, 100);
        if (!changed.length) return;
        for (const p of changed) attempts.set(p.asset_id, p.source_signature);
        stage = 'enqueue';
        ids = changed.map(p => p.asset_id);
        await options.enqueue(ids);
        if (stopped) return;
        options.queued(ids);
        if (!options.blocked()) {
          stage = 'refresh';
          await options.refresh();
          if (!stopped) options.refreshed();
        }
      } catch {
        readFailed = true;
        if (!stopped) options.error(stage, ids);
      } finally {
        last = now();
        running = false;
      }
    },
  };
}
