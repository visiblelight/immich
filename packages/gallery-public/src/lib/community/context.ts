import { getContext } from 'svelte';
import type { ThreadState } from './thread.svelte';
import type { Member, CommunitySettings, CommunityTarget } from '@gallery/core';
export type CommunityClient = {
  user: Member | null;
  settings: CommunitySettings;
  enabled: boolean;
  revision: number;
  drafts: Record<string, string>;
  login: (after?: () => void) => void;
  refresh: () => Promise<void>;
  request: <T = any>(action: string, input?: unknown) => Promise<T>;
  changed: (target: CommunityTarget, count: number) => void;
  counts: Record<string, number>;
  thread: (target: CommunityTarget) => ThreadState;
};
export const communityClient = () => getContext<CommunityClient>('gallery-community-client');
