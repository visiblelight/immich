import { adminState } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals }: { locals: App.Locals }) {
  const app = getRuntime();
  return { ...(await adminState(app.db)), user: locals.user!, publicOrigin: app.publicOrigin };
}
