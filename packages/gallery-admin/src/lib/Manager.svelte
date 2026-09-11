<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { AlbumContent, DraftPhoto, GallerySite, GalleryUser, ManagedAlbum, SourcePhoto } from '@gallery/core';
  import './design/admin.css';
  import { MarkdownEditor } from '@gallery/ui';
  import AlbumPhotosEditor from './AlbumPhotosEditor.svelte';
  let { initial }: { initial: { site: GallerySite; albums: ManagedAlbum[]; user: GalleryUser; publicOrigin: string } } =
    $props();
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  let workspaceData = $state(untrack(() => copy(initial)));
  let id = $state('');
  let content = $state<AlbumContent | null>(null);
  let tab = $state('photos');
  let page = $state('albums');
  let message = $state('');
  let failed = $state(false);
  let busy = $state(false);
  let search = $state('');
  let filter = $state('all');
  let active = $derived(workspaceData.albums.find((a) => a.id === id));
  let dirty = $derived(!!active && JSON.stringify(content) !== JSON.stringify(active.draft));
  let dialog: HTMLDialogElement;
  let modal = $state('');
  let newTitle = $state('');
  let newParent = $state('');
  let selected = $state<SourcePhoto[]>([]);
  let sourceAssets = $state<SourcePhoto[]>([]);
  let sourceAlbums = $state<{ id: string; name: string }[]>([]);
  let sourceTags = $state<{ id: string; name: string }[]>([]);
  let cache = $state<Record<string, SourcePhoto>>({});
  let sourceAlbum = $state('');
  let sourceTag = $state('');
  let sourceSearch = $state('');
  let since = $state('');
  let next = $state<string | null>(null);
  let cursors = $state<string[]>(['']);
  let cursorIndex = $state(0);
  let sourceBusy = $state(false);
  let requestId = 0;
  let edited = $state<DraftPhoto | null>(null);
  let action = $state('publish');
  let siteName = $state(untrack(() => initial.site.name));
  let tagline = $state(untrack(() => initial.site.tagline));
  let contactLinks = $state(untrack(() => copy(initial.site.contactLinks ?? [])));
  let displayName = $state(untrack(() => initial.user.displayName));
  let oldPassword = $state('');
  let newPassword = $state('');
  const media = (asset: string, variant = 'thumbnail') => `/media/source/${asset}?variant=${variant}`;
  const status = (a: ManagedAlbum) =>
    a.status === 'draft'
      ? '草稿'
      : a.status === 'offline'
        ? '已下线'
        : !a.visible
          ? '父级未公开'
          : a.draftVersion !== a.releaseVersion
            ? '有待发布修改'
            : '已发布';
  const below = (candidate: ManagedAlbum, parent: string, published = false) => {
    const seen = new Set<string>();
    let p = published ? candidate.publishedParent : candidate.draft.parent;
    while (p && !seen.has(p)) {
      if (p === parent) return true;
      seen.add(p);
      const a = workspaceData.albums.find((a) => a.id === p);
      p = (published ? a?.publishedParent : a?.draft.parent) ?? null;
    }
    return false;
  };
  let rows = $derived(
    workspaceData.albums.filter(
      (a) =>
        a.draft.title.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'draft' ? a.status === 'draft' : filter === 'online' ? a.visible : !a.visible)),
    ),
  );
  let affected = $derived(
    active
      ? workspaceData.albums.filter(
          (a) =>
            a.id !== active!.id &&
            below(a, active!.id, true) &&
            (action === 'offline'
              ? a.visible
              : a.status === 'published' &&
                (() => {
                  let p = a.publishedParent;
                  while (p && p !== active!.id) {
                    const parent = workspaceData.albums.find((b) => b.id === p);
                    if (!parent || parent.status !== 'published') return false;
                    p = parent.publishedParent;
                  }
                  return p === active!.id;
                })()),
        )
      : [],
  );
  async function api(path: string, body?: unknown) {
    const r = await fetch(
      `/api/${path}`,
      body === undefined
        ? undefined
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    );
    const type = r.headers.get('content-type') ?? '';
    const result = type.includes('application/json') ? await r.json() : { message: await r.text() };
    if (!r.ok) {
      if (r.status === 401) throw new Error('登录已过期。请保留编辑内容，另开登录页重新登录后再保存。');
      throw new Error(result.message ?? '操作失败');
    }
    return result;
  }
  async function run(task: () => Promise<void>) {
    if (busy) return;
    busy = true;
    message = '';
    failed = false;
    try {
      await task();
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '操作失败，请重试。';
    } finally {
      busy = false;
    }
  }
  async function refresh() {
    workspaceData = await api('state');
    if (id) {
      const a = workspaceData.albums.find((a) => a.id === id);
      content = a ? copy(a.draft) : null;
    }
    siteName = workspaceData.site.name;
    tagline = workspaceData.site.tagline;
    contactLinks = copy(workspaceData.site.contactLinks);
    displayName = workspaceData.user.displayName;
  }
  function abandon() {
    return !dirty || window.confirm('有尚未保存的修改。是否放弃这些修改？');
  }
  function select(a: ManagedAlbum) {
    if (!abandon()) return;
    id = a.id;
    content = copy(a.draft);
    tab = 'photos';
    page = 'albums';
    message = '';
  }
  function nav(target: string) {
    if (!abandon()) return;
    page = target;
    id = '';
    content = null;
    message = '';
  }
  function unload(e: BeforeUnloadEvent) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  async function open(kind: string) {
    modal = kind;
    await tick();
    dialog.showModal();
  }
  function close() {
    dialog.close();
    modal = '';
  }
  function create(parent = '') {
    if (!abandon()) return;
    newTitle = '';
    newParent = parent;
    void open('create');
  }
  async function makeAlbum() {
    await run(async () => {
      const result = await api('create', {
        title: newTitle,
        parent: newParent,
        treeVersion: workspaceData.site.treeVersion,
      });
      id = result.id;
      await refresh();
      tab = 'photos';
      close();
      message = '相册已创建，可以开始选片。';
    });
  }
  const versions = () => ({
    id,
    version: active!.version,
    draftVersion: active!.draftVersion,
    treeVersion: workspaceData.site.treeVersion,
  });
  async function save() {
    await run(async () => {
      await api('save', { ...versions(), content });
      await refresh();
      message = '草稿已保存，公开版本未改变。';
    });
  }
  async function source(cursor = '', index = 0) {
    const serial = ++requestId;
    sourceBusy = true;
    message = '';
    try {
      const query = new URLSearchParams({
        album: sourceAlbum,
        tag: sourceTag,
        search: sourceSearch,
        since,
        after: cursor,
      });
      const result = await api(`source?${query}`);
      if (serial !== requestId) return;
      sourceAssets = result.assets;
      sourceAlbums = result.albums;
      sourceTags = result.tags;
      next = result.next;
      cursorIndex = index;
      for (const a of sourceAssets) cache[a.id] = a;
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '无法读取图库';
    } finally {
      if (serial === requestId) sourceBusy = false;
    }
  }
  async function pick() {
    selected = [];
    sourceAlbum = '';
    sourceTag = '';
    sourceSearch = '';
    since = '';
    cursors = [''];
    await open('picker');
    await source();
  }
  function toggle(asset: SourcePhoto) {
    selected = selected.some((a) => a.id === asset.id)
      ? selected.filter((a) => a.id !== asset.id)
      : [...selected, asset];
  }
  function add() {
    if (!content) return;
    for (const a of selected) {
      if (!content.photos.some((p) => p.asset === a.id))
        content.photos.push({
          id: crypto.randomUUID(),
          asset: a.id,
          title: '',
          description: '',
          alt: '',
          location: 'inherit',
        });
    }
    if (!content.cover) content.cover = content.photos[0]?.asset ?? '';
    close();
    message = `已加入 ${selected.length} 张照片，请保存草稿。`;
  }
  function editPhoto(p: DraftPhoto) {
    edited = copy(p);
    void open('photo');
  }
  async function confirmAction() {
    await run(async () => {
      await api(action === 'publish' ? 'publish' : action === 'delete' ? 'delete' : 'availability', {
        ...versions(),
        action,
      });
      if (action === 'delete') {
        id = '';
        content = null;
      }
      await refresh();
      close();
      message =
        action === 'delete'
          ? '草稿相册已删除。'
          : action === 'publish'
            ? '相册已发布，可以打开前台查看。'
            : action === 'offline'
              ? '相册已下线。'
              : '公开版本已恢复，草稿修改未发布。';
    });
  }
</script>

<svelte:window onbeforeunload={unload} />
<svelte:head><title>相册工作台 · {workspaceData.site.name}</title></svelte:head>
<div class="workspace live-workspace">
  <aside class="sidebar">
    <a class="brand" href="/albums"><span class="brand-mark">G</span><span>Gallery<small>创作工作台</small></span></a>
    <p class="nav-label">内容管理</p>
    <nav aria-label="后台导航">
      <button class:active={page === 'albums'} onclick={() => nav('albums')}
        >▦ <span>相册</span><small>{workspaceData.albums.length}</small></button
      ><button class:active={page === 'settings'} onclick={() => nav('settings')}>⚙ <span>站点设置</span></button>
    </nav>
    <div class="album-tree">
      <div class="tree-heading">
        <span>最近的相册</span><button aria-label="新建相册" onclick={() => create()}>＋</button>
      </div>
      {#each workspaceData.albums as a}<button class:chosen={id === a.id} onclick={() => select(a)}
          ><span class="tree-dot" class:online={a.visible}></span><span>{a.draft.title}</span></button
        >{/each}
    </div>
    <div class="sidebar-bottom">
      <a class="connection" href={workspaceData.publicOrigin + '/albums'} target="_blank" rel="noreferrer"
        >↗ 打开 Gallery 前台</a
      ><button class="account" onclick={() => nav('account')}
        ><span class="avatar">{workspaceData.user.displayName.slice(0, 1)}</span><span
          >{workspaceData.user.displayName}<small>Gallery 管理员</small></span
        ></button
      >
    </div>
  </aside>
  <main class="main">
    <div class="topline">
      <span>工作台 / {page === 'albums' ? '相册' : page === 'settings' ? '站点设置' : '个人账号'}</span><a
        href="/login"
        target="_blank"
        rel="noreferrer">登录页</a
      >
    </div>
    {#if message}<div class="toast" class:error={failed} role={failed ? 'alert' : 'status'}>
        <span>{message}</span><button aria-label="关闭提示" onclick={() => (message = '')}>×</button>
      </div>{/if}
    {#if page === 'albums' && !active}<header class="page-heading">
        <div>
          <p class="eyebrow">YOUR COLLECTIONS</p>
          <h1>相册</h1>
          <p class="muted">从照片到故事，整理每一段值得分享的记忆。</p>
        </div>
        <button class="primary" onclick={() => create()}>＋ 新建相册</button>
      </header>
      <div class="stats">
        <div><span>全部相册</span><strong>{workspaceData.albums.length}</strong></div>
        <div><span>前台可见</span><strong>{workspaceData.albums.filter((a) => a.visible).length}</strong></div>
        <div>
          <span>待发布草稿 / 修改</span><strong
            >{workspaceData.albums.filter((a) => a.draftVersion !== a.releaseVersion).length}</strong
          >
        </div>
      </div>
      <section class="panel">
        <div class="list-tools">
          <div class="filter-tabs">
            {#each [['all', '全部'], ['online', '已公开'], ['draft', '草稿'], ['offline', '不可见']] as [value, label]}<button
                class:chosen={filter === value}
                onclick={() => (filter = value!)}>{label}</button
              >{/each}
          </div>
          <input aria-label="搜索相册" class="search" bind:value={search} placeholder="搜索相册名称…" />
        </div>
        <div class="album-table">
          <div class="table-head"><span>相册名称</span><span>内容</span><span>发布状态</span><span>操作</span></div>
          {#each rows as a}<div class="album-row">
              <button class="album-name" onclick={() => select(a)}
                >{#if a.draft.cover}<img src={media(a.draft.cover)} alt="" />{:else}<span class="cover-empty">▦</span
                  >{/if}<span
                  ><strong>{a.draft.title || '未命名相册'}</strong><small
                    >{workspaceData.albums.find((p) => p.id === a.draft.parent)?.draft.title ?? '顶级相册'}</small
                  ></span
                ></button
              ><span class="row-count"
                >{a.draft.photos.length} 张照片<small
                  >{workspaceData.albums.filter((p) => p.draft.parent === a.id).length} 个子相册</small
                ></span
              ><span class="badge" class:green={a.visible}>{status(a)}</span><button
                class="quiet row-edit"
                onclick={() => select(a)}>编辑 →</button
              >
            </div>{/each}{#if !rows.length}<div class="empty large">
              <h3>{workspaceData.albums.length ? '没有符合条件的相册' : '创建你的第一本相册'}</h3>
              <p>从 Immich 选片，写下故事，再发布到 Gallery。</p>
            </div>{/if}
        </div>
      </section>
    {:else if page === 'albums' && active && content}<button class="back" onclick={() => nav('albums')}
        >← 返回相册列表</button
      >
      <header class="editor-heading">
        <div>
          <div class="title-line">
            <h1>{content.title || '未命名相册'}</h1>
            <span class="badge" class:green={active.visible}>{status(active)}</span>
          </div>
          <p class="muted">{dirty ? '有尚未保存的修改' : `草稿已保存 · 版本 ${active.draftVersion}`}</p>
        </div>
        <div class="actions">
          <button disabled={busy || !dirty} onclick={save}>保存草稿</button><a
            class="button-link"
            class:disabled={dirty}
            aria-disabled={dirty}
            href={dirty ? undefined : `/preview/${id}`}
            target="_blank"
            rel="noreferrer">预览草稿</a
          ><button
            class="primary"
            disabled={busy || dirty}
            onclick={() => {
              action = 'publish';
              void open('confirm');
            }}>{active.status === 'draft' ? '发布相册' : '发布更新'} ↗</button
          >
        </div>
      </header>
      {#if dirty}<p class="footnote">请先保存，再预览或发布。切换相册前会提醒保留修改。</p>{/if}
      <div class="editor-tabs">
        {#each [['photos', `照片与子相册 (${content.photos.length})`], ['story', '相册介绍'], ['settings', '基本设置']] as [value, label]}<button
            class:chosen={tab === value}
            onclick={() => (tab = value!)}>{label}</button
          >{/each}
      </div>
      <div class="editor-layout">
        <section class="editor-body">
          {#if tab === 'photos'}<section class="panel content-panel">
              <div class="section-heading">
                <div>
                  <h2>子相册</h2>
                  <p class="muted">本册可以同时收录子相册与直接照片。</p>
                </div>
                <button class="quiet" onclick={() => create(id)}>＋ 新建子相册</button>
              </div>
              <div class="child-list">
                {#each workspaceData.albums.filter((a) => a.draft.parent === id) as child}<button
                    onclick={() => select(child)}
                    ><span>▦</span><span><strong>{child.draft.title}</strong><small>{status(child)}</small></span><span
                      >→</span
                    ></button
                  >{/each}{#if !workspaceData.albums.some((a) => a.draft.parent === id)}<p class="muted compact-empty">
                    还没有子相册。
                  </p>{/if}
              </div>
            </section>
            <section class="panel content-panel"><AlbumPhotosEditor bind:content {editPhoto} {pick} /></section>
          {:else if tab === 'story'}<section class="panel content-panel">
              <div class="section-heading">
                <div>
                  <h2>相册介绍</h2>
                  <p class="muted">在相册右侧展示；手机上展开阅读。</p>
                </div>
                <span class="badge">文字内容</span>
              </div>
              <MarkdownEditor label="相册正文" bind:value={content.markdown} filename={`${content.slug}.md`} />
              <details style="margin-top:20px">
                <summary>可选摘要 · 用于列表与分享</summary><label
                  >摘要<textarea rows="2" maxlength="2000" bind:value={content.summary}></textarea></label
                >
                <p class="muted">留空时自动提取正文，详情页不重复展示摘要。</p>
              </details>
            </section>
          {:else}<section class="panel content-panel form-panel">
              <h2>基本设置</h2>
              <label>相册标题<input maxlength="200" bind:value={content.title} /></label><label
                >访问地址
                <div class="input-prefix">
                  <span>/albums/</span><input
                    maxlength="120"
                    readonly={active.status !== 'draft'}
                    bind:value={content.slug}
                  />
                </div>
                <small>首次发布后固定，更改标题或父级不会改变地址。</small></label
              ><label
                >所属父相册<select bind:value={content.parent}
                  ><option value="">无，作为顶级相册</option
                  >{#each workspaceData.albums.filter((a) => a.id !== id && !below(a, id)) as a}<option value={a.id}
                      >{a.draft.title}</option
                    >{/each}</select
                ></label
              ><label
                >同级排序<input type="number" min="0" step="1" bind:value={content.position} /><small
                  >数值越小越靠前，发布后生效。</small
                ></label
              ><label
                >封面照片<select bind:value={content.cover}
                  ><option value="">暂不设置封面</option>{#each content.photos as p, index}<option value={p.asset}
                      >{p.title || `本册照片 ${index + 1}`}</option
                    >{/each}{#each workspaceData.albums.filter((a) => a.visible && below(a, id, true)) as child}{#each child.draft.photos.filter((p) => !content!.photos.some((q) => q.asset === p.asset)) as p}<option
                        value={p.asset}>{child.draft.title} / {p.title || '照片'}（发布时校验）</option
                      >{/each}{/each}</select
                ></label
              ><label
                >本册位置公开方式<select bind:value={content.location}
                  ><option value="hidden">隐藏位置（默认）</option><option value="approximate">近似位置</option><option
                    value="exact">精确位置</option
                  ></select
                ><small>照片可以进一步收紧精度，不能突破本册设置。GPS 跟随 Immich 更新。</small></label
              ><label class="checkbox-label"
                ><input type="checkbox" bind:checked={content.showExif} /> 展示相机与镜头 EXIF 参数</label
              >
            </section>{/if}
        </section>
        <aside class="context-panel">
          <section class="panel">
            <p class="eyebrow">发布概况</p>
            <h3>{active.status === 'draft' ? '还在酝酿中' : '已有公开版本'}</h3>
            <p class="muted">草稿修改在再次发布后才会更新前台。</p>
            <dl>
              <div>
                <dt>照片数量</dt>
                <dd>{content.photos.length} 张</dd>
              </div>
              <div>
                <dt>前台访问</dt>
                <dd>{active.visible ? '可见' : '不可见'}</dd>
              </div>
            </dl>
            {#if active.status !== 'draft'}<a
                class="button-link wide"
                href={`${workspaceData.publicOrigin}/albums/${active.draft.slug}`}
                target="_blank"
                rel="noreferrer">查看前台效果 ↗</a
              ><button
                class="quiet wide"
                disabled={busy}
                onclick={() => {
                  action = active!.status === 'offline' ? 'restore' : 'offline';
                  void open('confirm');
                }}>{active.status === 'offline' ? '恢复公开版本' : '下线相册'}</button
              >{/if}<button
              class="quiet wide"
              disabled={busy}
              onclick={() => {
                if (abandon())
                  void run(async () => {
                    await refresh();
                    message = '已重新载入服务器上的草稿。';
                  });
              }}>重新载入草稿</button
            >
            {#if active.status === 'draft'}<button
                class="quiet wide"
                disabled={busy}
                onclick={() => {
                  action = 'delete';
                  void open('confirm');
                }}>删除草稿相册</button
              >{/if}
          </section>
        </aside>
      </div>
    {:else if page === 'settings'}<header class="page-heading">
        <div>
          <p class="eyebrow">SITE PREFERENCES</p>
          <h1>站点设置</h1>
        </div>
      </header>
      <section class="panel content-panel form-panel settings-form">
        <label>站点名称<input bind:value={siteName} maxlength="100" /></label><label
          >站点简介<textarea bind:value={tagline} maxlength="2000" rows="3"></textarea></label
        ><button
          class="primary"
          disabled={busy}
          onclick={() =>
            run(async () => {
              await api('site', { name: siteName, tagline, contactLinks, version: workspaceData.site.version });
              await refresh();
              message = '站点设置已应用到前台。';
            })}>保存并应用</button
        >
        <h2>联系链接</h2>
        {#each contactLinks as contact, i}<div class="form-panel">
            <label>链接名称 {i + 1}<input bind:value={contact.label} maxlength="100" /></label><label
              >链接地址 {i + 1}<input
                bind:value={contact.url}
                placeholder="https:// 或 mailto:"
                maxlength="2000"
              /></label
            ><button onclick={() => contactLinks.splice(i, 1)}>移除链接 {i + 1}</button>
          </div>{/each}
        <button disabled={contactLinks.length >= 10} onclick={() => contactLinks.push({ label: '', url: '' })}
          >添加联系链接</button
        >
        <p class="muted">填写后使用上方“保存并应用”，前台关于页随之更新。</p>
        <hr />
        <h2>页面与域名</h2>
        <p class="muted">前台导航：相册 / 关于。关于页当前为静态文章，文章选篇后续加入。</p>
        <a href={workspaceData.publicOrigin + '/albums'} target="_blank" rel="noreferrer"
          >{workspaceData.publicOrigin}</a
        >
      </section>
    {:else}<header class="page-heading">
        <div>
          <p class="eyebrow">YOUR ACCOUNT</p>
          <h1>个人账号</h1>
          <p class="muted">{workspaceData.user.displayName} · {workspaceData.user.email}</p>
        </div>
      </header>
      <section class="panel content-panel form-panel settings-form">
        <h2>昵称</h2>
        <label>显示昵称<input bind:value={displayName} maxlength="100" /></label>
        <button
          class="primary"
          disabled={busy}
          onclick={() =>
            void run(async () => {
              await api('profile', { displayName });
              await refresh();
              message = '昵称已更新。';
            })}>保存昵称</button
        >
        <h2>修改密码</h2>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('password', { oldPassword, newPassword });
              oldPassword = '';
              newPassword = '';
              window.location.assign('/login');
            });
          }}
        >
          <label
            >当前密码<input type="password" autocomplete="current-password" bind:value={oldPassword} required /></label
          ><label
            >新密码<input
              type="password"
              autocomplete="new-password"
              bind:value={newPassword}
              minlength="16"
              maxlength="256"
              required
            /><small>至少 16 个字符。修改后所有旧会话失效，需要重新登录。</small></label
          ><button class="primary" disabled={busy}>更新密码并退出</button>
        </form>
        <hr />
        <button
          disabled={busy}
          onclick={() =>
            run(async () => {
              await api('logout', {});
              window.location.assign('/login');
            })}>退出登录</button
        >
      </section>{/if}
  </main>
</div>
<dialog
  bind:this={dialog}
  class:wide-dialog={modal === 'picker' || modal === 'photo'}
  aria-labelledby="manager-modal"
  onclose={() => (modal = '')}
>
  {#if modal}<div class="dialog-heading">
      <div>
        <p class="eyebrow">GALLERY STUDIO</p>
        <h2 id="manager-modal">
          {modal === 'create'
            ? '新建相册'
            : modal === 'picker'
              ? '从 Immich 选片'
              : modal === 'photo'
                ? '编辑照片信息'
                : action === 'delete'
                  ? '删除草稿相册'
                  : action === 'publish'
                    ? '发布前确认'
                    : action === 'offline'
                      ? '下线相册'
                      : '恢复公开版本'}
        </h2>
      </div>
      <button class="close-button" aria-label="关闭弹窗" disabled={busy} onclick={close}>×</button>
    </div>
    {#if failed && message}<p class="error modal-error" role="alert">{message}</p>{/if}
    {#if modal === 'create'}<form
        class="dialog-body form-panel"
        onsubmit={(e) => {
          e.preventDefault();
          void makeAlbum();
        }}
      >
        <label>相册标题<input required maxlength="200" bind:value={newTitle} /></label><label
          >所属父相册<select bind:value={newParent}
            ><option value="">无，作为顶级相册</option>{#each workspaceData.albums as a}<option value={a.id}
                >{a.draft.title}</option
              >{/each}</select
          ></label
        >
        <div class="dialog-actions">
          <button type="button" disabled={busy} onclick={close}>取消</button><button class="primary" disabled={busy}
            >创建并编辑 →</button
          >
        </div>
      </form>
    {:else if modal === 'picker'}<div class="picker-layout">
        <aside class="picker-sidebar">
          <p class="eyebrow">来源相册</p>
          <button
            class:chosen={!sourceAlbum}
            onclick={() => {
              sourceAlbum = '';
              cursors = [''];
              void source();
            }}>全部授权照片</button
          >{#each sourceAlbums as album}<button
              class:chosen={sourceAlbum === album.id}
              onclick={() => {
                sourceAlbum = album.id;
                cursors = [''];
                void source();
              }}>{album.name}</button
            >{/each}
          <p class="footnote">切换筛选和翻页会保留已选照片。</p>
        </aside>
        <section class="picker-main">
          <form
            class="picker-filters"
            onsubmit={(e) => {
              e.preventDefault();
              cursors = [''];
              void source();
            }}
          >
            <input aria-label="搜索文件名" placeholder="搜索文件名…" bind:value={sourceSearch} /><select
              aria-label="按标签筛选"
              bind:value={sourceTag}
              ><option value="">全部标签</option>{#each sourceTags as tag}<option value={tag.id}>{tag.name}</option
                >{/each}</select
            ><label class="date-filter">拍摄日期起<input type="date" bind:value={since} /></label><button
              disabled={sourceBusy}>应用筛选</button
            >
          </form>
          <p class="muted">
            {sourceBusy ? '正在读取图库…' : `${sourceAssets.length} 张照片 · 已在本册的照片不会重复添加`}
          </p>
          <div class="asset-grid">
            {#each sourceAssets as asset}{@const added = content?.photos.some((p) => p.asset === asset.id)}<button
                class="asset-card"
                class:selected={selected.some((a) => a.id === asset.id)}
                aria-pressed={selected.some((a) => a.id === asset.id)}
                disabled={added || sourceBusy}
                aria-label={`${asset.filename}${added ? ' · 已在本册' : ''}`}
                onclick={() => toggle(asset)}
                ><div>
                  <img src={media(asset.id)} alt="" loading="lazy" /><span class="selection-check"
                    >{added || selected.some((a) => a.id === asset.id) ? '✓' : '+'}</span
                  >{#if added}<span class="asset-state">已在本册</span>{/if}
                </div>
                <strong>{asset.filename}</strong><small
                  >{asset.takenAt.slice(0, 10)}{asset.city ? ` · ${asset.city}` : ''}</small
                ></button
              >{/each}
          </div>
          {#if !sourceBusy && !sourceAssets.length}<div class="empty">
              当前筛选下没有可用照片。请确认来源范围及 Immich 缩略图已生成。
            </div>{/if}
          <div class="pagination">
            <button
              disabled={cursorIndex === 0 || sourceBusy}
              onclick={() => source(cursors[cursorIndex - 1], cursorIndex - 1)}>← 上一页</button
            ><span>第 {cursorIndex + 1} 页</span><button
              disabled={!next || sourceBusy}
              onclick={() => {
                cursors[cursorIndex + 1] = next!;
                void source(next!, cursorIndex + 1);
              }}>下一页 →</button
            >
          </div>
        </section>
      </div>
      <footer class="picker-footer">
        <div><strong>已选 {selected.length} 张</strong><small>将加入「{content?.title}」</small></div>
        <div class="actions">
          <button onclick={() => (selected = [])} disabled={!selected.length}>清空选择</button><button
            class="primary"
            onclick={add}
            disabled={!selected.length}>加入相册 ({selected.length})</button
          >
        </div>
      </footer>
    {:else if modal === 'photo' && edited}<div class="photo-editor">
        <div class="photo-editor-image">
          <img src={media(edited.asset, 'preview')} alt={edited.alt || '照片'} />
          <p>{cache[edited.asset]?.filename ?? 'Immich 来源照片'}</p>
        </div>
        <div class="form-panel">
          <label>照片标题<input maxlength="200" bind:value={edited.title} /></label><MarkdownEditor
            label={edited.group ? '角度说明' : '照片描述'}
            bind:value={edited.description}
            maxLength={50000}
            filename="photo.md"
          />
          <details>
            <summary>高级设置</summary><label
              >画面描述（无障碍，选填）<input maxlength="500" bind:value={edited.alt} /></label
            >
            <p class="footnote">简要描述画面，供读屏软件或图片加载失败时使用。</p>
            <label
              >向访客展示的位置<select bind:value={edited.location}
                ><option value="inherit">跟随相册设置</option><option value="hidden">隐藏位置</option><option
                  value="approximate">近似位置</option
                ><option value="exact">精确位置（受相册设置限制）</option></select
              ></label
            >
            <p class="footnote">近似位置会模糊坐标，不等同于城市中心；不会修改 Immich 的 GPS。</p>
          </details>
          <p class="footnote">文案只属于当前 Gallery 相册，不回写 Immich。</p>
        </div>
      </div>
      <div class="dialog-actions">
        <button onclick={close}>取消</button><button
          class="primary"
          onclick={() => {
            const index = content!.photos.findIndex((p) => p.id === edited!.id);
            content!.photos[index] = copy(edited!);
            close();
          }}>应用到草稿</button
        >
      </div>
    {:else if modal === 'confirm' && active}<div class="dialog-body">
        <h3>{active.draft.title}</h3>
        <p>
          {action === 'delete'
            ? '删除这本尚未发布的相册及其 Gallery 文案。Immich 原片不受影响。包含子相册时需要先移走或删除子相册。'
            : action === 'publish'
              ? '将已保存草稿发布为新版本。子相册草稿不会自动发布。'
              : action === 'offline'
                ? '当前相册及其公开后代将停止对外访问，包括图片直链。'
                : '恢复原有公开版本，不发布草稿修改。'}
        </p>
        {#if action !== 'delete'}<div class="validation">
            <strong
              >{active.draft.photos.length} 张草稿照片 · {action === 'publish'
                ? `草稿版本 ${active.draftVersion}`
                : `${affected.length} 本后代相册将${action === 'offline' ? '停止' : '恢复'}访问`}</strong
            >{#if action !== 'publish' || active.status === 'offline'}<ul>
                {#each affected as a}<li>{a.draft.title}</li>{/each}
              </ul>
              <p>单独下线的子相册保持下线。</p>{/if}
          </div>
          <p class="muted">
            {action === 'publish' ? '发布时会重新校验照片来源、封面、版本和父级状态。' : '影响范围按公开层级计算。'}
          </p>{/if}
        <div class="dialog-actions">
          <button disabled={busy} onclick={close}>取消</button><button
            class:danger={action === 'offline' || action === 'delete'}
            class:primary={action !== 'offline' && action !== 'delete'}
            disabled={busy}
            onclick={confirmAction}
            >{busy
              ? '正在处理…'
              : action === 'delete'
                ? '确认删除'
                : action === 'publish'
                  ? '确认发布'
                  : action === 'offline'
                    ? '确认下线'
                    : '确认恢复'}</button
          >
        </div>
      </div>{/if}{/if}
</dialog>

<style>
  .live-workspace {
    min-height: 100dvh;
  }
  .button-link {
    display: inline-block;
    text-decoration: none;
    border: 1px solid #dce2dc;
    border-radius: 7px;
    padding: 8px 12px;
    background: white;
    color: #2e4032;
    font-size: 12px;
    text-align: center;
    box-sizing: border-box;
  }
  .button-link.disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 10px;
  }
  .checkbox-label input {
    width: auto !important;
    margin: 0 !important;
  }
  .modal-error {
    padding: 0 25px;
  }
  .toast.error {
    background: #fff0e9;
    border-color: #ead2c8;
  }
  .album-tree {
    overflow: auto;
    max-height: 50vh;
  }
  .asset-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 780px) {
    .asset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
