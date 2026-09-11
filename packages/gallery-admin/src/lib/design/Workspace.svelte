<script lang="ts">
  import { tick } from 'svelte';
  import Preview from './Preview.svelte';
  import { imageCredits } from './credits';
  import {
    accessible,
    assets,
    blankPhoto,
    copy,
    descendants,
    differs,
    emptyContent,
    image,
    initialAlbums,
    source,
    validation,
    type Album,
    type Content,
    type Photo,
    type Block,
  } from './model';
  import './admin.css';

  let albums = $state(initialAlbums());
  let page = $state<'albums' | 'settings' | 'account'>('albums');
  let currentId = $state('');
  let active = $derived(albums.find((a) => a.id === currentId));
  let section = $state<'photos' | 'story' | 'settings'>('photos');
  let search = $state('');
  let statusFilter = $state('all');
  let treeFilter = $state('');
  let modal = $state('');
  let dialog: HTMLDialogElement;
  let toast = $state('');
  let newTitle = $state('');
  let newParent = $state('');
  let newError = $state('');
  let sequence = $state(1);
  let selected = $state<string[]>([]);
  let sourceFilter = $state('');
  let assetSearch = $state('');
  let tagFilter = $state('');
  let dateFilter = $state('');
  let pickerPage = $state(1);
  let editedPhoto = $state<Photo | null>(null);
  let previewMode = $state<'draft' | 'release'>('draft');
  let previewPhone = $state(false);
  let siteName = $state('光与远方');
  let siteDraft = $state('光与远方');
  let siteDescription = $state('记录旅行，也记录日常。');
  let siteSavedDescription = $state('记录旅行，也记录日常。');
  let signedIn = $state(true);
  let accountName = $state('摄影者');
  let accountDraft = $state('摄影者');
  const status = (a: Album) =>
    !a.release
      ? '草稿'
      : a.offline
        ? '已下线'
        : !accessible(albums, a)
          ? '父级未公开'
          : differs(a.draft, a.release)
            ? '有待发布修改'
            : '已发布';
  const depth = (a: Album) => {
    let n = 0;
    let parent = a.draft.parent;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      n++;
      parent = albums.find((b) => b.id === parent)?.draft.parent ?? '';
    }
    return n;
  };
  let ordered = $derived.by(() => {
    const result: Album[] = [];
    const add = (parent: string) => {
      for (const a of albums.filter((a) => a.draft.parent === parent)) {
        if (!result.includes(a)) {
          result.push(a);
          add(a.id);
        }
      }
    };
    add('');
    return result;
  });
  let filtered = $derived(
    ordered.filter(
      (a) =>
        a.draft.title.toLowerCase().includes(search.toLowerCase()) &&
        (!treeFilter || a.id === treeFilter || descendants(albums, treeFilter).some((b) => b.id === a.id)) &&
        (statusFilter === 'all' ||
          (statusFilter === 'draft'
            ? !a.release
            : statusFilter === 'online'
              ? accessible(albums, a)
              : statusFilter === 'changes'
                ? !!a.release && differs(a.draft, a.release)
                : !!a.release && !accessible(albums, a))),
    ),
  );
  let pickerMatches = $derived(
    assets.filter(
      (a) =>
        (!sourceFilter || a.source === sourceFilter) &&
        (!tagFilter || a.tag === tagFilter) &&
        (!dateFilter || a.date >= dateFilter) &&
        a.name.toLowerCase().includes(assetSearch.toLowerCase()),
    ),
  );
  let errors = $derived(active ? validation(albums, active) : []);
  let previewContent = $derived(active ? (previewMode === 'draft' ? active.draft : active.release) : null);
  let previewChildren = $derived(
    active
      ? albums
          .filter((a) =>
            previewMode === 'draft'
              ? a.draft.parent === active.id
              : a.release?.parent === active.id && accessible(albums, a),
          )
          .map((a) => (previewMode === 'draft' ? a.draft : a.release!))
      : [],
  );
  let affected = $derived(active ? descendants(albums, active.id, true).filter((a) => accessible(albums, a)) : []);
  let restored = $derived.by(() => {
    if (!active) return [];
    const candidate = copy(albums);
    const restoredAlbum = candidate.find((a) => a.id === active.id)!;
    restoredAlbum.offline = false;
    if (modal === 'publish') restoredAlbum.release = copy(active.draft);
    return descendants(candidate, active.id, true).filter(
      (a) =>
        accessible(candidate, a) &&
        !accessible(
          albums,
          albums.find((b) => b.id === a.id)!,
        ),
    );
  });
  async function open(kind: string) {
    modal = kind;
    await tick();
    dialog.showModal();
  }
  function close() {
    dialog.close();
    modal = '';
  }
  function notify(message: string) {
    toast = message;
  }
  function edit(a: Album) {
    currentId = a.id;
    section = 'photos';
    toast = '';
  }
  function create() {
    if (!newTitle.trim()) {
      newError = '请填写相册标题。';
      return;
    }
    const id = `album-${sequence++}`;
    const draft = { ...emptyContent(), title: newTitle.trim(), parent: newParent, slug: id };
    const a: Album = { id, draft, saved: copy(draft), release: null, offline: false, version: 0 };
    albums.push(a);
    close();
    edit(a);
    notify('草稿已创建。接下来可以从 Immich 选片。');
  }
  function newAlbum(parent = '') {
    newTitle = '';
    newParent = parent;
    newError = '';
    void open('create');
  }
  function save() {
    if (!active) return;
    active.saved = copy(active.draft);
    notify('草稿已保存到本次演示；已发布版本保持原样。');
  }
  function pick() {
    selected = [];
    sourceFilter = '';
    assetSearch = '';
    tagFilter = '';
    dateFilter = '';
    pickerPage = 1;
    void open('picker');
  }
  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
  }
  function addPhotos() {
    if (!active) return;
    for (const id of selected) {
      if (!active.draft.photos.some((p) => p.asset === id) && source(id).available)
        active.draft.photos.push(blankPhoto(id));
    }
    if (!active.draft.cover) active.draft.cover = active.draft.photos[0]?.asset ?? '';
    close();
    notify(`已加入 ${selected.length} 张照片。标题与描述由 Gallery 独立维护。`);
  }
  function movePhoto(index: number, offset: number) {
    if (!active) return;
    const items = [...active.draft.photos];
    [items[index], items[index + offset]] = [items[index + offset]!, items[index]!];
    active.draft.photos = items;
  }
  function removePhoto(id: string) {
    if (!active) return;
    active.draft.photos = active.draft.photos.filter((p) => p.asset !== id);
    if (active.draft.cover === id) active.draft.cover = active.draft.photos[0]?.asset ?? '';
    notify('照片已从草稿移除，Immich 原片保持原样。');
  }
  function photoEdit(photo: Photo) {
    editedPhoto = copy(photo);
    void open('photo');
  }
  function savePhoto() {
    if (!active || !editedPhoto) return;
    const index = active.draft.photos.findIndex((p) => p.asset === editedPhoto!.asset);
    active.draft.photos[index] = copy(editedPhoto);
    close();
  }
  function addBlock(kind: Block['kind']) {
    active?.draft.blocks.push({ kind, text: '' });
  }
  function publish() {
    if (!active || errors.length) return;
    active.saved = copy(active.draft);
    active.release = copy(active.draft);
    active.offline = false;
    active.version++;
    close();
    notify(`已模拟发布第 ${active.version} 版。可点击“已发布效果”核对。`);
  }
  function availability() {
    if (!active) return;
    active.offline = !active.offline;
    close();
    notify(active.offline ? '已模拟下线。当前相册与公开后代停止访问。' : '已恢复现有公开版本；草稿修改未发布。');
  }
  function preview(mode: 'draft' | 'release') {
    previewMode = mode;
    previewPhone = false;
    void open('preview');
  }
</script>

<svelte:head><title>Gallery 管理工作台 · 交互原型</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<div class="prototype-bar">
  <span><b>交互原型</b> 示例数据 · 刷新后重置</span><button onclick={() => void open('guide')}
    >使用说明与素材署名 ↗</button
  >
</div>
{#if !signedIn}
  <main class="login">
    <div class="brand-mark">G</div>
    <p class="eyebrow">GALLERY STUDIO</p>
    <h1>回到你的相册工作台</h1>
    <p class="muted">使用独立的 Gallery 账号管理作品。</p>
    <div class="login-card">
      <h2>管理员登录</h2>
      <p>当前为界面演示，不需要输入真实账号或密码。</p>
      <label>演示账号<input value="photographer@example.com" readonly /></label><button
        class="primary"
        onclick={() => {
          signedIn = true;
          notify('已进入演示工作台。');
        }}>进入演示工作台 →</button
      ><small>正式接入时支持独立账号验证和会话管理。</small>
    </div>
  </main>
{:else}
  <div class="workspace">
    <aside class="sidebar">
      <a class="brand" href="/design"><span class="brand-mark">G</span><span>Gallery <small>创作工作台</small></span></a
      >
      <p class="nav-label">内容管理</p>
      <nav aria-label="后台导航">
        <button
          class:active={page === 'albums'}
          onclick={() => {
            page = 'albums';
            currentId = '';
          }}>▦ <span>相册</span><small>{albums.length}</small></button
        ><button
          class:active={page === 'settings'}
          onclick={() => {
            page = 'settings';
            currentId = '';
          }}>⚙ <span>站点设置</span></button
        >
      </nav>
      {#if page === 'albums'}<div class="album-tree">
          <div class="tree-heading">
            <span>相册结构 · 草稿</span><button aria-label="新建顶级相册" onclick={() => newAlbum()}>＋</button>
          </div>
          <button
            class:chosen={!treeFilter && !currentId}
            onclick={() => {
              treeFilter = '';
              currentId = '';
            }}>全部相册</button
          >{#each ordered as a}<button
              class:chosen={a.id === currentId || (!currentId && treeFilter === a.id)}
              style={`padding-left:${12 + depth(a) * 14}px`}
              onclick={() => {
                treeFilter = a.id;
                currentId = '';
              }}><span class="tree-dot" class:online={accessible(albums, a)}></span><span>{a.draft.title}</span></button
            >{/each}
        </div>{/if}
      <div class="sidebar-bottom">
        <span class="connection"><i></i> Immich · 示例来源</span><button
          class="account"
          onclick={() => {
            page = 'account';
            currentId = '';
          }}><span class="avatar">摄</span><span>{accountName}<small>Gallery 管理员</small></span><span>↗</span></button
        >
      </div>
    </aside>
    <main class="main">
      <div class="topline">
        <span
          >工作台 <span class="muted">
            / {page === 'albums' ? '相册' : page === 'settings' ? '站点设置' : '个人账号'}</span
          ></span
        ><span class="muted">{siteName}</span>
      </div>
      {#if toast}<div class="toast" role="status">
          <span>✓ {toast}</span><button aria-label="关闭提示" onclick={() => (toast = '')}>×</button>
        </div>{/if}
      {#if page === 'albums' && !active}
        <header class="page-heading">
          <div>
            <p class="eyebrow">YOUR COLLECTIONS</p>
            <h1>相册</h1>
            <p class="muted">从照片到故事，整理每一段值得分享的记忆。</p>
          </div>
          <button class="primary" onclick={() => newAlbum(treeFilter)}>＋ 新建相册</button>
        </header>
        <div class="stats">
          <div><span>全部相册</span><strong>{albums.length}<small>本</small></strong></div>
          <div>
            <span>前台可见</span><strong>{albums.filter((a) => accessible(albums, a)).length}<small>本</small></strong>
          </div>
          <div>
            <span>待发布草稿 / 修改</span><strong
              >{albums.filter((a) => !a.release || differs(a.draft, a.release)).length}<small>本</small></strong
            >
          </div>
        </div>
        <section class="panel">
          <div class="list-tools">
            <div class="filter-tabs" aria-label="相册状态">
              {#each [['all', '全部'], ['online', '已公开'], ['draft', '草稿'], ['changes', '待更新'], ['offline', '不可见']] as [value, label]}<button
                  class:chosen={statusFilter === value}
                  onclick={() => (statusFilter = value!)}>{label}</button
                >{/each}
            </div>
            <input class="search" aria-label="搜索相册" bind:value={search} placeholder="搜索相册名称…" />
          </div>
          {#if treeFilter}<div class="filter-notice">
              当前分支：{albums.find((a) => a.id === treeFilter)?.draft.title}<button onclick={() => (treeFilter = '')}
                >显示全部 ×</button
              >
            </div>{/if}
          <div class="album-table">
            <div class="table-head"><span>相册名称</span><span>内容</span><span>发布状态</span><span>操作</span></div>
            {#each filtered as a}<div class="album-row">
                <button class="album-name" onclick={() => edit(a)}
                  >{#if a.draft.cover}<img src={image(a.draft.cover)} alt="" />{:else}<span class="cover-empty">▦</span
                    >{/if}<span
                    ><strong>{a.draft.title || '未命名相册'}</strong><small
                      >{a.draft.parent ? albums.find((b) => b.id === a.draft.parent)?.draft.title : '顶级相册'}</small
                    ></span
                  ></button
                ><span class="row-count"
                  >{a.draft.photos.length} 张照片<small
                    >{albums.filter((b) => b.draft.parent === a.id).length} 个子相册</small
                  ></span
                ><span
                  ><span
                    class="badge"
                    class:green={accessible(albums, a)}
                    class:amber={differs(a.draft, a.release) && !!a.release}>{status(a)}</span
                  >{#if a.release}<small class="release-note">公开版本 v{a.version}</small>{/if}</span
                ><button class="quiet row-edit" onclick={() => edit(a)}>编辑 →</button>
              </div>{/each}{#if !filtered.length}<div class="empty">
                没有符合条件的相册。可以调整筛选，或新建一本相册。
              </div>{/if}
          </div>
        </section>
        <p class="footnote">相册结构由 Gallery 独立维护。Immich 相册仅用于选片筛选。</p>
      {:else if page === 'albums' && active}
        <button class="back" onclick={() => (currentId = '')}>← 返回相册列表</button>
        <header class="editor-heading">
          <div>
            <div class="title-line">
              <h1>{active.draft.title || '未命名相册'}</h1>
              <span class="badge" class:green={accessible(albums, active)}>{status(active)}</span>
            </div>
            <p class="muted">
              {differs(active.draft, active.saved) ? '有尚未保存的修改' : '草稿已保存 · 本次演示'}{active.release
                ? ` · 公开版本 v${active.version}`
                : ' · 尚未发布'}
            </p>
          </div>
          <div class="actions">
            <button onclick={save}>保存草稿</button><button onclick={() => preview('draft')}>预览草稿</button><button
              class="primary"
              onclick={() => void open('publish')}>{active.release ? '发布更新' : '发布相册'} ↗</button
            >
          </div>
        </header>
        <div class="editor-tabs" role="tablist" aria-label="相册编辑内容">
          {#each [['photos', `照片与子相册 (${active.draft.photos.length})`], ['story', '相册介绍'], ['settings', '基本设置']] as [id, label]}<button
              role="tab"
              aria-selected={section === id}
              class:chosen={section === id}
              onclick={() => (section = id as typeof section)}>{label}</button
            >{/each}
        </div>
        <div class="editor-layout">
          <section class="editor-body">
            {#if section === 'photos'}
              <section class="panel content-panel">
                <div class="section-heading">
                  <div>
                    <h2>子相册</h2>
                    <p class="muted">可以同时收录子相册与直接照片。</p>
                  </div>
                  <button class="quiet" onclick={() => newAlbum(active!.id)}>＋ 新建子相册</button>
                </div>
                <div class="child-list">
                  {#each albums.filter((a) => a.draft.parent === active!.id) as child}<button
                      onclick={() => edit(child)}
                      ><span>▦</span><span
                        ><strong>{child.draft.title}</strong><small
                          >{status(child)} · {child.draft.photos.length} 张照片</small
                        ></span
                      ><span>→</span></button
                    >{/each}{#if !albums.some((a) => a.draft.parent === active!.id)}<p class="muted compact-empty">
                      还没有子相册。城市、地区或主题都可以成为下一层。
                    </p>{/if}
                </div>
              </section>
              <section class="panel content-panel">
                <div class="section-heading">
                  <div>
                    <h2>本册照片 <small>{active.draft.photos.length}</small></h2>
                    <p class="muted">点击照片编辑文案；用箭头调整展示顺序。</p>
                  </div>
                  <button class="primary" onclick={pick}>＋ 从 Immich 选片</button>
                </div>
                <div class="photo-grid">
                  {#each active.draft.photos as p, index}<article class="photo-card">
                      <button class="photo-image" onclick={() => photoEdit(p)}
                        ><img
                          src={image(p.asset)}
                          alt={p.alt || p.title || source(p.asset).name}
                        />{#if active.draft.cover === p.asset}<span class="cover-badge">封面</span>{/if}<span
                          class="photo-index">{String(index + 1).padStart(2, '0')}</span
                        ></button
                      ><button class="photo-caption" onclick={() => photoEdit(p)}
                        ><strong>{p.title || '添加照片标题'}</strong><small>{source(p.asset).name}</small></button
                      >
                      <div class="photo-actions">
                        <button
                          aria-label={`前移照片 ${index + 1}`}
                          disabled={index === 0}
                          onclick={() => movePhoto(index, -1)}>←</button
                        ><button
                          aria-label={`后移照片 ${index + 1}`}
                          disabled={index === active!.draft.photos.length - 1}
                          onclick={() => movePhoto(index, 1)}>→</button
                        ><button
                          class="text-action"
                          disabled={active.draft.cover === p.asset}
                          onclick={() => (active!.draft.cover = p.asset)}>设为封面</button
                        ><button
                          class="remove"
                          aria-label={`移除照片 ${index + 1}`}
                          onclick={() => removePhoto(p.asset)}>×</button
                        >
                      </div>
                    </article>{/each}
                </div>
                {#if !active.draft.photos.length}<div class="empty large">
                    <span class="empty-icon">▧</span>
                    <h3>把故事的第一张照片放进来</h3>
                    <p>可以从多个 Immich 相册中挑选，组合成自己的相册。</p>
                    <button onclick={pick}>从 Immich 选片</button>
                  </div>{/if}
              </section>
            {:else if section === 'story'}
              <section class="panel content-panel">
                <div class="section-heading">
                  <div>
                    <h2>相册介绍</h2>
                    <p class="muted">展示在相册右侧；手机上展开阅读。</p>
                  </div>
                  <span class="badge">仅文字内容</span>
                </div>
                <label
                  >简短介绍<textarea rows="2" bind:value={active.draft.summary} placeholder="用一两句话介绍这本相册…"
                  ></textarea></label
                >
                <div class="writing-toolbar">
                  <span>添加内容</span><button onclick={() => addBlock('paragraph')}>＋ 段落</button><button
                    onclick={() => addBlock('heading')}>＋ 小标题</button
                  ><button onclick={() => addBlock('quote')}>＋ 引用</button>
                </div>
                <div class="blocks">
                  {#each active.draft.blocks as block, index}<div class="text-block">
                      <div class="block-tools">
                        <span
                          >{block.kind === 'heading' ? '小标题' : block.kind === 'quote' ? '引用' : '段落'}
                          {index + 1}</span
                        ><button
                          aria-label={`删除文字块 ${index + 1}`}
                          onclick={() => active!.draft.blocks.splice(index, 1)}>删除</button
                        >
                      </div>
                      <textarea
                        aria-label={`文字块 ${index + 1}`}
                        class:heading-block={block.kind === 'heading'}
                        rows={block.kind === 'paragraph' ? 5 : 2}
                        bind:value={block.text}
                        placeholder="写下这段旅程…"></textarea>
                    </div>{/each}{#if !active.draft.blocks.length}<div class="empty">
                      从一个段落开始，写下相册背后的故事。
                    </div>{/if}
                </div>
                <p class="footnote">
                  照片集中展示在左侧，介绍中不插入图片。此处演示文字块编排，完整富文本工具在业务接入时实现。
                </p>
              </section>
            {:else}
              <section class="panel content-panel form-panel">
                <h2>基本设置</h2>
                <label>相册标题 <span class="required">*</span><input bind:value={active.draft.title} /></label><label
                  >访问地址 <span class="required">*</span>
                  <div class="input-prefix">
                    <span>/albums/</span><input bind:value={active.draft.slug} readonly={!!active.release} />
                  </div>
                  <small>首次发布后固定；更改标题或父相册不会改变地址。</small></label
                ><label
                  >所属父相册<select bind:value={active.draft.parent}
                    ><option value="">无，作为顶级相册</option
                    >{#each ordered.filter((a) => a.id !== active!.id && !descendants(albums, active!.id).some((d) => d.id === a.id) && !descendants(albums, active!.id, true).some((d) => d.id === a.id)) as a}<option
                        value={a.id}>{'— '.repeat(depth(a))}{a.draft.title}</option
                      >{/each}</select
                  ><small>此处改变草稿层级，发布后才改变前台层级。</small></label
                ><label
                  >封面照片<select bind:value={active.draft.cover}
                    ><option value="">暂不设置封面</option>{#each active.draft.photos as p}<option value={p.asset}
                        >{p.title || source(p.asset).name}</option
                      >{/each}</select
                  ></label
                >
              </section>
            {/if}
          </section>
          <aside class="context-panel">
            <section class="panel">
              <p class="eyebrow">发布概况</p>
              <h3>{active.release ? `公开版本 v${active.version}` : '还在酝酿中'}</h3>
              <p class="muted">
                {active.release
                  ? '草稿和公开版本分别保存。修改后，再发布才会更新前台。'
                  : '准备好内容后，预览并发布这本相册。'}
              </p>
              <dl>
                <div>
                  <dt>草稿照片</dt>
                  <dd>{active.draft.photos.length} 张</dd>
                </div>
                <div>
                  <dt>公开照片</dt>
                  <dd>{active.release?.photos.length ?? 0} 张</dd>
                </div>
                <div>
                  <dt>前台访问</dt>
                  <dd>{accessible(albums, active) ? '可见' : '不可见'}</dd>
                </div>
              </dl>
              {#if active.release}<button class="wide" onclick={() => preview('release')}>查看已发布效果 ↗</button
                ><button class="quiet wide" onclick={() => void open('availability')}
                  >{active.offline ? '恢复公开版本' : '下线相册'}</button
                >{/if}
            </section>
            <div class="context-tip">
              <span>↳</span>
              <p>先选照片，再写故事。<br />照片的标题与描述只属于当前 Gallery 相册。</p>
            </div>
          </aside>
        </div>
      {:else if page === 'settings'}
        <header class="page-heading">
          <div>
            <p class="eyebrow">SITE PREFERENCES</p>
            <h1>站点设置</h1>
            <p class="muted">设置作品站点的基本信息。</p>
          </div>
        </header>
        <section class="panel content-panel form-panel settings-form">
          <h2>基本信息</h2>
          <label>站点名称<input bind:value={siteDraft} maxlength="60" /></label><label
            >站点简介<textarea bind:value={siteDescription} rows="3"></textarea></label
          >
          <p class="muted">当前应用：{siteName} · {siteSavedDescription}</p>
          <button
            class="primary"
            disabled={!siteDraft.trim()}
            onclick={() => {
              siteName = siteDraft.trim();
              siteSavedDescription = siteDescription;
              notify('站点信息已在本次演示中应用；相册草稿不受影响。');
            }}>保存并应用</button
          >
          <hr />
          <h2>页面与域名</h2>
          <dl class="settings-dl">
            <div>
              <dt>前台导航</dt>
              <dd>相册 / 关于</dd>
            </div>
            <div>
              <dt>前台域名示例</dt>
              <dd>gallery.example.com</dd>
            </div>
            <div>
              <dt>后台域名示例</dt>
              <dd>gallery-admin.example.com</dd>
            </div>
            <div>
              <dt>来源域名示例</dt>
              <dd>immich.example.com</dd>
            </div>
          </dl>
          <p class="footnote">域名由部署配置管理。关于页当前为静态示意，文章选篇模块后续单独设计。</p>
        </section>
      {:else}
        <header class="page-heading">
          <div>
            <p class="eyebrow">YOUR ACCOUNT</p>
            <h1>个人账号</h1>
            <p class="muted">Gallery 账号独立于 Immich。</p>
          </div>
        </header>
        <section class="panel content-panel form-panel settings-form">
          <div class="profile">
            <span class="avatar">摄</span>
            <div>
              <h2>{accountName}</h2>
              <p class="muted">photographer@example.com · 管理员（示例）</p>
            </div>
          </div>
          <label>显示名称<input bind:value={accountDraft} /></label><button
            disabled={!accountDraft.trim()}
            onclick={() => {
              accountName = accountDraft.trim();
              notify('显示名称已在本次演示中更新。');
            }}>保存名称</button
          >
          <hr />
          <h2>登录与安全</h2>
          <p class="muted">本轮不收集真实密码。独立登录、修改密码、撤销会话将在业务阶段接入。</p>
          <button
            onclick={() => {
              signedIn = false;
              toast = '';
            }}>退出演示，查看登录页</button
          >
        </section>
      {/if}
    </main>
  </div>
{/if}

<dialog
  aria-labelledby="modal-title"
  bind:this={dialog}
  class:wide-dialog={['picker', 'preview', 'photo'].includes(modal)}
  onclose={() => (modal = '')}
>
  {#if modal}
    <div class="dialog-heading">
      <div>
        <p class="eyebrow">GALLERY STUDIO</p>
        <h2 id="modal-title">
          {(
            {
              create: '新建相册',
              picker: '从 Immich 选片',
              photo: '编辑照片信息',
              preview: previewMode === 'draft' ? '草稿预览' : '已发布效果',
              publish: '发布前确认',
              availability: active?.offline ? '恢复公开版本' : '下线相册',
              guide: '关于这个交互原型',
            } as Record<string, string>
          )[modal]}
        </h2>
      </div>
      <button class="close-button" aria-label="关闭弹窗" onclick={close}>×</button>
    </div>
    {#if modal === 'create'}<form
        class="dialog-body form-panel"
        onsubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label>相册标题<input bind:value={newTitle} placeholder="例如：格鲁吉亚的夏天" /></label><label
          >所属父相册<select bind:value={newParent}
            ><option value="">无，作为顶级相册</option>{#each ordered as a}<option value={a.id}
                >{'— '.repeat(depth(a))}{a.draft.title}</option
              >{/each}</select
          ></label
        >{#if newError}<p class="error" role="alert">{newError}</p>{/if}
        <p class="muted">先建立 Gallery 草稿，再从任意允许访问的 Immich 相册选片。</p>
        <div class="dialog-actions">
          <button type="button" onclick={close}>取消</button><button class="primary" type="submit">创建并编辑 →</button>
        </div>
      </form>
    {:else if modal === 'picker' && active}
      <div class="picker-layout">
        <aside class="picker-sidebar">
          <p class="eyebrow">来源相册</p>
          <button
            class:chosen={!sourceFilter}
            onclick={() => {
              sourceFilter = '';
              pickerPage = 1;
            }}>全部可选照片 <small>{assets.filter((a) => a.available).length}</small></button
          >{#each [...new Set(assets.map((a) => a.source))] as name}<button
              class:chosen={sourceFilter === name}
              onclick={() => {
                sourceFilter = name;
                pickerPage = 1;
              }}>{name}</button
            >{/each}
          <p class="footnote">只显示授权来源。切换相册和翻页会保留已选照片。</p>
          <span class="connection"><i></i> 示例资源 · 未连接 Immich</span>
        </aside>
        <section class="picker-main">
          <div class="picker-filters">
            <input
              aria-label="搜索照片文件名"
              placeholder="搜索文件名…"
              bind:value={assetSearch}
              oninput={() => (pickerPage = 1)}
            /><select aria-label="按标签筛选" bind:value={tagFilter} onchange={() => (pickerPage = 1)}
              ><option value="">全部标签</option><option>风景</option><option>城市</option><option>街道</option></select
            ><label class="date-filter"
              >拍摄日期起<input type="date" bind:value={dateFilter} onchange={() => (pickerPage = 1)} /></label
            >
          </div>
          <p class="muted">{pickerMatches.length} 张来源照片 · 已在本册的照片不会重复添加</p>
          <div class="asset-grid">
            {#each pickerMatches.slice((pickerPage - 1) * 4, pickerPage * 4) as asset}{@const added =
                active.draft.photos.some((p) => p.asset === asset.id)}<button
                class="asset-card"
                class:selected={selected.includes(asset.id)}
                disabled={added || !asset.available}
                aria-pressed={selected.includes(asset.id)}
                aria-label={`${asset.name} · ${asset.source}${added ? ' · 已在本册' : !asset.available ? ' · 来源不可用' : ''}`}
                onclick={() => toggle(asset.id)}
                ><div>
                  <img src={image(asset.id)} alt="" /><span class="selection-check"
                    >{added ? '✓' : selected.includes(asset.id) ? '✓' : '+'}</span
                  >{#if added || !asset.available}<span class="asset-state">{added ? '已在本册' : '来源不可用'}</span
                    >{/if}
                </div>
                <strong>{asset.name}</strong><small>{asset.source} · {asset.date}</small></button
              >{/each}
          </div>
          {#if !pickerMatches.length}<div class="empty">没有符合条件的照片。请调整筛选。</div>{/if}
          <div class="pagination">
            <button disabled={pickerPage <= 1} onclick={() => pickerPage--}>← 上一页</button><span
              >{pickerPage} / {Math.max(1, Math.ceil(pickerMatches.length / 4))}</span
            ><button disabled={pickerPage * 4 >= pickerMatches.length} onclick={() => pickerPage++}>下一页 →</button>
          </div>
        </section>
      </div>
      <footer class="picker-footer">
        <div>
          <strong>已选 {selected.length} 张</strong><small
            >将加入「{active.draft.title}」{selected.length
              ? ` · ${new Set(selected.map((id) => source(id).source)).size} 个来源相册`
              : ''}</small
          >
        </div>
        <div class="actions">
          <button disabled={!selected.length} onclick={() => (selected = [])}>清空选择</button><button
            class="primary"
            disabled={!selected.length}
            onclick={addPhotos}>加入相册 ({selected.length})</button
          >
        </div>
      </footer>
    {:else if modal === 'photo' && editedPhoto}
      <div class="photo-editor">
        <div class="photo-editor-image">
          <img src={image(editedPhoto.asset)} alt={editedPhoto.alt || '正在编辑的照片'} />
          <p>{source(editedPhoto.asset).name} · 来源：{source(editedPhoto.asset).source}</p>
          <p>EXIF 示例：Sony α7 IV · 35mm · f/2.8 · 1/250s · ISO 100</p>
        </div>
        <div class="form-panel">
          <label>照片标题<input bind:value={editedPhoto.title} placeholder="给这张照片取个名字" /></label><label
            >照片描述<textarea rows="5" bind:value={editedPhoto.description} placeholder="记录这张照片背后的故事…"
            ></textarea></label
          ><label>替代文本<input bind:value={editedPhoto.alt} placeholder="简要描述画面，便于无障碍阅读" /></label
          ><label
            >位置公开方式<select bind:value={editedPhoto.location}
              ><option value="hidden">隐藏位置（默认）</option><option value="approximate">近似位置</option><option
                value="precise">精确位置</option
              ></select
            ><small>来源位置：{source(editedPhoto.asset).place}（示例）。正式接入后跟随 Immich 最新 GPS。</small></label
          >
          <p class="footnote">标题和描述仅用于当前相册，不回写 Immich。</p>
        </div>
      </div>
      <div class="dialog-actions">
        <button onclick={close}>取消</button><button class="primary" onclick={savePhoto}>应用到草稿</button>
      </div>
    {:else if modal === 'preview' && active && previewContent}
      <div class="preview-toolbar">
        <span
          >{previewMode === 'draft'
            ? '正在预览当前编辑内容，包含尚未保存的修改。'
            : `公开版本 v${active.version}，不包含未发布修改。`}</span
        >
        <div class="filter-tabs">
          <button class:chosen={!previewPhone} onclick={() => (previewPhone = false)}>桌面</button><button
            class:chosen={previewPhone}
            onclick={() => (previewPhone = true)}>手机</button
          >
        </div>
      </div>
      {#if previewMode === 'release' && !accessible(albums, active)}<div class="empty large">
          <h3>该相册当前无法从前台访问</h3>
          <p>{active.offline ? '本册已下线。' : '公开路径上的父相册未公开。'}公开快照仍然保留。</p>
        </div>{:else}<div class="preview-surface" class:phone={previewPhone}>
          <Preview content={previewContent} children={previewChildren} {siteName} />
        </div>{/if}
      <p class="footnote preview-note">
        布局模拟 · 示例照片与 EXIF；子相册显示封面示意，完整跨页导航在业务接入时完成。
      </p>
    {:else if modal === 'publish' && active}
      <div class="dialog-body">
        <div class="publish-summary">
          <span class="publish-icon">↗</span>
          <div>
            <h3>{active.draft.title || '未命名相册'}</h3>
            <p>
              {active.release ? `v${active.version} → v${active.version + 1}` : '首次发布'} · 保存当前草稿并发布新版本
            </p>
          </div>
        </div>
        <dl class="change-list">
          <div>
            <dt>照片数量</dt>
            <dd>{active.release?.photos.length ?? 0} → {active.draft.photos.length}</dd>
          </div>
          <div>
            <dt>选片与顺序</dt>
            <dd>
              {differs(
                active.draft.photos.map((p) => p.asset),
                active.release?.photos.map((p) => p.asset),
              )
                ? '有变更'
                : '无变更'}
            </dd>
          </div>
          <div>
            <dt>照片文案与位置策略</dt>
            <dd>{differs(active.draft.photos, active.release?.photos) ? '有变更' : '无变更'}</dd>
          </div>
          <div>
            <dt>相册标题与介绍</dt>
            <dd>
              {differs(
                [active.draft.title, active.draft.summary, active.draft.blocks],
                active.release && [active.release.title, active.release.summary, active.release.blocks],
              )
                ? '有变更'
                : '无变更'}
            </dd>
          </div>
          <div>
            <dt>封面</dt>
            <dd>{active.draft.cover !== active.release?.cover ? '有变更' : '无变更'}</dd>
          </div>
          <div>
            <dt>父相册</dt>
            <dd>
              {albums.find((a) => a.id === active!.draft.parent)?.draft.title ?? '顶级相册'}{active.release &&
              active.release.parent !== active.draft.parent
                ? '（已移动）'
                : ''}
            </dd>
          </div>
        </dl>
        {#if errors.length}<div class="validation error" role="alert">
            <strong>请先处理以下问题</strong>
            <ul>
              {#each errors as e}<li>{e}</li>{/each}
            </ul>
          </div>{:else}<div class="validation success">
            ✓ 页面检查通过，可以模拟发布。
          </div>{/if}{#if active.offline && restored.length}<p class="warning">
            本次发布也会恢复相册访问，预计恢复 {restored.length} 本后代相册：{restored
              .map((a) => a.release!.title)
              .join('、')}。单独下线的子相册保持下线。
          </p>{/if}
        <p class="muted">只发布当前相册，不会一并发布子相册草稿。正式发布时将由服务端再次验证资源与层级。</p>
        <div class="dialog-actions">
          <button onclick={close}>继续编辑</button><button class="primary" disabled={!!errors.length} onclick={publish}
            >确认模拟发布</button
          >
        </div>
      </div>
    {:else if modal === 'availability' && active}
      <div class="dialog-body">
        <h3>{active.release?.title}</h3>
        <p>
          {active.offline
            ? '恢复现有公开版本，不发布草稿修改。'
            : '下线后，当前相册及公开层级下的所有后代将停止对外访问。'}
        </p>
        <div class="validation">
          <strong
            >{active.offline ? restored.length : affected.length} 本后代相册{active.offline
              ? '将恢复访问'
              : '将受影响'}</strong
          >
          <ul>
            {#each active.offline ? restored : affected as a}<li>{a.release?.title}</li>{/each}
          </ul>
          <small>以公开层级计算。单独下线的子相册不会自动恢复。</small>
        </div>
        {#if active.offline && active.release?.parent && !albums.some((a) => a.id === active!.release!.parent && accessible(albums, a))}<p
            class="warning"
          >
            父级仍未公开，恢复本册后前台依然不可见。
          </p>{/if}
        <div class="dialog-actions">
          <button onclick={close}>取消</button><button
            class:danger={!active.offline}
            class:primary={active.offline}
            onclick={availability}>{active.offline ? '确认恢复' : '确认下线'}</button
          >
        </div>
      </div>
    {:else if modal === 'guide'}
      <div class="dialog-body guide">
        <p>
          这是后台页面与流程评审原型。所有保存、发布、下线和账号操作只作用于当前页面内存，刷新后恢复示例。未访问真实
          Immich 数据，也没有写入数据库。
        </p>
        <h3>试走一次完整流程</h3>
        <ol>
          <li>新建相册，从不同来源相册勾选照片。</li>
          <li>编辑照片标题、描述、顺序和封面；在相册介绍中编写文字。</li>
          <li>保存草稿，预览，确认模拟发布。</li>
          <li>继续修改草稿，对比“已发布效果”，验证内容隔离。</li>
          <li>下线格鲁吉亚，查看子相册被遮蔽，再恢复公开版本。</li>
        </ol>
        <h3>照片素材</h3>
        <p>复用前台设计的授权照片。此处来源分类、文案、日期、地名和 EXIF 参数均为演示数据；小图按原照片缩放。</p>
        {#each imageCredits as credit}<p>
            <a href={credit.page} target="_blank" rel="noreferrer">{credit.title}</a> — {credit.author} ·
            <a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a>
          </p>{/each}
      </div>
    {/if}
  {/if}
</dialog>
