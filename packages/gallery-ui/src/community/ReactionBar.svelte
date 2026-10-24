<script lang="ts">
  import type { CommunitySettings } from './types';
  let {
    count = 0,
    busy = false,
    comments = 0,
    liked = false,
    settings,
    onlike,
    oncomments,
  }: {
    count?: number;
    busy?: boolean;
    comments?: number;
    liked?: boolean;
    settings: CommunitySettings;
    onlike: () => void;
    oncomments: () => void;
  } = $props();
</script>

<div class="reactions">
  {#if settings.showLikes}<button
      class:liked
      aria-pressed={liked}
      aria-label={liked ? `取消点赞，${count} 人点赞` : `点赞，${count} 人点赞`}
      disabled={busy || (!settings.likes && !liked)}
      onclick={onlike}
    >
      <svg
        viewBox="0 0 24 24"
        width="21"
        height="21"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
        ><path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
        /></svg
      >
      {#if count > 0}<span>{count}</span>{/if}
    </button>{/if}
  {#if settings.showComments}<button onclick={oncomments} aria-label={`查看评论，${comments} 条`}>
      <svg
        viewBox="0 0 24 24"
        width="21"
        height="21"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M20 4H4v13h4l4 4v-4h8Z" /></svg
      >
      <span>评论{comments ? ` ${comments}` : ''}</span>
    </button>{/if}
</div>

<style>
  .reactions {
    display: flex;
    align-items: center;
    gap: 22px;
    color: var(--community-muted, #748070);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px;
    min-height: 40px;
    min-width: 40px;
    justify-content: center;
    border-radius: 24px;
    font: inherit;
    font-size: 12px;
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
    line-height: 1.5;
  }
  button:hover,
  .liked {
    color: var(--community-accent, #41664e);
  }
  button:disabled {
    cursor: default;
    opacity: 0.6;
  }
</style>
