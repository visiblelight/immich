<script lang="ts">
  import { tick } from 'svelte';
  import MemberAvatar from './MemberAvatar.svelte';
  import type { Comment, Member } from './types';
  let {
    comments,
    user,
    enabled = true,
    busy = false,
    total,
    paginated = false,
    showEmptyState = true,
    draft = '',
    ondraft,
    onsubmit,
    onremove,
    onlogin,
    focusComposer = false,
    oncollapse,
    loading = false,
    hasMore = false,
    onmore,
    error = '',
    notice = '',
    onretry,
  }: {
    comments: Comment[];
    user: Member | null;
    enabled?: boolean;
    busy?: boolean;
    total?: number;
    paginated?: boolean;
    showEmptyState?: boolean;
    draft?: string;
    ondraft: (value: string) => void;
    onsubmit: () => void | boolean | Promise<void | boolean>;
    onremove: (id: string) => void;
    onlogin: () => void;
    focusComposer?: boolean;
    oncollapse?: () => void;
    loading?: boolean;
    hasMore?: boolean;
    onmore?: () => void;
    error?: string;
    notice?: string;
    onretry?: () => void;
  } = $props();
  let limit = $state(20),
    expanded = $state(false);
  let textarea = $state<HTMLTextAreaElement>(),
    section: HTMLElement;
  let visible = $derived(
    comments.filter((c) => c.status === 'published' || (c.status === 'pending' && c.member.id === user?.id)),
  );
  async function expand() {
    expanded = true;
    await tick();
    textarea?.focus();
  }
  $effect(() => {
    if (focusComposer && enabled) void expand();
  });
  async function submit() {
    if (!user) {
      onlogin();
      return;
    }
    if ((await onsubmit()) === false) return;
    expanded = false;
    await tick();
    section?.querySelector('article:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const date = (value: string) =>
    Number.isNaN(Date.parse(value))
      ? value
      : new Date(value).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
</script>

<section class="comments" aria-label="评论" bind:this={section}>
  {#if showEmptyState || (total ?? 0) > 0 || visible.length > 0}<div class="comment-heading">
      <h2>
        评论 <span>{total ?? comments.filter((c) => c.status === 'published').length}</span>
      </h2>
    </div>{/if}
  <div class="comment-list" aria-live="polite">
    {#each visible.slice(0, paginated ? visible.length : limit) as comment (comment.id)}
      {@const author = comment.member.id === user?.id ? user! : comment.member}
      <article data-comment-id={comment.id}>
        <MemberAvatar seed={author.avatar} size={30} />
        <div class="comment-content">
          <div class="byline">
            <span class="author">{author.name}</span>
            {#if comment.member.id === user?.id}<details class="comment-menu">
                <summary aria-label="评论操作">···</summary><button
                  disabled={busy}
                  onclick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    onremove(comment.id);
                  }}>删除评论</button
                >
              </details>{/if}
          </div>
          <p>{comment.text}</p>
          <div class="comment-meta">
            <time datetime={comment.date}>{date(comment.date)}</time>{#if comment.status === 'pending'}<span
                >待审核 · 仅你可见</span
              >{/if}
          </div>
          {#if comment.reply}<div class="reply">
              <span class="author">光与远方 <span class="owner">站长</span></span>
              <p>{comment.reply}</p>
            </div>{/if}
        </div>
      </article>
    {/each}
    {#if showEmptyState && !visible.length && !loading}<p class="empty">还没有留言，期待你的感受。</p>{/if}
  </div>
  {#if loading}<p class="hint" role="status">正在加载…</p>{/if}
  {#if hasMore || (!paginated && visible.length > limit)}<button
      class="more"
      disabled={loading}
      onclick={() => (paginated ? onmore?.() : (limit += 20))}
      >查看更多评论 <span aria-hidden="true">＋</span></button
    >{/if}
  {#if error}<p class="error" role="alert">
      {error}
      {#if onretry}<button class="text-action" onclick={onretry}>重试</button>{/if}
    </p>{/if}
  {#if notice}<p class="hint" role="status">{notice}</p>{/if}
  {#if enabled}<div class="composer" class:expanded>
      {#if expanded}<form
          onsubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label
            ><span class="sr-only">写下你的评论</span><textarea
              bind:this={textarea}
              rows="3"
              maxlength="1000"
              value={draft}
              oninput={(e) => ondraft(e.currentTarget.value)}
              placeholder="写下你的感受…"></textarea></label
          >
          <div class="compose-footer">
            <span
              >{!user ? '登录后即可发表' : !user.trusted ? '首次留言需审核' : ''}{draft.length > 800
                ? ` ${draft.length}/1000`
                : ''}</span
            >
            <button
              type="button"
              class="text-action"
              disabled={busy}
              onclick={() => {
                expanded = false;
                oncollapse?.();
              }}>取消</button
            >
            <button class="send" disabled={busy || !draft.trim()}
              >{busy ? '发送中…' : user ? '发表' : '登录并继续'}</button
            >
          </div>
        </form>
      {:else}<button class="compose-trigger" onclick={expand} aria-label="写评论">
          {#if user}<MemberAvatar seed={user.avatar} size={24} />{:else}<svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"><path d="m16 3 5 5-11 11-6 1 1-6Z M13 6l5 5" /></svg
            >{/if}
          <span>{draft ? '继续写评论…' : '说点什么…'}</span><span class="compose-plus" aria-hidden="true"
            >＋</span
          >
        </button>{/if}
    </div>{:else}<p class="hint closed">暂时关闭新评论，已有留言仍可阅读。</p>{/if}
</section>

<style>
  .comments {
    color: var(--community-ink, #303c34);
    font-size: 14px;
    line-height: 1.7;
    min-width: 0;
  }
  .comment-heading {
    padding: 24px 0 22px;
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    font-size: 15px;
    font-weight: 500;
  }
  h2 span {
    font-size: 12px;
    color: var(--community-muted, #879181);
    font-weight: 400;
  }
  .comment-list {
    display: flex;
    flex-direction: column;
    gap: 26px;
  }
  article {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 12px;
  }
  .byline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 22px;
  }
  .author {
    font-size: 12px;
    color: var(--community-muted, #798573);
    font-weight: 400;
  }
  p {
    margin: 5px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .comment-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 8px;
    font-size: 10px;
    color: var(--community-muted, #8d9687);
  }
  .reply {
    margin: 15px 0 0;
    padding-left: 13px;
    border-left: 1px solid var(--community-line, #dce3d6);
    font-size: 13px;
  }
  .owner {
    margin-left: 6px;
    font-size: 10px;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--community-accent, #5f795c);
    outline-offset: 3px;
  }
  .comment-menu {
    position: relative;
    flex: none;
  }
  .comment-menu summary {
    list-style: none;
    cursor: pointer;
    color: var(--community-muted, #879181);
    padding: 0 6px;
    letter-spacing: 2px;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .comment-menu button {
    position: absolute;
    right: 0;
    top: 100%;
    white-space: nowrap;
    z-index: 2;
    border: 1px solid var(--community-line, #e2e7dd);
    border-radius: 8px;
    background: var(--community-surface, #fafbf9);
    padding: 8px 14px;
    font-size: 12px;
    box-shadow: 0 5px 20px #10201910;
  }
  .empty,
  .hint {
    font-size: 12px;
    color: var(--community-muted, #879181);
    margin: 0 0 15px;
  }
  .closed {
    margin-top: 20px;
  }
  .more {
    display: block;
    background: none;
    border: 0;
    font-size: 12px;
    color: var(--community-muted, #879181);
    padding: 20px 0 10px;
  }
  .more span {
    margin-left: 6px;
  }
  .composer {
    position: sticky;
    bottom: 0;
    z-index: 2;
    padding: 18px 0 14px;
    margin-top: 20px;
    background: var(--community-surface, #fafbf9);
    border-top: 1px solid var(--community-line, #e5e9e0);
  }
  .compose-trigger {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: var(--community-input, #f0f3ed);
    border: 0;
    border-radius: 24px;
    color: var(--community-muted, #7d8976);
    padding: 10px 15px;
    font-size: 13px;
  }
  .compose-plus {
    margin-left: auto;
    font-size: 18px;
  }
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 88px;
    max-height: 200px;
    padding: 13px 15px;
    resize: vertical;
    outline: none;
    border: 1px solid transparent;
    border-radius: 14px;
    background: var(--community-input, #f0f3ed);
    color: inherit;
    font: inherit;
    line-height: 1.7;
  }
  textarea:focus {
    border-color: var(--community-line, #d6dfd0);
  }
  textarea::placeholder {
    color: var(--community-muted, #879181);
  }
  .compose-footer {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 0 0;
  }
  .compose-footer > span {
    flex: 1;
    font-size: 10px;
    color: var(--community-muted, #879181);
  }
  .text-action {
    background: none;
    border: 0;
    padding: 5px 0;
    font-size: 12px;
    color: var(--community-muted, #879181);
  }
  .send {
    border: 0;
    border-radius: 24px;
    padding: 8px 22px;
    background: var(--community-accent, #45674e);
    color: var(--community-on-accent, #fff);
    font-size: 12px;
    white-space: nowrap;
  }
  .error {
    font-size: 12px;
    color: #b57961;
    margin: 14px 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
