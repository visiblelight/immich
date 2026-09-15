import { load as loadWorkspace } from '../albums/+page.server';
import { aboutArticleSettings } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load(event: Parameters<typeof loadWorkspace>[0]) {
  const workspace = await loadWorkspace(event);
  return {
    ...workspace,
    aboutSettings: await aboutArticleSettings(getRuntime().db),
  };
}
