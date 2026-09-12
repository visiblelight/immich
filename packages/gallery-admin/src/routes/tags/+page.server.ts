import { adminTags } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({locals}:{locals:App.Locals}) {
 const app=getRuntime();
 return {user:locals.user!,publicOrigin:app.publicOrigin,tags:await adminTags(app.db)};
}
