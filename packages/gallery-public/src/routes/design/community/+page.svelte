<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import {
    Gallery,
    PublicFrame,
    SegmentedControl,
    ArticleReader,
    MemberAvatar,
    MemberDialog,
    MemberProfile,
    ReactionBar,
    CommentPane,
    PhotoDiscussion,
    defaultCommunitySettings,
    type Member,
    type Comment,
  } from '@gallery/ui';
  import { sampleArticles, resolveSampleImage } from '@gallery/ui/article-design';
  import type { DisplayAlbum, DisplayPhoto } from '@gallery/core';
  let view = $derived(page.url.searchParams.get('view') || 'album');
  let user = $state<Member | null>(null);
  let loginOpen = $state(false);
  let withDescription = $state(true);
  let settings = $state(defaultCommunitySettings());
  let likes = $state<Record<string, boolean>>({});
  let drafts = $state<Record<string, string>>({});
  let pendingLike = $state('');
  let drawer: HTMLDialogElement;
  let articleComments = $state<HTMLDivElement>();
  const site = { name: '光与远方', tagline: '' };
  const names = [
    '山的另一边',
    '在街角停一会儿',
    '城市留下的时间',
    '沿着河流，走进旧城',
    '海风吹过的下午',
    '日落之前',
  ];
  const pictures = ['mountains', 'street', 'detail', 'tbilisi', 'coast', 'dusk'];
  const photos: DisplayPhoto[] = pictures.map((image, i) => ({
    id: image,
    src: `/design-assets/${image}.jpg`,
    thumbnail: `/design-assets/${image}-small.jpg`,
    title: names[i]!,
    description:
      i === 0
        ? '山谷里起了薄雾，远处的轮廓一点点变得柔和。停下来，听一会儿风。'
        : '走到这里的时候，光线刚刚好。',
    alt: names[i]!,
    localTakenAt: '2025-06-18T09:24:00',
    timeZone: 'Asia/Tbilisi',
    latitude: null,
    longitude: null,
    exif: {},
  }));
  let album = $derived<DisplayAlbum>({
    id: 'journey',
    slug: 'journey',
    title: '格鲁吉亚 · 山路与旧城',
    summary: withDescription
      ? '从第比利斯出发，沿着山路向北。\n\n那些没有写进行程表的片刻，反而留在了记忆里：清晨街角的阳光、山间短暂的雾，以及一整片安静的绿色。\n\n2025 年 6 月 · 6 张照片'
      : '',
    parent: '',
    blocks: [],
    cover: photos[0]!.thumbnail,
    count: photos.length,
    photos,
  });
  const originalComments: Comment[] = [
    {
      id: 'c1',
      member: { id: 'u1', name: '路过的风', avatar: 'visitor-wind-93' },
      date: '2026.10.22',
      text: '喜欢这样的光线，像是又回到了那个安静的下午。',
      status: 'published',
      reply: '谢谢你，也希望这些照片能留住一点当时的感觉。',
    },
    {
      id: 'c2',
      member: { id: 'u2', name: '小林', avatar: 'visitor-lin-628' },
      date: '2026.10.20',
      text: '读完说明再看照片，多了一层旅途中的感受。',
      status: 'published',
    },
  ];
  let comments = $state<Record<string, Comment[]>>({
    'album:journey': structuredClone(originalComments),
    'photo:mountains': structuredClone(originalComments.slice(0, 1)),
    'article:journey': structuredClone(originalComments),
  });
  const target = (kind: string, id: string) => `${kind}:${id}`;
  const count = (key: string) =>
    (key.startsWith('album:') ? 12 : key === 'photo:mountains' ? 8 : key.startsWith('article:') ? 6 : 2) +
    (likes[key] ? 1 : 0);
  const rows = (key: string) => comments[key] ?? [];
  const published = (key: string) => rows(key).filter((c) => c.status === 'published').length;
  function like(key: string) {
    if (!user) {
      pendingLike = key;
      loginOpen = true;
    } else if (settings.showLikes && (settings.likes || likes[key])) likes[key] = !likes[key];
  }
  function login(member: Member) {
    user = member;
    if (pendingLike && settings.likes && settings.showLikes) likes[pendingLike] = true;
    pendingLike = '';
  }
  function submit(key: string) {
    if (!user || !settings.comments || !settings.showComments || !drafts[key]?.trim()) return;
    comments[key] = [
      {
        id: crypto.randomUUID(),
        member: { ...user },
        text: drafts[key]!.trim(),
        date: '刚刚',
        status: 'pending',
      },
      ...rows(key),
    ];
    drafts[key] = '';
  }
  function remove(key: string, id: string) {
    comments[key] = rows(key).filter((c) => c.id !== id || c.member.id !== user?.id);
  }
  function changeView(value: string) {
    void goto(`/design/community?view=${value}`, { noScroll: false });
  }
  function logout() {
    user = null;
    likes = {};
    changeView('album');
  }
  let scenario = $state('open');
  function changeScenario(value: string) {
    scenario = value;
    settings = defaultCommunitySettings();
    if (value === 'registration') settings.registration = false;
    if (value === 'paused') {
      settings.comments = false;
      settings.likes = false;
    }
    if (value === 'comments') settings.showComments = false;
    if (value === 'likes') settings.showLikes = false;
    if (value === 'hidden') {
      settings.showComments = false;
      settings.showLikes = false;
    }
  }
  const sampleArticle = sampleArticles[0]!;
</script>

<svelte:head><title>用户与互动样稿 · 光与远方</title></svelte:head>
<div class="prototype-tools">
  <span>交互样稿 · 示例数据</span>
  <div class="scenes">
    <SegmentedControl
      label="预览场景"
      value={view}
      options={[
        { value: 'albums', label: '相册列表' },
        { value: 'album', label: '相册详情' },
        { value: 'photos', label: '全部相片' },
        { value: 'article', label: '记录文章' },
        { value: 'profile', label: '个人资料' },
      ]}
      onchange={changeView}
    />
  </div>
  <label><input type="checkbox" bind:checked={withDescription} /> 显示说明</label><label
    >互动状态<select
      aria-label="样稿互动状态"
      value={scenario}
      onchange={(e) => changeScenario(e.currentTarget.value)}
      ><option value="open">全部开放</option><option value="registration">关闭注册</option><option
        value="paused">暂停新增互动</option
      ><option value="comments">隐藏评论</option><option value="likes">隐藏点赞</option><option value="hidden"
        >隐藏全部互动</option
      ></select
    ></label
  ><a href="http://localhost:3101/design/community" target="_blank" rel="noreferrer">后台样稿 ↗</a>
</div>

{#snippet accountControl()}<button
    class="account"
    onclick={() => (user ? changeView('profile') : (loginOpen = true))}
    aria-label={user ? '个人资料' : '登录'}
    >{#if user}<MemberAvatar seed={user.avatar} size={30} />{:else}<svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg
      ><span>登录</span>{/if}</button
  >{/snippet}
{#snippet discussion(key: string)}<CommentPane
    comments={rows(key)}
    {user}
    enabled={settings.comments}
    draft={drafts[key] || ''}
    ondraft={(text) => (drafts[key] = text)}
    onsubmit={() => submit(key)}
    onremove={(id) => remove(key, id)}
    onlogin={() => (loginOpen = true)}
  />{/snippet}
{#snippet actions(key: string, openComments: () => void)}<ReactionBar
    {settings}
    count={count(key)}
    comments={published(key)}
    liked={!!likes[key]}
    onlike={() => like(key)}
    oncomments={openComments}
  />{/snippet}
{#snippet albumActions(value: DisplayAlbum)}{@render actions(target('album', value.id), () =>
    drawer.showModal(),
  )}{/snippet}
{#snippet photoInformation(photo: DisplayPhoto)}{@const key = target('photo', photo.id)}<PhotoDiscussion
    {photo}
    {settings}
    {user}
    description={withDescription}
    comments={rows(key)}
    count={count(key)}
    liked={!!likes[key]}
    draft={drafts[key] || ''}
    ondraft={(text) => (drafts[key] = text)}
    onsubmit={() => submit(key)}
    onremove={(id) => remove(key, id)}
    onlogin={() => (loginOpen = true)}
    onlike={() => like(key)}
  />{/snippet}

{#if ['albums', 'album', 'photos'].includes(view)}
  <Gallery
    {site}
    albums={[album]}
    active={view === 'albums' ? null : album}
    {accountControl}
    {albumActions}
    {photoInformation}
    albumHref={() => '/design/community?view=album'}
    likeCount={(kind, id) => (settings.showLikes ? count(target(kind, id)) : null)}
    feed={view === 'photos'
      ? { months: [{ month: '2025-06', count: 6 }], sort: 'taken', month: '', page: 1, total: 6 }
      : undefined}
  />
{:else}<PublicFrame {site} active={view === 'article' ? 'records' : ''} {accountControl}>
    {#if view === 'article'}<ArticleReader
        title={sampleArticle.title}
        document={sampleArticle.document}
        firstPublishedAt="2026-10-22T10:00:00Z"
        resolveImage={resolveSampleImage}
        related={[]}
      />
      <div class="article-interaction">
        {@render actions('article:journey', () => {
          articleComments?.scrollIntoView({ behavior: 'smooth' });
        })}
        <div bind:this={articleComments} class="article-comments">
          {#if settings.showComments}{@render discussion('article:journey')}{/if}
        </div>
      </div>
    {:else if user}<MemberProfile {user} onsave={(value) => (user = value)} onlogout={logout} />
    {:else}<div class="profile-empty">
        <h1>个人资料</h1>
        <p>登录后，管理你的名称、头像和邮箱。</p>
        <button class="primary" onclick={() => (loginOpen = true)}>登录</button>
      </div>{/if}
  </PublicFrame>{/if}

<dialog class="discussion-drawer" bind:this={drawer} aria-labelledby="album-comment-title">
  <div class="drawer-title">
    <div>
      <span>相册评论</span>
      <h2 id="album-comment-title">{album.title}</h2>
    </div>
    <button aria-label="关闭相册评论" onclick={() => drawer.close()}>×</button>
  </div>
  <div class="drawer-body">
    {#if settings.showComments}{@render discussion('album:journey')}{/if}
  </div>
</dialog>
<MemberDialog bind:open={loginOpen} registration={settings.registration} onlogin={login} />

<style>
  :global(html:has(dialog.discussion-drawer[open])) {
    overflow: hidden;
  }
  .prototype-tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 18px;
    padding: 9px 5%;
    border-bottom: 1px solid #e4e7e0;
    color: #7b8477;
    background: #f1f3ee;
    font-size: 11px;
  }
  .prototype-tools select {
    font: inherit;
    padding: 5px 6px;
    border: 1px solid #dce2d6;
    border-radius: 4px;
    background: #fafbf9;
    color: inherit;
    max-width: 128px;
  }
  .prototype-tools > span {
    white-space: nowrap;
  }
  .scenes {
    overflow-x: auto;
    max-width: 100%;
  }
  .prototype-tools label {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  input {
    accent-color: #41664e;
  }
  .prototype-tools a {
    color: #64735e;
    text-decoration: none;
    margin-left: auto;
  }
  .account {
    display: flex;
    align-items: center;
    gap: 7px;
    font: inherit;
    font-size: 13px;
    background: none;
    border: 0;
    color: #64735e;
    cursor: pointer;
    padding: 6px 0;
  }
  .article-interaction {
    max-width: 1000px;
    margin: 0 auto 70px;
    border-top: 1px solid #e4e7e0;
    padding-top: 18px;
  }
  .article-comments {
    max-width: 760px;
    margin-top: 30px;
    scroll-margin-top: 24px;
  }
  .profile-empty {
    max-width: 500px;
    margin: 70px auto;
  }
  .profile-empty h1 {
    font-size: 28px;
    font-weight: 550;
  }
  .profile-empty p {
    color: #7b8477;
  }
  .primary {
    border: 0;
    border-radius: 5px;
    background: #41664e;
    color: white;
    padding: 11px 20px;
    cursor: pointer;
    font: inherit;
  }
  .discussion-drawer {
    padding: 0;
    border: 0;
    border-left: 1px solid #dce2d6;
    background: #fafbf9;
    color: #2f3731;
    box-sizing: border-box;
    margin: 0 0 0 auto;
    width: min(480px, 100vw);
    max-width: 100vw;
    max-height: 100dvh;
    height: 100dvh;
  }
  .discussion-drawer::backdrop {
    background: #1d302c55;
  }
  .drawer-title {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    padding: 24px 28px;
    border-bottom: 1px solid #e4e7e0;
    background: #fafbf9;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .drawer-title span {
    font-size: 11px;
    color: #7b8477;
  }
  .drawer-title h2 {
    font-size: 17px;
    font-weight: 550;
    margin: 8px 0 0;
  }
  .drawer-title button {
    font-size: 26px;
    border: 0;
    background: none;
    color: #7b8477;
    cursor: pointer;
    padding: 5px;
  }
  .drawer-body {
    padding: 28px;
  }
  @media (max-width: 600px) {
    .prototype-tools {
      padding: 8px 18px;
      gap: 8px;
    }
    .scenes {
      order: 4;
      width: 100%;
    }
    .discussion-drawer {
      height: 85dvh;
      margin: auto 0 0;
      width: 100%;
      border-radius: 12px 12px 0 0;
      border: 0;
    }
    .drawer-title {
      padding: 18px 22px;
    }
    .drawer-body {
      padding: 24px 22px;
    }
  }
</style>
