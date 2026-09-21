<script lang="ts">
  import { untrack, onDestroy } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import {
    articleImageKey,
    articleTime,
    type ManagedArticle,
    type ArticleMediaOption,
    type GalleryUser,
    type ArticleNode,
    type ArticleContent,
  } from '@gallery/core';
  import AdminSidebar from '$lib/AdminSidebar.svelte';
  import RichTextEditor from './RichTextEditor.svelte';
  import { articleRequest } from './api';
  import '$lib/design/admin.css';
  let {
    initial,
  }: {
    initial: {
      article: ManagedArticle;
      images: Record<string, ArticleMediaOption>;
      albums: { id: string; title: string }[];
      user: GalleryUser;
      publicOrigin: string;
    };
  } = $props();
  let article = $state<ManagedArticle>(structuredClone(untrack(() => initial.article)));
  let images = $state<Record<string, ArticleMediaOption>>({ ...untrack(() => initial.images) });
  let revision = 0;
  let dirty = $state(false);
  let saving = $state(false);
  let busy = $state(false);
  let conflict = $state(false);
  let message = $state('');
  let status = $state('已保存');
  let focus = $state(false);
  let settings = $state(true);
  let modal: HTMLDialogElement;
  let editor = $state<RichTextEditor>();
  let coverMode = $state(false);
  let kind = $state<'photo' | 'upload' | 'group'>('photo');
  let query = $state('');
  let album = $state('');
  let mediaPage = $state(1);
  let more = $state(false);
  let options = $state<ArticleMediaOption[]>([]);
  let selected = $state<string[]>([]);
  let pickerOpen = $state(false);
  let groupMode = $state(false);
  let groupCaption = $state('');
  let editPosition = $state<number | null>(null);
  let originalNodes: Record<string, ArticleNode> = {};
  let optionCache = $state<Record<string, ArticleMediaOption>>({});
  let dragged = '';
  const picked = $derived(selected.map((id) => optionCache[id]).filter((p): p is ArticleMediaOption => !!p));
  function reorder(from: number, to: number) {
    if (from < 0 || to < 0 || to >= selected.length) return;
    const next = [...selected];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    selected = next;
  }
  function editGroup(value: ArticleNode, position: number) {
    coverMode = false;
    editPosition = position;
    groupMode = value.attrs?.kind === 'temporary';
    groupCaption = String(value.attrs?.caption ?? '');
    originalNodes = {};
    selected = [];
    if (groupMode) {
      for (const child of value.content ?? []) {
        const item = resolve(child);
        // Keep unavailable references visible so opening a group never drops content silently.
        const p = item ?? {
          id: articleImageKey(child),
          ref: String(child.attrs!.ref),
          album: child.attrs?.album ? String(child.attrs.album) : undefined,
          kind: child.attrs!.kind as 'photo' | 'upload',
          title: '图片暂不可用',
          alt: '图片暂不可用',
          src: '',
          preview: '',
        };
        optionCache[p.id] = p;
        originalNodes[p.id] = child;
        selected.push(p.id);
      }
      kind = 'photo';
    } else {
      const p = resolve(value);
      if (p) {
        optionCache[p.id] = p;
        selected = [p.id];
      }
      kind = 'group';
    }
    pickerOpen = true;
    mediaPage = 1;
    modal.showModal();
    void loadMedia();
  }
  let loading = $state(false);
  let uploading = $state(false);
  let pickerError = $state('');
  let requestId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let work: Promise<boolean> | null = null;
  const resolve = (node: ArticleNode) => images[articleImageKey(node)] ?? null;
  function content(): ArticleContent {
    const { title, summary, date, document, cover, listed, albums } = article;
    return structuredClone($state.snapshot({ title, summary, date, document, cover, listed, albums }));
  }
  function changed() {
    revision++;
    dirty = true;
    article.hasChanges = true;
    status = '有未保存修改';
    clearTimeout(timer);
    if (!conflict)
      timer = setTimeout(() => {
        void save();
      }, 800);
  }
  async function save(): Promise<boolean> {
    clearTimeout(timer);
    if (conflict) return false;
    if (work) {
      await work;
      if (dirty && !conflict) return save();
      return !dirty;
    }
    if (!dirty) return true;
    const mark = revision;
    const snapshot = content();
    saving = true;
    status = '正在保存…';
    work = (async () => {
      try {
        const result = await articleRequest('article-save', {
          id: article.id,
          version: article.version,
          slug: article.slug,
          content: snapshot,
        });
        article.version = result.version;
        article.updatedAt = result.updatedAt;
        article.status = result.status;
        dirty = revision !== mark;
        if (!dirty) article.hasChanges = result.hasChanges;
        status = dirty ? '有未保存修改' : '已保存';
        message = '';
        return true;
      } catch (e) {
        conflict = (e as Error & { status?: number }).status === 409;
        status = '保存未完成';
        message = (e as Error).message;
        return false;
      } finally {
        saving = false;
        work = null;
      }
    })();
    const ok = await work;
    if (ok && dirty) return save();
    return ok;
  }
  function savedTime(value: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(value));
  }
  async function manualSave() {
    if (await save()) message = '草稿已保存。';
  }
  async function openPreview() {
    busy = true;
    try {
      if (await save()) {
        busy = false;
        window.location.assign(`/articles/${article.id}/preview`);
      }
    } finally {
      busy = false;
    }
  }
  async function publish() {
    busy = true;
    try {
      if (!(await save())) return;
      const result = await articleRequest('article-publish', { id: article.id, version: article.version });
      article.version = result.version;
      article.status = result.status;
      article.hasChanges = result.hasChanges;
      article.firstPublishedAt = result.firstPublishedAt;
      article.publishedAt = result.publishedAt;
      message = '文章已发布，前台已更新。';
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function offline() {
    if (!confirm('下线后访客将无法访问这篇文章，草稿会保留。确定下线？')) return;
    busy = true;
    try {
      if (!(await save())) return;
      const result = await articleRequest('article-offline', { id: article.id, version: article.version });
      article.status = result.status;
      article.version = result.version;
      message = '文章已下线。';
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function remove() {
    if (!confirm('确定删除这篇从未发布的草稿？')) return;
    busy = true;
    try {
      if (!(await save())) return;
      await articleRequest('article-delete', { id: article.id, version: article.version });
      dirty = false;
      busy = false;
      await goto('/articles');
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function loadMedia() {
    const id = ++requestId;
    loading = true;
    pickerError = '';
    try {
      const result = await articleRequest(
        'article-media?' +
          new URLSearchParams({
            kind,
            q: query,
            album: kind !== 'upload' ? album : '',
            page: String(mediaPage),
          }),
      );
      if (id !== requestId) return;
      options = result.items;
      more = result.more;
      for (const p of result.items as ArticleMediaOption[]) {
        optionCache[p.id] = p;
        images[
          articleImageKey({
            type: 'galleryImage',
            attrs: { kind: p.kind, ref: p.ref, ...(p.album ? { album: p.album } : {}) },
          })
        ] = p;
      }
    } catch (e) {
      if (id === requestId) pickerError = (e as Error).message;
    } finally {
      if (id === requestId) loading = false;
    }
  }
  function openPicker(cover = false) {
    coverMode = cover;
    pickerOpen = true;
    groupMode = false;
    editPosition = null;
    groupCaption = '';
    originalNodes = {};
    if (cover) kind = 'photo';
    selected = [];
    mediaPage = 1;
    modal.showModal();
    void loadMedia();
  }
  function node(option: ArticleMediaOption): ArticleNode {
    return {
      type: option.kind === 'group' ? 'galleryImageGroup' : 'galleryImage',
      attrs: { kind: option.kind, ref: option.ref, ...(option.album ? { album: option.album } : {}) },
      content: [],
    };
  }
  function insert() {
    if (!picked.length) return;
    try {
      if (coverMode) {
        article.cover = node(picked[0]!);
        changed();
      } else {
        const nodes = groupMode
          ? [
              {
                type: 'galleryImageGroup',
                attrs: { kind: 'temporary', caption: groupCaption },
                content: picked.map((p) => originalNodes[p.id] ?? node(p)),
              } as ArticleNode,
            ]
          : picked.map((p) =>
              p.kind === 'group'
                ? { ...node(p), attrs: { ...node(p).attrs, caption: groupCaption } }
                : node(p),
            );
        if (editPosition !== null) editor?.replaceGroup(editPosition, nodes[0]!);
        else editor?.insertImages(nodes);
      }
      modal.close();
      selected = [];
    } catch (e) {
      pickerError = (e as Error).message;
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    uploading = true;
    pickerError = '';
    try {
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
          throw new Error('请选择 10 MB 以内的 JPEG、PNG 或 WebP 图片。');
        const response = await fetch('/api/article-upload', {
          method: 'POST',
          headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name) },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? '上传失败');
        const p = result as ArticleMediaOption;
        options = [p, ...options];
        optionCache[p.id] = p;
        images[articleImageKey(node(p))] = p;
        selected = coverMode ? [p.id] : [...selected, p.id];
      }
    } catch (e) {
      pickerError = (e as Error).message;
    } finally {
      uploading = false;
    }
  }
  async function deleteMaterial() {
    if (!confirm('删除选中的素材？仍有文章引用的素材会保留。')) return;
    pickerError = '';
    try {
      if (!(await save())) return;
      for (const id of selected.filter((id) => optionCache[id]?.kind === 'upload'))
        await articleRequest('article-media-delete', { id });
      selected = [];
      await loadMedia();
    } catch (e) {
      pickerError = (e as Error).message;
    }
  }
  beforeNavigate(({ cancel }) => {
    if (saving || busy) {
      cancel();
      message = '正在保存或发布，请稍等片刻再离开。';
    } else if (dirty && !confirm('正文尚未保存，确定离开并放弃未保存修改？')) cancel();
  });
  onDestroy(() => clearTimeout(timer));
</script>

<svelte:head><title>{article.title || '编辑文章'} · Gallery</title></svelte:head>
<svelte:window
  onbeforeunload={(e) => {
    if (dirty || saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') focus = false;
  }}
/>
<div class="workspace" class:focused={focus}>
  {#if !focus}<AdminSidebar active="articles" user={initial.user} publicOrigin={initial.publicOrigin} />{/if}
  <main>
    <header class="edit-top">
      <a href="/articles">← 文章</a><span class="save-status" role="status"
        >{status}{#if article.updatedAt}<time
            datetime={article.updatedAt}
            title="最近保存时间 · 北京时间 UTC+8">最近保存 {savedTime(article.updatedAt)}</time
          >{/if}</span
      >
      <div class="actions">
        <button
          onclick={() => {
            void manualSave();
          }}
          disabled={busy || saving || conflict}>{saving ? '正在保存…' : '保存草稿'}</button
        ><button onclick={openPreview} disabled={busy || conflict}>独立预览 ↗</button><button
          onclick={() => (settings = !settings)}
          aria-expanded={settings}>文章设置</button
        ><button class="primary" onclick={publish} disabled={busy || saving || conflict}
          >{busy ? '处理中…' : article.status === 'published' ? '更新发布' : '发布文章'}</button
        >
      </div>
    </header>
    {#if message}<div class="message" role="status">
        {message}{#if conflict}<p>当前文字仍保留在页面中。请先复制需要保留的内容，再重新载入文章。</p>{/if}
      </div>{/if}
    <div class="editor-layout-articles" class:without-settings={!settings || focus}>
      <section class="writing-paper">
        <div class="writing-title">
          <div class="writing-caption">
            <span>文章正文</span><button onclick={() => (focus = !focus)}
              >{focus ? '退出专注' : '专注写作'}</button
            >
          </div>
          <label
            ><span class="sr-only">文章标题</span><textarea
              rows="2"
              class="title-input"
              maxlength="200"
              placeholder="给文章起个标题…"
              bind:value={article.title}
              oninput={changed}
              disabled={busy}></textarea></label
          >
        </div>
        <fieldset class="editor-lock" disabled={busy}>
          <RichTextEditor
            editable={!busy && !pickerOpen}
            bind:this={editor}
            document={article.document}
            resolveImage={resolve}
            onChange={(doc) => {
              article.document = doc;
              changed();
            }}
            onInsertImage={() => openPicker()}
            onEditGroup={editGroup}
          />
        </fieldset>
      </section>
      {#if settings && !focus}<aside class="article-settings">
          <h2>文章设置</h2>
          {#if article.firstPublishedAt}<p class="hint">
              首次发布：{articleTime(article.firstPublishedAt)}<br />最近更新：{articleTime(
                article.publishedAt!,
              )}<br />北京时间 UTC+8，发布后自动记录。
            </p>{:else}<p class="hint">尚未发布。首次发布与最近更新时间由系统自动记录。</p>{/if}
          <label
            >摘要<textarea
              rows="4"
              maxlength="1000"
              bind:value={article.summary}
              oninput={changed}
              disabled={busy}></textarea></label
          ><label
            >写作日期<input type="date" bind:value={article.date} onchange={changed} disabled={busy} /></label
          ><label
            >文章链接<input
              bind:value={article.slug}
              onchange={changed}
              readonly={article.status !== 'draft'}
              disabled={busy}
            /></label
          >
          <p class="setting-label">封面</p>
          {#if article.cover && resolve(article.cover)}<img
              class="cover-preview"
              src={resolve(article.cover)!.src}
              alt="封面预览"
            />{/if}
          <div class="cover-actions">
            <button onclick={() => openPicker(true)} disabled={busy}
              >{article.cover ? '更换封面' : '选择封面'}</button
            >{#if article.cover}<button
                onclick={() => {
                  article.cover = null;
                  changed();
                }}
                disabled={busy}>移除</button
              >{/if}
          </div>
          <label class="check"
            ><input
              type="checkbox"
              bind:checked={article.listed}
              onchange={changed}
              disabled={busy}
            />展示在记录列表</label
          >
          <fieldset disabled={busy}>
            <legend>相关相册</legend>{#each initial.albums as album}<label class="check"
                ><input
                  type="checkbox"
                  value={album.id}
                  bind:group={article.albums}
                  onchange={changed}
                />{album.title}</label
              >{:else}<p class="hint">公开相册后，可在这里关联。</p>{/each}
          </fieldset>
          <p class="hint">图注属于这篇文章，不修改照片本身的资料。</p>
          {#if article.status === 'published'}<button
              class="withdraw"
              onclick={offline}
              disabled={busy || saving}>下线文章</button
            >{:else if article.status === 'draft'}<button
              class="withdraw"
              onclick={remove}
              disabled={busy || saving}>删除草稿</button
            >{/if}
        </aside>{/if}
    </div>
  </main>
</div>
<dialog
  bind:this={modal}
  onclose={() => {
    pickerOpen = false;
  }}
  class="image-picker"
  aria-labelledby="image-picker-title"
>
  <header>
    <div>
      <h2 id="image-picker-title">
        {coverMode
          ? '选择封面'
          : editPosition !== null
            ? '编辑图片组'
            : groupMode
              ? '组成文章图片组'
              : '插入图片'}
      </h2>
      <p>
        {coverMode
          ? '选择一张图片作为文章封面。'
          : 'Gallery 照片含已发布的隐藏作品；上传素材仅用于文章。可跨页、跨相册和素材类型选图。'}
      </p>
    </div>
    <button onclick={() => modal.close()} aria-label="关闭图片选择">✕</button>
  </header>
  <div class="picker-body">
    {#if selected.length}<section class="selected-images" aria-label="已选图片及顺序">
        <p>已选 {selected.length} 项 · 拖动或用箭头调整顺序</p>
        <div class="selected-strip">
          {#each picked as p, index (p.id)}<div
              draggable="true"
              ondragstart={() => {
                dragged = p.id;
              }}
              ondragover={(e) => e.preventDefault()}
              ondrop={(e) => {
                e.preventDefault();
                reorder(selected.indexOf(dragged), index);
              }}
              role="group"
              aria-label={`第 ${index + 1} 张`}
            >
              {#if p.src}<img src={p.src} alt={p.alt} />{:else}<span>图片不可用</span>{/if}
              <span>{index + 1}</span><button
                aria-label="前移图片"
                disabled={index === 0}
                onclick={() => reorder(index, index - 1)}>←</button
              ><button
                aria-label="后移图片"
                disabled={index === picked.length - 1}
                onclick={() => reorder(index, index + 1)}>→</button
              ><button
                aria-label="移除所选图片"
                onclick={() => (selected = selected.filter((id) => id !== p.id))}>×</button
              >
            </div>{/each}
        </div>
        {#if groupMode || picked[0]?.kind === 'group'}<label
            >文章中的图片组说明<textarea
              rows="2"
              maxlength="10000"
              bind:value={groupCaption}
              placeholder="可选，仅用于这篇文章；留空不展示图注"></textarea></label
          >
          <p>
            {groupMode
              ? '临时组只属于这篇文章，不创建相册照片组。'
              : '照片成员跟随来源组的发布更新；图注只在这篇文章中使用。'}
          </p>{/if}
      </section>{/if}
    <div class="picker-tabs">
      <button
        disabled={editPosition !== null && !groupMode}
        class:chosen={kind === 'photo'}
        onclick={() => {
          kind = 'photo';
          if (selected.some((id) => optionCache[id]?.kind === 'group')) selected = [];
          mediaPage = 1;
          void loadMedia();
        }}>Gallery 照片</button
      >{#if !coverMode && !groupMode}<button
          class:chosen={kind === 'group'}
          onclick={() => {
            kind = 'group';
            selected = [];
            mediaPage = 1;
            void loadMedia();
          }}>Gallery 照片组</button
        >{/if}<button
        disabled={editPosition !== null && !groupMode}
        class:chosen={kind === 'upload'}
        onclick={() => {
          kind = 'upload';
          if (selected.some((id) => optionCache[id]?.kind === 'group')) selected = [];
          mediaPage = 1;
          void loadMedia();
        }}>上传素材</button
      >
    </div>
    <form
      class="picker-filters"
      onsubmit={(e) => {
        e.preventDefault();
        mediaPage = 1;
        void loadMedia();
      }}
    >
      <input
        aria-label="搜索图片"
        placeholder={kind === 'group'
          ? '搜索照片组标题'
          : kind === 'photo'
            ? '搜索照片标题或标签'
            : '搜索素材名称'}
        bind:value={query}
      />{#if kind !== 'upload'}<select
          aria-label="按相册筛选"
          bind:value={album}
          onchange={() => {
            mediaPage = 1;
            void loadMedia();
          }}
          ><option value="">全部相册</option>{#each initial.albums as a}<option value={a.id}>{a.title}</option
            >{/each}</select
        >{/if}<button>查找</button>
    </form>
    {#if kind === 'upload'}<label class="upload-zone"
        >＋ 上传插图<input
          type="file"
          multiple={!coverMode}
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onchange={(e) => {
            void upload(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        /><small>{uploading ? '正在上传…' : 'JPEG、PNG、WebP，每张最多 10 MB。不进入相册和去过统计。'}</small
        ></label
      >{/if}{#if pickerError}<p role="alert">{pickerError}</p>{/if}{#if loading}<p role="status">
        正在加载图片…
      </p>{:else}<div class="image-grid">
        {#each options as p}<button
            class:selected={selected.includes(p.id)}
            aria-pressed={selected.includes(p.id)}
            onclick={() => {
              selected =
                coverMode || p.kind === 'group'
                  ? [p.id]
                  : selected.includes(p.id)
                    ? selected.filter((id) => id !== p.id)
                    : [...selected, p.id];
            }}
            ><img src={p.src} alt={p.alt} /><span
              >{p.title || '未命名照片'}{p.hidden ? ' · 仅文章可见' : ''}{p.kind === 'group'
                ? ` · ${p.items?.length ?? 0} 张`
                : ''}{#if p.kind === 'upload'}
                · {p.usage ?? 0} 篇引用{/if}</span
            ></button
          >{:else}<p>暂无符合条件的图片。</p>{/each}
      </div>{/if}
    <div class="media-pages">
      <button
        disabled={mediaPage === 1 || loading}
        onclick={() => {
          mediaPage--;
          void loadMedia();
        }}>上一页</button
      ><span>第 {mediaPage} 页</span><button
        disabled={!more || loading}
        onclick={() => {
          mediaPage++;
          void loadMedia();
        }}>下一页</button
      >
    </div>
  </div>
  <footer>
    <span>已选择 {selected.length} 项</span>
    {#if !coverMode && !groupMode && picked.length >= 2 && picked.every((p) => p.kind !== 'group')}<button
        onclick={() => {
          groupMode = true;
        }}>组成图片组</button
      >{/if}
    {#if kind === 'upload' && picked.length && picked.every((p) => p.kind === 'upload') && !groupMode}<button
        disabled={uploading}
        onclick={deleteMaterial}>删除选中素材</button
      >{/if}
    <button
      class="primary"
      disabled={!selected.length || uploading || (groupMode && (selected.length < 2 || selected.length > 50))}
      onclick={insert}
      >{coverMode
        ? '设为封面'
        : editPosition !== null
          ? '保存图片组'
          : groupMode
            ? '插入图片组'
            : picked[0]?.kind === 'group'
              ? '插入照片组'
              : '逐张插入'}</button
    >
  </footer>
</dialog>

<style>
  .image-picker[open] {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .image-picker header,
  .image-picker footer {
    flex-shrink: 0;
  }
  .picker-body {
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }
  .image-picker footer {
    border-top: 1px solid #e2e7dc;
    padding-top: 16px;
  }

  .selected-images {
    margin: 12px 0 20px;
    padding: 14px;
    background: #f0f3eb;
    border-radius: 8px;
  }
  .selected-images label {
    display: grid;
    gap: 8px;
    margin-top: 16px;
    font-size: 13px;
  }
  .selected-strip {
    display: flex;
    overflow-x: auto;
    gap: 10px;
    padding-bottom: 8px;
  }
  .selected-strip > div {
    flex: 0 0 132px;
    background: white;
    padding: 5px;
    border-radius: 5px;
    cursor: grab;
  }
  .selected-strip img {
    display: block;
    width: 100%;
    height: 80px;
    object-fit: contain;
    margin-bottom: 5px;
  }
  .selected-strip button {
    padding: 3px 8px;
    margin-left: 3px;
  }
  .image-picker footer {
    flex-wrap: wrap;
    gap: 10px;
  }

  main {
    min-width: 0;
    padding: 34px 40px 70px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .primary {
    background: #3e654b;
    color: white;
    border-color: #3e654b;
  }
  .primary:hover {
    background: #31593e;
    color: white;
  }
  select {
    appearance: none;
    background: white
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23727e70' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 12px center;
    padding-right: 34px;
  }
  .edit-top {
    display: flex;
    gap: 15px;
    align-items: center;
    margin: -10px 0 24px;
    flex-wrap: wrap;
  }
  .edit-top .actions {
    margin-left: auto;
  }
  .save-status time {
    display: block;
    margin-top: 3px;
    font-size: 11px;
  }
  .save-status {
    font-size: 12px;
    color: #8b9682;
  }
  .message {
    padding: 12px 18px;
    background: #e8efe1;
    margin-bottom: 20px;
    border-radius: 6px;
  }
  .editor-layout-articles {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 24px;
    align-items: start;
  }
  .editor-layout-articles.without-settings {
    grid-template-columns: minmax(0, 900px);
    justify-content: center;
  }
  .writing-paper {
    background: #fffefc;
    border: 1px solid #e2e6dd;
    border-radius: 8px;
    min-width: 0;
  }
  .writing-title {
    padding: 24px 46px 12px;
  }
  .writing-caption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #98a08f;
    margin-bottom: 15px;
  }
  .writing-caption button {
    background: transparent;
    border: 0;
    font-size: 12px;
    color: #7d8b72;
    padding: 4px 0;
  }
  .title-input {
    font-size: 27px;
    line-height: 1.5;
    letter-spacing: -0.5px;
    font-weight: 550;
    background: transparent;
    border: 0;
    padding: 0;
    resize: vertical;
    border-radius: 0;
  }
  .title-input:focus {
    outline: none;
  }
  .article-settings {
    background: #edf0e8;
    padding: 24px 20px;
    border-radius: 8px;
  }
  .article-settings h2 {
    font-size: 14px;
    margin-bottom: 24px;
  }
  .article-settings label {
    display: grid;
    gap: 8px;
    font-size: 12px;
    color: #697861;
    margin-bottom: 22px;
  }
  .article-settings .check {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .check input {
    width: 15px;
    height: 15px;
    accent-color: #496d48;
  }
  .cover-preview {
    width: 100%;
    aspect-ratio: 1.5;
    object-fit: cover;
    border-radius: 5px;
    margin: -8px 0 20px;
  }
  fieldset {
    border: 0;
    border-top: 1px solid #dce3d5;
    margin: 24px 0;
    padding: 20px 0 0;
  }
  legend {
    font-size: 12px;
    padding: 0 12px 0 0;
    color: #697861;
  }
  .hint {
    font-size: 12px;
    color: #8d9784;
    line-height: 1.8;
    margin: 18px 0 0;
  }
  .withdraw {
    margin-top: 22px;
    width: 100%;
    color: #806957;
    background: transparent;
  }
  .focused {
    grid-template-columns: 1fr;
  }
  .focused main {
    max-width: 1120px;
    width: 100%;
    margin: auto;
  }
  dialog {
    border: 1px solid #dce3d4;
    border-radius: 12px;
    padding: 28px;
    max-height: 90dvh;
    color: #384735;
  }
  dialog::backdrop {
    background: #1d271e66;
    backdrop-filter: blur(4px);
  }
  .image-picker {
    width: min(840px, calc(100vw - 30px));
  }
  .image-picker header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 20px;
  }
  .image-picker h2 {
    margin-bottom: 5px;
  }
  .image-picker p {
    color: #8a9480;
    font-size: 12px;
  }
  .picker-tabs {
    display: flex;
    gap: 18px;
    border-bottom: 1px solid #e2e7dc;
    margin-bottom: 20px;
  }
  .picker-tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    padding: 12px 3px;
  }
  .picker-tabs button.chosen {
    border-bottom-color: #50784a;
    color: #436b42;
  }
  .picker-filters {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
  }
  .picker-filters select {
    max-width: 160px;
  }
  .image-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 15px;
    max-height: 45dvh;
    overflow-y: auto;
    padding: 3px;
  }
  .image-grid button {
    border: 2px solid transparent;
    padding: 4px;
    overflow: hidden;
    text-align: left;
  }
  .image-grid button.selected {
    border-color: #527448;
    background: #eff4e9;
  }
  .image-grid img {
    width: 100%;
    aspect-ratio: 1.4;
    object-fit: cover;
    display: block;
    border-radius: 3px;
  }
  .image-grid span {
    display: block;
    padding: 9px 3px 3px;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  .image-picker footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 24px;
    font-size: 13px;
    color: #87957c;
  }
  .upload-zone {
    display: grid;
    gap: 12px;
    border: 1px dashed #b1bfaa;
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 20px;
    color: #5f7e52;
    font-size: 14px;
  }
  .upload-zone small {
    color: #8b9880;
    font-size: 12px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  @media (max-width: 1200px) {
    main {
      padding: 24px;
    }
    .editor-layout-articles {
      grid-template-columns: minmax(0, 1fr) 215px;
      gap: 16px;
    }
    .writing-title {
      padding: 22px 28px 10px;
    }
  }
  @media (max-width: 1000px) {
    .editor-layout-articles {
      grid-template-columns: 1fr;
    }
    .article-settings {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 24px;
    }
    .article-settings h2 {
      grid-column: 1/-1;
    }
  }
  @media (max-width: 780px) {
    main {
      padding: 24px 16px;
    }
    .edit-top .actions {
      margin-left: 0;
    }
  }
  @media (max-width: 480px) {
    .writing-title {
      padding: 20px 20px 10px;
    }
    .title-input {
      font-size: 24px;
    }
    .article-settings {
      display: block;
    }
    .image-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    dialog {
      padding: 18px;
    }
  }
  .cover-actions {
    display: flex;
    gap: 8px;
    margin: 0 0 22px;
  }
  .media-pages {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 18px;
    font-size: 12px;
  }
  .edit-top > a {
    color: #67775f;
    text-decoration: none;
  }
  .article-settings fieldset {
    max-height: 300px;
    overflow: auto;
  }
  .editor-lock {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  .setting-label {
    font-size: 12px;
    color: #697861;
  }
</style>
