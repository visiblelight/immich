<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { MemberAvatar } from '@gallery/ui';
  import { closedCommunity, type Member, type CommunitySettings } from '@gallery/core';
  import type { CommunityClient } from './context';
  import Auth from './Auth.svelte';
  import { ThreadState } from './thread.svelte';
  let {
    initial,
    children,
  }: {
    initial: {
      user: Member | null;
      settings: CommunitySettings;
      enabled: boolean;
    };
    children: Snippet;
  } = $props();
  let user = $state<Member | null>(null),
    settings = $state<CommunitySettings>(closedCommunity()),
    enabled = $state(false),
    revision = $state(0);
  let drafts = $state<Record<string, string>>({}),
    counts = $state<Record<string, number>>({});
  let open = $state(false),
    afterLogin: (() => void) | undefined;
  $effect(() => {
    user = initial.user;
    settings = initial.settings;
    enabled = initial.enabled;
  });
  async function request<T = any>(action: string, input?: unknown): Promise<T> {
    const response = await fetch(
      `/api/community/${action}`,
      input === undefined
        ? { cache: 'no-store' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
            cache: 'no-store',
          },
    );
    const data = await response.json();
    if (data.settings && JSON.stringify(data.settings) !== JSON.stringify(settings)) settings = data.settings;
    if (!response.ok) {
      if (response.status === 401) user = null;
      throw new Error(data.message || '操作未完成，请重试。');
    }
    return data as T;
  }
  async function refresh() {
    if (!enabled) return;
    const data = await request('me');
    user = data.user;
    settings = data.settings;
    revision++;
  }
  function login(after?: () => void) {
    afterLogin = after;
    open = true;
  }
  const threads = new Map<string, ThreadState>();
  const client: CommunityClient = {
    thread: (target) => {
      const key = `${target.kind}:${target.id}`;
      if (!threads.has(key)) threads.set(key, new ThreadState(client, target));
      return threads.get(key)!;
    },
    get user() {
      return user;
    },
    get settings() {
      return settings;
    },
    get enabled() {
      return enabled;
    },
    get revision() {
      return revision;
    },
    get drafts() {
      return drafts;
    },
    get counts() {
      return counts;
    },
    login,
    request,
    refresh,
    changed: (t, n) => (counts[`${t.kind}:${t.id}`] = n),
  };
  setContext('gallery-community-client', client);
  setContext('gallery-community-header', {
    get accountControl() {
      return enabled ? account : undefined;
    },
  });
</script>

{#snippet account()}<button
    class="member-account"
    aria-label={user ? '个人资料' : '登录'}
    onclick={() => (user ? goto('/account') : login())}
    >{#if user}<MemberAvatar seed={user.avatar} size={30} />{:else}<span>登录</span>{/if}</button
  >{/snippet}
{@render children()}
{#if enabled}<Auth
    bind:open
    {client}
    onlogin={async () => {
      await refresh();
      afterLogin?.();
      afterLogin = undefined;
    }}
  />{/if}

<style>
  .member-account {
    display: flex;
    align-items: center;
    gap: 7px;
    background: none;
    border: 0;
    color: #64735e;
    font: inherit;
    font-size: 13px;
    padding: 6px;
    cursor: pointer;
  }
</style>
