import { json } from '@sveltejs/kit';

export function GET() {
  // Replace only after schema, authorization and required services are verified.
  return json(
    { service: 'gallery-public', status: 'not-ready', reason: 'foundation-only' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
