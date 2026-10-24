<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { ReactionBar, CommentPane } from '@gallery/ui';
  import type { CommunityTarget } from '@gallery/core';
  import { communityClient } from './context';
  let {
    target,
    mode = 'inline',
    dark = false,
    focusComposer = false,
    showEmptyState = true,
    oncollapse,
  }: {
    target: CommunityTarget;
    mode?: 'inline' | 'like' | 'comments';
    dark?: boolean;
    focusComposer?: boolean;
    showEmptyState?: boolean;
    oncollapse?: () => void;
  } = $props();
  const client = communityClient();
  const key = $derived(`${target.kind}:${target.id}`);
  const thread = $derived(client.thread(target));
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
    if (client.enabled) void thread.load(client.revision, false, true);
  });
  $effect(() => {
    const revision = client.revision,
      current = thread;
    if (mounted && client.enabled)
      untrack(() => {
        void current.load(revision);
      });
  });
  function like() {
    if (!client.user) {
      client.login(() => {
        void thread.mutate('like', { liked: true });
      });
      return;
    }
    void thread.mutate('like', { liked: !thread.data.liked });
  }
  async function submit() {
    const draftKey = key;
    if (!client.user) {
      client.login();
      return false;
    }
    const saved = await thread.mutate('comment', {
      text: client.drafts[draftKey] ?? '',
    });
    if (saved) client.drafts[draftKey] = '';
    return saved;
  }
</script>

{#if client.enabled}
  <div class="community-panel" class:dark class:like-only={mode === 'like'}>
    {#if mode !== 'comments'}<ReactionBar
        settings={{ ...client.settings, showComments: false }}
        count={thread.data.likes}
        liked={thread.data.liked}
        onlike={like}
        oncomments={() => {}}
        busy={thread.busy}
      />{/if}
    {#if mode !== 'like' && client.settings.showComments}
      <CommentPane
        comments={thread.data.comments}
        user={client.user}
        enabled={client.settings.comments}
        busy={thread.busy}
        total={thread.data.total}
        paginated
        draft={client.drafts[key] ?? ''}
        ondraft={(s) => (client.drafts[key] = s)}
        onsubmit={submit}
        onremove={(id) => void thread.mutate('delete-comment', { id })}
        onlogin={() => client.login()}
        {focusComposer}
        {showEmptyState}
        {oncollapse}
        loading={thread.loading}
        hasMore={thread.data.hasMore}
        onmore={() => thread.load(client.revision, true)}
        error={thread.error}
        notice={thread.notice}
        onretry={() => thread.load(client.revision, false, true)}
      />
    {:else if thread.error}<span class="like-error" role="alert">{thread.error}</span>{/if}
  </div>
{/if}

<style>
  .community-panel {
    font-size: 14px;
    min-width: 0;
  }
  .like-only {
    display: inline-flex;
    position: relative;
  }
  .dark {
    --community-ink: #dce3d7;
    --community-muted: #9aa793;
    --community-line: #d1dfc41c;
    --community-input: #ffffff08;
    --community-accent: #c0d0b6;
    --community-on-accent: #20291e;
    --community-surface: #212a23;
  }
  .like-error {
    position: absolute;
    top: 100%;
    right: 0;
    width: 180px;
    padding: 8px;
    font-size: 12px;
    color: var(--community-ink, #364238);
    background: var(--community-surface, #fafbf9);
    border-radius: 8px;
    z-index: 3;
  }
</style>
