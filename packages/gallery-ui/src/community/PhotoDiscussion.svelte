<script lang="ts">
  import { untrack } from 'svelte';
  import type { DisplayPhoto } from '../../../gallery-core/src/content';
  import type { Comment, Member, CommunitySettings } from './types';
  import ReactionBar from './ReactionBar.svelte';
  import CommentPane from './CommentPane.svelte';
  let {
    photo,
    settings,
    user,
    comments,
    count,
    liked,
    draft,
    ondraft,
    onsubmit,
    onremove,
    onlogin,
    onlike,
    description = true,
  }: {
    photo: DisplayPhoto;
    settings: CommunitySettings;
    user: Member | null;
    comments: Comment[];
    count: number;
    liked: boolean;
    draft: string;
    ondraft: (value: string) => void;
    onsubmit: () => void;
    onremove: (id: string) => void;
    onlogin: () => void;
    onlike: () => void;
    description?: boolean;
  } = $props();
  let tab = $state<'info' | 'comments'>('info');
  let lastPhoto = untrack(() => photo.id);
  $effect(() => {
    if (photo.id !== lastPhoto) {
      lastPhoto = photo.id;
      tab = 'info';
    }
  });
  $effect(() => {
    if (!settings.showComments) tab = 'info';
  });
</script>

<div class="photo-discussion">
  <ReactionBar
    {settings}
    {count}
    {liked}
    comments={comments.filter((c) => c.status === 'published').length}
    {onlike}
    oncomments={() => (tab = 'comments')}
  />
  <nav aria-label="照片信息与评论">
    <button aria-pressed={tab === 'info'} onclick={() => (tab = 'info')}>照片信息</button
    >{#if settings.showComments}<button aria-pressed={tab === 'comments'} onclick={() => (tab = 'comments')}
        >评论</button
      >{/if}
  </nav>
  {#if tab === 'comments'}
    <CommentPane
      {comments}
      {user}
      enabled={settings.comments}
      {draft}
      {ondraft}
      {onsubmit}
      {onremove}
      {onlogin}
    />
  {:else}
    {#if description && (photo.title || photo.description)}<section>
        <h2>{photo.title}</h2>
        <p>{photo.description}</p>
      </section>{/if}
    <section>
      <h3>当地拍摄时间</h3>
      <p>2025/06/18 09:24 · Asia/Tbilisi</p>
      <h3>拍摄位置</h3>
      <p>格鲁吉亚 <span>›</span> 第比利斯</p>
    </section>
    <section>
      <h3>拍摄参数</h3>
      <dl>
        <dt>相机</dt>
        <dd>Sony ILCE-7CR</dd>
        <dt>镜头</dt>
        <dd>FE 20–70mm F4 G</dd>
        <dt>焦距</dt>
        <dd>35 mm</dd>
        <dt>光圈</dt>
        <dd>f/8</dd>
        <dt>快门</dt>
        <dd>1/250 s</dd>
        <dt>ISO</dt>
        <dd>100</dd>
      </dl>
    </section>
  {/if}
</div>

<style>
  .photo-discussion {
    --community-ink: #d7dfd0;
    --community-muted: #95a28d;
    --community-line: #3b4537;
    --community-input: #293126;
    --community-accent: #b5c7a9;
    --community-on-accent: #20291e;
    color: var(--community-ink);
    font-size: 14px;
    line-height: 1.8;
  }
  nav {
    display: flex;
    gap: 24px;
    margin: 18px 0 26px;
    border-bottom: 1px solid #3b4537;
  }
  nav button {
    font: inherit;
    font-size: 13px;
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    color: #95a28d;
    padding: 8px 0;
    cursor: pointer;
  }
  nav button[aria-pressed='true'] {
    color: #d7dfd0;
    border-bottom-color: #b5c7a9;
  }
  section {
    margin: 0 0 28px;
  }
  h2 {
    font-size: 21px;
    font-weight: 500;
  }
  h3 {
    font-size: 12px;
    color: #95a28d;
    font-weight: 400;
    margin: 22px 0 8px;
  }
  p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  p span {
    margin: 0 8px;
    color: #95a28d;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 14px;
    font-size: 12px;
  }
  dt {
    color: #95a28d;
  }
  dd {
    text-align: right;
    margin: 0;
  }
</style>
