// Only public content routes are eligible. Queries/fragments never enter analytics.
export function analyticsPage(path: string, status = 200): string | null {
  if (status >= 400) return null;
  return /^\/(?:albums(?:\/[^/]+(?:\/photos\/[^/]+)?)?|photos|records(?:\/[^/]+)?|about|visited(?:\/[A-Z]{2})?)\/?$/.test(path)
    ? path.replace(/\/$/, '') : null;
}
export function analyticsReferrer(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.origin === origin ? (analyticsPage(url.pathname) ?? '') : url.origin;
  } catch { return ''; }
}
