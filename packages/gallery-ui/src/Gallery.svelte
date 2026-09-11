<script lang="ts">
  import { tick } from 'svelte';
  import type { DisplayAlbum, DisplayPhoto } from '../../gallery-core/src/content';
  let {
    site,
    albums,
    active = null,
    preview = false,
    about = false,
  }: {
    site: { name: string; tagline: string };
    albums: DisplayAlbum[];
    active?: DisplayAlbum | null;
    preview?: boolean;
    about?: boolean;
  } = $props();
  let viewer: HTMLDialogElement;
  let photo = $state<DisplayPhoto | null>(null);
  let info = $state(true);
  let page = $state(0);
  let pageAlbum = $state<string | null>(null);
  $effect(() => {
    const current = active?.id ?? null;
    if (current !== pageAlbum) {
      pageAlbum = current;
      page = 0;
      photo = null;
      viewer?.close();
    }
  });
  const link = (a: DisplayAlbum) => (preview ? `/preview/${a.id}` : `/albums/${a.slug}`);
  let children = $derived(albums.filter((a) => a.parent === (active?.id ?? '')));
  let crumbs = $derived.by(() => {
    const result: DisplayAlbum[] = [];
    let parent = active?.parent;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const a = albums.find((a) => a.id === parent);
      if (!a) break;
      result.unshift(a);
      parent = a.parent;
    }
    return result;
  });
  async function show(p: DisplayPhoto) {
    photo = p;
    await tick();
    viewer.showModal();
  }
  function shift(offset: number) {
    if (!photo || !active) return;
    const index = active.photos.findIndex((p) => p.id === photo!.id);
    photo = active.photos[(index + offset + active.photos.length) % active.photos.length] ?? null;
  }
  function keys(e: KeyboardEvent) {
    if (!viewer?.open) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      shift(1);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      shift(-1);
    }
  }
</script>

<svelte:window onkeydown={keys} />
{#snippet story()}<p class="intro">{active?.summary}</p>
  {#each active?.blocks ?? [] as block}{#if block.kind === 'heading'}<h3>
        {block.text}
      </h3>{:else if block.kind === 'quote'}<blockquote>{block.text}</blockquote>{:else}<p>
        {block.text}
      </p>{/if}{/each}{/snippet}
{#if preview}<div class="preview-notice">
    草稿预览 · 仅管理员可见 · 当前显示已保存内容 <a href="/albums">返回工作台 →</a>
  </div>{/if}
<div class="gallery">
  <header>
    <a class="brand" href="/albums">{site.name}</a>
    <nav aria-label="主导航">
      <a class:chosen={!about} href="/albums">相册</a>{#if !preview}<a class:chosen={about} href="/about">关于</a>{/if}
    </nav>
  </header>
  <main>
    {#if about}<article class="about">
        <p class="kicker">ABOUT</p>
        <h1>在路上，也在日常里</h1>
        <p>{site.tagline || '这里收藏旅行中的风景，也记录日常里不经意的光。'}</p>
        <h2>关于这个相册</h2>
        <p>有些地方值得再去一次，有些瞬间值得慢慢回看。把照片整理成相册，把走过的路写成文字，便有了这里。</p>
        <p>愿这些照片，也能让你停留片刻。</p>
      </article>
    {:else if !active}<div class="heading">
        <p class="kicker">COLLECTIONS</p>
        <h1>相册</h1>
        <p>{site.tagline}</p>
      </div>
      <div class="album-grid">
        {#each children as album}<a class="album-card" href={link(album)}
            >{#if album.cover}<img
                src={album.cover}
                alt={album.title}
                loading="lazy"
                width="600"
                height="450"
              />{:else}<div class="empty-cover">{album.title.slice(0, 1)}</div>{/if}
            <h2>{album.title}</h2>
            <p>{album.count} 张照片{albums.some((a) => a.parent === album.id) ? ' · 含子相册' : ''}</p></a
          >{/each}
      </div>
      {#if !children.length}<div class="empty">
          <h2>相册正在整理中</h2>
          <p>发布后的作品会在这里出现。</p>
        </div>{/if}
    {:else}<div class="breadcrumbs">
        <a href="/albums">相册</a>{#each crumbs as parent}<span>/</span><a href={link(parent)}>{parent.title}</a>{/each}
      </div>
      <h1>{active.title}</h1>
      <div class="detail">
        <div class="images">
          {#if children.length}<h2 class="section-title">子相册 <span>{children.length}</span></h2>
            <div class="children-grid">
              {#each children as album}<a class="album-card" href={link(album)}
                  >{#if album.cover}<img
                      src={album.cover}
                      alt={album.title}
                      loading="lazy"
                      width="600"
                      height="450"
                    />{:else}<div class="empty-cover">{album.title.slice(0, 1)}</div>{/if}
                  <h2>{album.title}</h2>
                  <p>{album.count} 张照片</p></a
                >{/each}
            </div>{/if}
          <h2 class="section-title">照片 <span>{active.photos.length}</span></h2>
          <div class="photos-grid">
            {#each active.photos.slice(page * 48, (page + 1) * 48) as p}<button class="photo" onclick={() => show(p)}
                ><img
                  src={p.thumbnail}
                  alt={p.alt || p.title || '查看照片'}
                  loading="lazy"
                  width="600"
                  height="450"
                />{#if p.title}<span>{p.title}</span>{/if}</button
              >{/each}
          </div>
          {#if !active.photos.length}<p class="empty">
              本册暂无直接照片{children.length ? '，可以继续浏览子相册。' : '。'}
            </p>{/if}{#if active.photos.length > 48}<div class="pagination">
              <button disabled={page === 0} onclick={() => page--}>上一页</button><span
                >{page + 1} / {Math.ceil(active.photos.length / 48)}</span
              ><button disabled={(page + 1) * 48 >= active.photos.length} onclick={() => page++}>下一页</button>
            </div>{/if}
        </div>
        <aside>
          <div class="desktop-story">{@render story()}</div>
          <details class="mobile-story"><summary>相册介绍 · 展开阅读</summary>{@render story()}</details>
        </aside>
      </div>{/if}
  </main>
  <footer>© {new Date().getFullYear()} {site.name}</footer>
</div>
<dialog bind:this={viewer} aria-label="照片大图" onclose={() => (photo = null)}>
  {#if photo}<div class="viewer-toolbar">
      <span>{active ? active.photos.findIndex((p) => p.id === photo!.id) + 1 : 1} / {active?.photos.length}</span>
      <div>
        <button onclick={() => (info = !info)}>{info ? '隐藏信息' : '显示信息'}</button><button
          aria-label="关闭大图"
          onclick={() => viewer.close()}>×</button
        >
      </div>
    </div>
    <div class="viewer-body" class:without-info={!info}>
      <div class="full-image">
        <img src={photo.src} alt={photo.alt || photo.title || '照片'} />
        <div class="viewer-arrows">
          <button aria-label="上一张照片" onclick={() => shift(-1)}>←</button><button
            aria-label="下一张照片"
            onclick={() => shift(1)}>→</button
          >
        </div>
      </div>
      {#if info}<aside>
          <h2>{photo.title || '未命名照片'}</h2>
          <p>{photo.description}</p>
          {#if photo.exif}<h3>EXIF</h3>
            <dl>
              {#each Object.entries(photo.exif).filter(([, value]) => value !== null && value !== '') as [key, value]}<div
                >
                  <dt>
                    {(
                      {
                        make: '品牌',
                        model: '相机',
                        lensModel: '镜头',
                        fNumber: '光圈',
                        focalLength: '焦距',
                        iso: 'ISO',
                        exposureTime: '快门',
                      } as Record<string, string>
                    )[key] ?? key}
                  </dt>
                  <dd>{value}</dd>
                </div>{/each}
            </dl>{/if}{#if photo.latitude !== null && photo.longitude !== null}<h3>位置</h3>
            <p>{photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}</p>{/if}
        </aside>{/if}
    </div>{/if}
</dialog>

<style>
  :global(body) {
    margin: 0;
    background: #fafbf9;
    color: #2f3731;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  }
  .gallery {
    max-width: 1680px;
    margin: auto;
    padding: 0 5%;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 32px 0;
    border-bottom: 1px solid #e4e7e0;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .brand {
    font-family: Georgia, 'Songti SC', serif;
    font-size: 26px;
    font-weight: 650;
  }
  nav {
    display: flex;
    gap: 30px;
    font-size: 14px;
  }
  nav a {
    padding: 8px 0;
    color: #8b9289;
  }
  nav a.chosen {
    color: #374735;
    border-bottom: 1px solid;
  }
  main {
    padding: 45px 0 65px;
    min-height: 60vh;
  }
  h1 {
    font-size: 34px;
    font-weight: 550;
    margin: 0 0 28px;
    overflow-wrap: anywhere;
  }
  .heading p {
    color: #899281;
    margin: 0 0 25px;
    font-size: 15px;
  }
  .kicker {
    font-size: 12px !important;
    letter-spacing: 2px;
  }
  .album-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 40px 24px;
  }
  .album-card {
    min-width: 0;
  }
  .album-card img,
  .empty-cover {
    width: 100%;
    height: auto;
    aspect-ratio: 4/3;
    object-fit: cover;
    background: #ecefe7;
    border-radius: 3px;
  }
  .empty-cover {
    display: grid;
    place-items: center;
    font:
      40px Georgia,
      serif;
    color: #a2b096;
  }
  .album-card h2 {
    font-size: 17px;
    font-weight: 500;
    margin: 14px 0 6px;
    overflow-wrap: anywhere;
  }
  .album-card p {
    font-size: 12px;
    color: #8b9585;
    margin: 0;
  }
  .breadcrumbs {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #84907e;
    margin-bottom: 25px;
  }
  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 310px;
    gap: 55px;
  }
  .children-grid,
  .photos-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 25px 18px;
  }
  .section-title {
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 1px;
    margin: 0 0 22px;
  }
  .section-title span {
    color: #9ca593;
    margin-left: 8px;
    font-size: 12px;
  }
  .children-grid + .section-title {
    margin-top: 42px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .photo {
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    color: inherit;
    min-width: 0;
  }
  .photo img {
    width: 100%;
    height: auto;
    aspect-ratio: 4/3;
    object-fit: contain;
    background: #f0f2ec;
  }
  .photo span {
    display: block;
    font-size: 12px;
    padding-top: 8px;
    overflow-wrap: anywhere;
  }
  aside p,
  aside blockquote {
    font-size: 15px;
    line-height: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0 0 26px;
  }
  .intro {
    color: #87937d;
  }
  aside h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 30px 0 16px;
  }
  blockquote {
    margin-left: 0;
    padding-left: 18px;
    border-left: 2px solid #afbea1;
    color: #78856d;
  }
  .mobile-story {
    display: none;
  }
  .empty {
    padding: 70px 0;
    color: #909a86;
    text-align: center;
  }
  .empty h2 {
    font-size: 21px;
    font-weight: 500;
  }
  .empty p {
    font-size: 14px;
  }
  .pagination {
    display: flex;
    gap: 22px;
    justify-content: center;
    align-items: center;
    margin-top: 35px;
    font-size: 13px;
  }
  .pagination button {
    border: 1px solid #dce2d6;
    padding: 8px 14px;
    background: white;
    border-radius: 4px;
  }
  .pagination button:disabled {
    opacity: 0.4;
  }
  footer {
    border-top: 1px solid #e4e7e0;
    padding: 26px 0;
    color: #8c9881;
    font-size: 12px;
  }
  .about {
    max-width: 660px;
    margin: 35px auto;
  }
  .about p {
    font-size: 17px;
    line-height: 2.1;
    color: #78826f;
  }
  .about h2 {
    font-size: 22px;
    font-weight: 500;
    margin-top: 40px;
  }
  .preview-notice {
    padding: 12px 5%;
    background: #e7f0e1;
    color: #46603e;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    gap: 15px;
    flex-wrap: wrap;
  }
  dialog {
    padding: 0;
    border: 0;
    border-radius: 6px;
    width: calc(100vw - 32px);
    max-width: 1920px;
    max-height: calc(100dvh - 32px);
    background: #171d18;
    color: #f1f4ee;
    overflow: auto;
  }
  dialog::backdrop {
    background: #0d140ded;
  }
  .viewer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    font-size: 12px;
    gap: 15px;
  }
  .viewer-toolbar button {
    border: 0;
    background: none;
    color: #dbe3d5;
    padding: 8px 12px;
    font-size: 13px;
  }
  .viewer-toolbar button:last-child {
    font-size: 25px;
  }
  .viewer-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    min-height: 60vh;
  }
  .viewer-body.without-info {
    grid-template-columns: minmax(0, 1fr);
  }
  .full-image {
    position: relative;
    min-width: 0;
  }
  .full-image > img {
    width: 100%;
    height: calc(100dvh - 115px);
    object-fit: contain;
    display: block;
  }
  .viewer-body aside {
    padding: 30px 25px;
    max-height: calc(100dvh - 130px);
    overflow: auto;
  }
  .viewer-body aside h2 {
    font-size: 20px;
    font-weight: 500;
    margin: 0 0 20px;
  }
  .viewer-body aside p {
    font-size: 14px;
    color: #b9c4b2;
  }
  .viewer-body aside h3 {
    font-size: 12px;
    letter-spacing: 1px;
    color: #8a9e80;
  }
  .viewer-body dl {
    font-size: 12px;
  }
  .viewer-body dl > div {
    display: flex;
    justify-content: space-between;
    gap: 15px;
    padding: 8px 0;
    border-bottom: 1px solid #2c352a;
  }
  .viewer-body dt {
    color: #91a086;
  }
  .viewer-body dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .viewer-arrows {
    position: absolute;
    bottom: 16px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 14px;
  }
  .viewer-arrows button {
    border: 1px solid #778c6677;
    border-radius: 50%;
    width: 38px;
    height: 38px;
    background: #162112b8;
    color: white;
    font-size: 18px;
  }
  :global(a:focus-visible),
  button:focus-visible {
    outline: 2px solid #789968;
    outline-offset: 4px;
  }
  @media (max-width: 1100px) {
    .album-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .detail {
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 30px;
    }
    .photos-grid,
    .children-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .gallery {
      padding: 0 22px;
    }
    header {
      padding: 22px 0;
    }
    .brand {
      font-size: 23px;
    }
    nav {
      gap: 23px;
      font-size: 13px;
    }
    main {
      padding-top: 30px;
    }
    h1 {
      font-size: 27px;
    }
    .album-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 30px 15px;
    }
    .album-card h2 {
      font-size: 15px;
      margin-top: 12px;
    }
    .detail {
      grid-template-columns: minmax(0, 1fr);
      gap: 35px;
    }
    .detail aside {
      border-top: 1px solid #e3e8de;
      padding-top: 25px;
    }
    .desktop-story {
      display: none;
    }
    .mobile-story {
      display: block;
    }
    .mobile-story summary {
      font-size: 14px;
      cursor: pointer;
      padding-bottom: 22px;
    }
    .viewer-body {
      grid-template-columns: minmax(0, 1fr);
    }
    .full-image > img {
      height: 60dvh;
    }
    .viewer-body.without-info .full-image > img {
      height: calc(100dvh - 110px);
    }
    .viewer-body aside {
      max-height: none;
      padding: 25px;
    }
    .about {
      margin-top: 10px;
    }
    .about p {
      font-size: 16px;
    }
    .preview-notice {
      font-size: 12px;
    }
    .viewer-toolbar {
      padding: 8px 12px;
    }
    dialog {
      width: calc(100vw - 16px);
      max-height: calc(100dvh - 16px);
    }
  }
</style>
