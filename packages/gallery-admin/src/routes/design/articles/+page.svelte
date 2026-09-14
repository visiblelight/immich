<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArticleReader } from "@gallery/ui";
  import {
    articleText,
    validateArticleDocument,
    type ArticleNode,
    type ArticleImageResolver,
  } from "@gallery/core";
  import {
    sampleArticles,
    samplePhotos,
    resolveSampleImage,
    type ArticleSample,
  } from "@gallery/ui/article-design";
  import AdminSidebar from "$lib/AdminSidebar.svelte";
  import RichTextEditor from "$lib/articles/RichTextEditor.svelte";
  import {
    loadDesign,
    saveDesign,
    type LocalImage,
  } from "$lib/articles/design-store";
  import "$lib/design/admin.css";
  let articles = $state<ArticleSample[]>(structuredClone(sampleArticles));
  let published = $state<Record<string, ArticleSample>>({
    about: structuredClone(
      sampleArticles.find((article) => article.id === "about")!,
    ),
  });
  let about = $state("about");
  let imageFiles = $state.raw<LocalImage[]>([]);
  let urls = $state<Record<string, string>>({});
  let currentId = $state("");
  let current = $derived(articles.find((a) => a.id === currentId));
  let search = $state("");
  let statusFilter = $state("all");
  let selected = $state<string[]>([]);
  let pickerTab = $state("photos");
  let albumFilter = $state("全部相册");
  let imageSearch = $state("");
  let saveStatus = $state("正在读取本地样稿…");
  let message = $state("");
  let ready = $state(false);
  let revision = $state(0);
  let focus = $state(false);
  let previewMode = $state(false);
  let previewPublished = $state(false);
  let settings = $state(true);
  let mediaDialog: HTMLDialogElement;
  let settingsDialog: HTMLDialogElement;
  let editor = $state<RichTextEditor>();
  let pending: ReturnType<typeof setTimeout> | undefined;
  let saveChain = Promise.resolve();
  const resolve: ArticleImageResolver = (node) =>
    node.attrs?.kind === "upload"
      ? urls[String(node.attrs.ref)]
        ? {
            src: urls[String(node.attrs.ref)]!,
            preview: urls[String(node.attrs.ref)]!,
            alt:
              imageFiles.find((f) => f.id === node.attrs?.ref)?.name ??
              "文章插图",
          }
        : null
      : resolveSampleImage(node);
  const filtered = $derived(
    articles.filter(
      (a) =>
        a.title.includes(search) &&
        (statusFilter === "all" ||
          (statusFilter === "published"
            ? !!published[a.id]
            : !published[a.id])),
    ),
  );
  const displayArticle = $derived(
    current && previewPublished ? published[current.id] : current,
  );
  function save() {
    if (!ready) return;
    clearTimeout(pending);
    const atRevision = revision;
    const snapshot = {
      articles: structuredClone($state.snapshot(articles)),
      published: structuredClone($state.snapshot(published)),
      images: imageFiles,
      about,
    };
    saveStatus = "正在保存样稿…";
    saveChain = saveChain
      .catch(() => {})
      .then(() => saveDesign(snapshot))
      .then(() => {
        if (atRevision === revision) saveStatus = "样稿已保存在此浏览器";
      })
      .catch(() => {
        saveStatus = "保存失败，请保留此页面";
      });
  }
  function changed() {
    revision++;
    saveStatus = "样稿有修改…";
    clearTimeout(pending);
    pending = setTimeout(save, 500);
  }
  function edit(id: string) {
    currentId = id;
    previewMode = false;
    previewPublished = false;
    message = "";
    window.scrollTo(0, 0);
  }
  function create() {
    const article: ArticleSample = {
      id: crypto.randomUUID(),
      title: "",
      summary: "",
      date: new Date().toISOString().slice(0, 10),
      cover: "",
      listed: true,
      albums: [],
      document: {
        schemaVersion: 1,
        doc: { type: "doc", content: [{ type: "paragraph" }] },
      },
    };
    articles = [article, ...articles];
    changed();
    edit(article.id);
  }
  function publish() {
    if (!current) return;
    if (!current.title.trim() || !articleText(current.document.doc).trim()) {
      message = "请先填写标题和正文。";
      return;
    }
    try {
      validateArticleDocument(current.document);
    } catch (error) {
      message = error instanceof Error ? error.message : "文章格式无效";
      return;
    }
    published = {
      ...published,
      [current.id]: structuredClone($state.snapshot(current)),
    };
    changed();
    save();
    message = "已生成此浏览器内的发布样稿，未发布到真实前台。";
  }
  function insertSelected() {
    const nodes: ArticleNode[] = selected.map((id) => ({
      type: "galleryImage",
      attrs: {
        kind: pickerTab === "photos" ? "photo" : "upload",
        ref: id,
        ...(pickerTab === "photos" ? { album: "georgia" } : {}),
      },
      content: [],
    }));
    mediaDialog.close();
    editor?.insertImages(nodes);
    selected = [];
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      ) {
        message = "样例支持 10 MB 以内的 JPEG、PNG 和 WebP 图片。";
        continue;
      }
      try {
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        const id = crypto.randomUUID();
        imageFiles = [...imageFiles, { id, name: file.name, file }];
        urls = { ...urls, [id]: URL.createObjectURL(file) };
        selected = [...selected, id];
        changed();
      } catch {
        message = "无法读取这张图片，请选择有效的图片文件。";
      }
    }
  }
  onMount(() => {
    let live = true;
    void loadDesign()
      .then((saved) => {
        if (!live) return;
        if (saved) {
          articles = saved.articles;
          published = saved.published;
          about = saved.about;
          imageFiles = saved.images;
          urls = Object.fromEntries(
            saved.images.map((f) => [f.id, URL.createObjectURL(f.file)]),
          );
        }
        ready = true;
        saveStatus = "样稿已保存在此浏览器";
      })
      .catch(() => {
        if (live) {
          ready = true;
          saveStatus = "浏览器存储不可用；当前内容仅保留在页面内";
        }
      });
    return () => {
      live = false;
      clearTimeout(pending);
      if (ready) save();
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  });
</script>

<svelte:head
  ><title>{current ? "编辑文章" : "文章管理"} · Gallery 设计预览</title
  ></svelte:head
>
<svelte:window
  onbeforeunload={(event) => {
    if (
      saveStatus.includes("修改") ||
      saveStatus.includes("正在保存") ||
      saveStatus.includes("失败")
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  }}
  onkeydown={(event) => {
    if (event.key === "Escape") {
      focus = false;
    }
  }}
/>
<div class="design-banner">
  文章工作台 · 交互样例 <span>样稿仅保存在此浏览器，不影响现有内容</span><a
    href="http://127.0.0.1:3100/design/records"
    target="_blank"
    rel="noreferrer">查看前台样例 ↗</a
  >
</div>
<div class="workspace" class:focused={focus}>
  {#if !focus}<AdminSidebar
      active="articles"
      articles
      user={{
        id: "design",
        displayName: "创作者",
        email: "design@example.invalid",
      }}
      publicOrigin="http://127.0.0.1:3100"
      onNavigate={(target) => {
        if (target === "articles") {
          currentId = "";
          focus = false;
        } else void goto("/" + target);
      }}
    />{/if}
  <main>
    {#if !current}
      <header class="page-top">
        <div>
          <h1>文章</h1>
          <p>正式游记，也记下日常里的想法。</p>
        </div>
        <div class="actions">
          <button onclick={() => settingsDialog.showModal()}>关于页选篇</button
          ><button class="primary" onclick={create} disabled={!ready}
            >＋ 写文章</button
          >
        </div>
      </header>
      <div class="list-filters">
        <label class="search"
          ><span class="sr-only">搜索文章</span><input
            bind:value={search}
            placeholder="搜索文章标题"
          /></label
        ><select bind:value={statusFilter} aria-label="文章状态"
          ><option value="all">全部文章 · {articles.length}</option><option
            value="draft">草稿</option
          ><option value="published">已发布样稿</option></select
        >
      </div>
      <section class="article-list" aria-label="文章列表">
        {#each filtered as article}<button
            class="article-row"
            onclick={() => edit(article.id)}
            disabled={!ready}
            ><div class="row-text">
              <div class="row-title">
                {article.title || "未命名文章"}{#if about === article.id}<span
                    class="badge">关于页</span
                  >{/if}
              </div>
              <p>{article.summary || "尚未填写摘要"}</p>
              <span
                >{article.date} · {articleText(article.document.doc).length} 字</span
              >
            </div>
            <span class="status"
              >{published[article.id] ? "已发布样稿" : "草稿"}</span
            ><span aria-hidden="true">↗</span></button
          >{:else}<p class="empty">没有找到符合条件的文章</p>{/each}
      </section>
    {:else}
      <header class="edit-top">
        <button
          class="back-button"
          onclick={() => {
            save();
            currentId = "";
            focus = false;
          }}>← 文章</button
        ><span class="save-status" role="status">{saveStatus}</span>
        <div class="actions">
          <button
            onclick={() => {
              previewMode = !previewMode;
              previewPublished = false;
            }}>{previewMode ? "继续编辑" : "预览"}</button
          ><button
            onclick={() => {
              settings = !settings;
            }}
            aria-expanded={settings}>文章设置</button
          ><button class="primary" onclick={publish}
            >{published[current.id] ? "更新发布样稿" : "发布样稿"}</button
          >
        </div>
      </header>
      {#if message}<div class="message" role="status">{message}</div>{/if}
      <div
        class="editor-layout-articles"
        class:without-settings={!settings || focus}
      >
        <section class="writing-paper">
          {#if previewMode && displayArticle}
            <div class="preview-switch">
              <span>阅读预览</span>{#if published[current.id]}<button
                  onclick={() => (previewPublished = !previewPublished)}
                  >{previewPublished ? "查看当前草稿" : "查看发布样稿"}</button
                >{/if}
            </div>
            <div class="reader-preview">
              <ArticleReader
                title={displayArticle.title || "未命名文章"}
                date={displayArticle.date}
                document={displayArticle.document}
                resolveImage={resolve}
              />
            </div>
          {:else}
            <div class="writing-title">
              <div class="writing-caption">
                <span>文章正文</span><button
                  onclick={() => {
                    focus = !focus;
                  }}>{focus ? "退出专注" : "专注写作"}</button
                >
              </div>
              <label
                ><span class="sr-only">文章标题</span><textarea
                  rows="2"
                  class="title-input"
                  placeholder="给文章起个标题…"
                  bind:value={current.title}
                  oninput={changed}
                ></textarea></label
              >
            </div>
            {#key current.id}<RichTextEditor
                bind:this={editor}
                document={current.document}
                resolveImage={resolve}
                onChange={(doc) => {
                  if (current) {
                    current.document = doc;
                    changed();
                  }
                }}
                onInsertImage={() => {
                  selected = [];
                  message = "";
                  mediaDialog.showModal();
                }}
              />{/key}
          {/if}
        </section>
        {#if settings && !focus}<aside class="article-settings">
            <h2>文章设置</h2>
            <label
              >摘要<textarea
                rows="4"
                bind:value={current.summary}
                oninput={changed}
                placeholder="用一两句话介绍这篇文章"
              ></textarea></label
            ><label
              >发表日期<input
                type="date"
                bind:value={current.date}
                onchange={changed}
              /></label
            ><label
              >封面<select bind:value={current.cover} onchange={changed}
                ><option value="">不设置封面</option
                >{#each samplePhotos as photo}<option value={photo.id}
                    >{photo.title}</option
                  >{/each}</select
              ></label
            >{#if current.cover}<img
                class="cover-preview"
                src={"/design-assets/" + current.cover + "-small.jpg"}
                alt="封面预览"
              />{/if}<label class="check"
              ><input
                type="checkbox"
                bind:checked={current.listed}
                onchange={changed}
              />展示在记录列表</label
            >
            <fieldset>
              <legend>相关相册</legend
              >{#each ["第比利斯", "高加索山地", "巴统"] as album}<label
                  class="check"
                  ><input
                    type="checkbox"
                    value={album}
                    bind:group={current.albums}
                    onchange={changed}
                  />{album}</label
                >{/each}
            </fieldset>
            <p class="hint">
              正文中的图片说明只属于这篇文章，不修改照片本身的资料。
            </p>
            {#if published[current.id]}<button
                class="withdraw"
                onclick={() => {
                  if (about === currentId) {
                    message = "请先更换关于页文章，再下线此发布样稿。";
                    return;
                  }
                  delete published[currentId];
                  changed();
                  message = "发布样稿已下线，草稿仍保留。";
                }}>下线发布样稿</button
              >{/if}
          </aside>{/if}
      </div>
    {/if}
  </main>
</div>
<dialog
  bind:this={mediaDialog}
  class="image-picker"
  aria-labelledby="image-picker-title"
>
  <header>
    <div>
      <h2 id="image-picker-title">插入图片</h2>
      <p>在光标所在位置插入，可在图片下方直接写说明。</p>
    </div>
    <button onclick={() => mediaDialog.close()} aria-label="关闭图片选择"
      >✕</button
    >
  </header>
  <div class="picker-tabs">
    <button
      class:chosen={pickerTab === "photos"}
      onclick={() => {
        pickerTab = "photos";
        selected = [];
      }}>Gallery 照片</button
    ><button
      class:chosen={pickerTab === "uploads"}
      onclick={() => {
        pickerTab = "uploads";
        selected = [];
      }}>上传素材</button
    >
  </div>
  {#if pickerTab === "photos"}<div class="picker-filters">
      <input
        aria-label="搜索图片"
        placeholder="搜索照片"
        bind:value={imageSearch}
      /><select aria-label="按相册筛选" bind:value={albumFilter}
        ><option>全部相册</option><option>第比利斯</option><option
          >高加索山地</option
        ><option>巴统</option></select
      >
    </div>
    <div class="image-grid">
      {#each samplePhotos.filter((p) => p.title.includes(imageSearch) && (albumFilter === "全部相册" || p.album === albumFilter)) as photo}<button
          class:selected={selected.includes(photo.id)}
          aria-pressed={selected.includes(photo.id)}
          onclick={() => {
            selected = selected.includes(photo.id)
              ? selected.filter((id) => id !== photo.id)
              : [...selected, photo.id];
          }}
          ><img
            src={"/design-assets/" + photo.id + "-small.jpg"}
            alt={photo.title}
          /><span>{photo.title}</span></button
        >{/each}
    </div>
  {:else}<label class="upload-zone"
      >＋ 选择本机图片<input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onchange={(event) => {
          void upload(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      /><small>JPEG、PNG、WebP，每张最多 10 MB；样例保存在此浏览器。</small
      ></label
    >
    <div class="image-grid">
      {#each imageFiles as file}<button
          class:selected={selected.includes(file.id)}
          aria-pressed={selected.includes(file.id)}
          onclick={() => {
            selected = selected.includes(file.id)
              ? selected.filter((id) => id !== file.id)
              : [...selected, file.id];
          }}
          ><img src={urls[file.id]} alt={file.name} /><span>{file.name}</span
          ></button
        >{/each}
    </div>{/if}
  {#if message}<p role="alert">{message}</p>{/if}
  <footer>
    <span>已选择 {selected.length} 张</span><button
      class="primary"
      disabled={!selected.length}
      onclick={insertSelected}>插入正文</button
    >
  </footer>
</dialog>
<dialog
  bind:this={settingsDialog}
  class="about-dialog"
  aria-labelledby="about-dialog-title"
>
  <h2 id="about-dialog-title">关于页选篇</h2>
  <p>选择已发布样稿作为关于页；修改仅用于本地体验。</p>
  <label
    >关于页面文章<select bind:value={about} onchange={changed}
      ><option value="">未选择</option
      >{#each articles.filter((a) => published[a.id] || a.id === about) as article}<option
          value={article.id}>{article.title}</option
        >{/each}</select
    ></label
  >
  <p class="hint">先在文章中生成发布样稿，即可在这里选择。</p>
  <button
    class="primary"
    onclick={() => {
      save();
      settingsDialog.close();
    }}>保存样例设置</button
  >
</dialog>

<style>
  .design-banner {
    min-height: 36px;
    padding: 8px 24px;
    background: #e8eee4;
    color: #68765e;
    display: flex;
    gap: 24px;
    font-size: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .design-banner a {
    margin-left: auto;
  }
  .design-banner span {
    color: #8a9383;
  }
  main {
    min-width: 0;
    padding: 34px 40px 70px;
  }
  h1 {
    font-size: 26px;
    margin-bottom: 8px;
  }
  .page-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    margin-bottom: 30px;
  }
  .page-top p {
    color: #8a9383;
    margin-bottom: 0;
    font-size: 13px;
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
  .list-filters {
    display: flex;
    gap: 14px;
    margin-bottom: 20px;
  }
  .search {
    max-width: 340px;
    flex: 1;
  }
  select {
    appearance: none;
    background: white
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23727e70' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 12px center;
    padding-right: 34px;
  }
  .list-filters select {
    width: 170px;
  }
  .article-list {
    background: #fcfdfb;
    border: 1px solid #e2e7dd;
    border-radius: 8px;
    overflow: hidden;
  }
  .article-row {
    display: flex;
    align-items: center;
    gap: 25px;
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 0;
    border-bottom: 1px solid #e7ebe2;
    padding: 25px 28px;
    background: transparent;
  }
  .article-row:last-child {
    border-bottom: 0;
  }
  .row-text {
    flex: 1;
    min-width: 0;
  }
  .row-title {
    font-size: 17px;
    font-weight: 550;
    margin-bottom: 9px;
  }
  .row-text p {
    color: #829078;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .row-text > span {
    color: #929a8a;
    font-size: 12px;
  }
  .badge,
  .status {
    font-size: 11px;
    background: #eef2e8;
    color: #78856b;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    font-weight: 400;
  }
  .badge {
    margin-left: 12px;
  }
  .empty {
    padding: 50px;
    text-align: center;
    color: #809076;
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
  .back-button {
    border: 0;
    background: transparent;
    padding-left: 0;
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
  .article-settings label,
  .about-dialog label {
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
  .reader-preview {
    padding: 0 32px;
  }
  .reader-preview :global(.article-layout) {
    display: block;
    margin-top: 25px;
  }
  .reader-preview :global(.desktop-toc) {
    display: none;
  }
  .preview-switch {
    padding: 16px 25px;
    border-bottom: 1px solid #e4e8df;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #88947e;
    font-size: 12px;
  }
  .preview-switch button {
    font-size: 12px;
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
  .about-dialog {
    width: min(470px, calc(100vw - 30px));
  }
  .about-dialog p {
    font-size: 13px;
    color: #8a9680;
  }
  .about-dialog button {
    margin-top: 25px;
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
    .page-top {
      align-items: start;
      flex-wrap: wrap;
    }
    .edit-top .actions {
      margin-left: 0;
    }
    .design-banner {
      padding: 8px 16px;
      gap: 6px;
    }
    .design-banner span {
      display: none;
    }
    .article-row {
      padding: 20px 18px;
      gap: 12px;
    }
    .article-row > .status {
      display: none;
    }
    .row-title {
      font-size: 16px;
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
    .reader-preview {
      padding: 0 20px;
    }
    .list-filters {
      flex-wrap: wrap;
    }
    .search {
      min-width: 150px;
    }
  }
</style>
