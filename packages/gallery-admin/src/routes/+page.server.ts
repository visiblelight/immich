import { error } from '@sveltejs/kit';

// Phase A provides infrastructure only. Never present an unconfigured gallery as live.
export function load() {
  error(503, '管理服务尚未开放');
}
