import { json } from '@sveltejs/kit';
import { liveness } from '@gallery/core';

export function GET() {
  return json(liveness('gallery-admin'), { headers: { 'Cache-Control': 'no-store' } });
}
