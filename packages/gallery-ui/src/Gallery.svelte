<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { captureTime } from '../../gallery-core/src/capture-time';
  import Markdown from './Markdown.svelte';
  import { documentMarkdown } from '../../gallery-core/src/markdown';
  import type { DisplayAlbum, DisplayPhoto } from '../../gallery-core/src/content';
  let {
    site,
    albums,
    active = null,
    preview = false,
    about = false,
    initialPhotoId = null,
    initialPage = 1,
    navigatePhoto,
    feed,
    navigateBoundary,
    immersive = $bindable(false),
  }: {
    site: { name: string; tagline: string; contactLinks?: import('../../gallery-core/src/content').ContactLink[] };
    albums: DisplayAlbum[];
    active?: DisplayAlbum | null;
    preview?: boolean;
    about?: boolean;
    initialPhotoId?: string | null;
    initialPage?: number;
    navigatePhoto?: (photo: DisplayPhoto | null, replace?: boolean) => void;
    navigateBoundary?: (offset: number) => void;
    immersive?: boolean;
    feed?: { months: { month: string; count: number }[]; sort: string; month: string; page: number; total: number };
  } = $props();
  let photo = $state<DisplayPhoto | null>(null);
  let viewer: HTMLDialogElement;
  let showVariants = $state(true);
  const photoTitle = (p: DisplayPhoto) => (p.group ? p.group.title || '未命名照片组' : p.title || '未命名照片');
  $effect(() => {
    const selectedId = photo?.id;
    if (selectedId)
      void tick().then(() => {
        for (const selector of ['.group-variants .chosen', '.album-strip .chosen'])
          viewer?.querySelector(selector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
  });
  let immersiveButton = $state<HTMLButtonElement>();
  let touchX = 0,
    touchY = 0,
    swiped = false;
  async function setImmersive(value: boolean) {
    immersive = value;
    await tick();
    if (value) viewer?.querySelector<HTMLButtonElement>('.immersive-exit')?.focus({ preventScroll: true });
    else immersiveButton?.focus({ preventScroll: true });
  }
  let items = $derived.by(() => {
    const photos = active?.photos ?? [];
    if (feed) return photos;
    const seen = new Set<string>();
    return photos
      .filter((p) => {
        const id = p.group?.id || p.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((p) => (p.group ? (photos.find((x) => x.id === p.group!.cover && x.group?.id === p.group!.id) ?? p) : p));
  });
  let variants = $derived(
    photo?.group && !feed ? (active?.photos ?? []).filter((p) => p.group?.id === photo?.group?.id) : [],
  );
  const itemIndex = (p: DisplayPhoto) =>
    items.findIndex((x) => x.id === p.id || (!feed && p.group && x.group?.id === p.group.id));
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
          new Date(value),
        )
      : '日期未知';
  const feedLink = (page: number, month = feed?.month ?? '', sort = feed?.sort ?? 'taken') =>
    `/photos?${new URLSearchParams({ sort, month, page: String(page) })}`;

  let info = $state(true);
  let page = $state(untrack(() => Math.max(0, Math.min(Math.ceil((items.length || 1) / 48) - 1, initialPage - 1))));
  let pageAlbum = $state<string | null>(null);
  let albumPage = $state(0);
  $effect(() => {
    const current = active?.id ?? null;
    if (current !== pageAlbum) {
      pageAlbum = current;
      albumPage = 0;
      page = Math.max(0, Math.min(Math.ceil((items.length || 1) / 48) - 1, initialPage - 1));
      photo = null;
      viewer?.close();
      if (initialPhotoId && active) {
        const index = active.photos.findIndex((p) => p.id === initialPhotoId);
        const selected = active.photos[index];
        page = selected ? Math.max(0, Math.floor(itemIndex(selected) / 48)) : 0;
        if (selected)
          void tick()
            .then(() => {
              photo = selected;
              return tick();
            })
            .then(() => {
              if (viewer?.isConnected && !viewer.open) viewer.showModal();
            });
      }
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
  const photoLink = (p: DisplayPhoto) => `/albums/${p.albumSlug || active?.slug}/photos/${p.id}`;
  function closePhoto() {
    immersive = false;
    photo = null;
    if (initialPhotoId && navigatePhoto) navigatePhoto(null, true);
  }
  async function show(p: DisplayPhoto) {
    if (!preview && navigatePhoto) {
      navigatePhoto(p);
      return;
    }
    photo = p;
    await tick();
    viewer.showModal();
  }
  function choose(next: DisplayPhoto | null) {
    if (!next) return;
    if (!preview && navigatePhoto) navigatePhoto(next, true);
    else photo = next;
  }
  function shift(offset: number) {
    if (!photo) return;
    const index = itemIndex(photo),
      next = index + offset;
    if (feed && (next < 0 || next >= items.length)) {
      navigateBoundary?.(offset);
      return;
    }
    choose(items[(next + items.length) % items.length] ?? null);
  }
  function angle(offset: number) {
    if (!photo || variants.length < 2) return;
    const i = variants.findIndex((p) => p.id === photo!.id);
    choose(variants[(i + offset + variants.length) % variants.length]!);
  }
  function keys(e: KeyboardEvent) {
    if (!viewer?.open || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    if (e.key === 'ArrowRight') shift(1);
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowDown') angle(1);
    if (e.key === 'ArrowUp') angle(-1);
  }
</script>

<svelte:window onkeydown={keys} />
{#snippet story()}<Markdown text={active ? documentMarkdown(active, active.summary) : ''} />{/snippet}
{#if preview}<div class="preview-notice">
    草稿预览 · 仅管理员可见 · 当前显示已保存内容 <a href="/albums">返回工作台 →</a>
  </div>{/if}
<div class="gallery">
  <header>
    <a class="brand" href="/albums">{site.name}</a>
    <nav aria-label="主导航">
      <a class:chosen={!about && !feed} href="/albums">相册</a>{#if !preview}<a class:chosen={!!feed} href="/photos"
          >相片</a
        ><a href="/visited">去过</a><a class:chosen={about} href="/about">关于</a>{/if}
    </nav>
  </header>
  {#snippet albumPagination()}
    {#if children.length > 24}<div class="pagination">
        <button disabled={albumPage === 0} onclick={() => albumPage--}>上一页相册</button><span
          >{albumPage + 1} / {Math.ceil(children.length / 24)}</span
        ><button disabled={(albumPage + 1) * 24 >= children.length} onclick={() => albumPage++}>下一页相册</button>
      </div>{/if}
  {/snippet}
  <main>
    {#if about}<article class="about">
        <p class="kicker">ABOUT</p>
        <h1>在路上，也在日常里</h1>
        <p>{site.tagline || '这里收藏旅行中的风景，也记录日常里不经意的光。'}</p>
        <h2>关于这个相册</h2>
        <p>有些地方值得再去一次，有些瞬间值得慢慢回看。把照片整理成相册，把走过的路写成文字，便有了这里。</p>
        <p>愿这些照片，也能让你停留片刻。</p>
        {#if site.contactLinks?.length}<h2>联系我</h2>
          <ul>
            {#each site.contactLinks as contact}<li>
                <a href={contact.url} rel="noreferrer">{contact.label}</a>
              </li>{/each}
          </ul>{/if}
      </article>
    {:else if feed}<div class="heading feed-heading">
        <div>
          <p class="kicker">PHOTOGRAPHS</p>
          <h1>相片</h1>
          <p>{feed.total} 张 · {feed.sort === 'taken' ? '按拍摄时间' : '按首次加入 Gallery 时间'}</p>
        </div>
        <label
          >排序<select
            aria-label="相片排序"
            value={feed.sort}
            onchange={(e) => {
              window.location.href = feedLink(1, '', e.currentTarget.value);
            }}><option value="taken">拍摄时间 · 从新到旧</option><option value="added">最近加入 Gallery</option></select
          ></label
        >
      </div>
      <div class="timeline-layout">
        <div class="timeline-photos">
          {#each items as p, index (p.id)}{@const month =
              (feed.sort === 'added' ? p.addedAt : p.localTakenAt)?.slice(0, 7) || 'unknown'}
            {#if index === 0 || month !== ((feed.sort === 'added' ? items[index - 1]?.addedAt : items[index - 1]?.localTakenAt)?.slice(0, 7) || 'unknown')}<h2
                class="month-heading"
              >
                {month === 'unknown' ? '日期未知' : month.replace('-', ' 年 ') + ' 月'}
              </h2>{/if}
            <button class="photo" id={`photo-${p.id}`} onclick={() => show(p)}
              ><img
                src={p.thumbnail}
                alt={p.alt || p.title || p.group?.title || '查看照片'}
                width="600"
                height="450"
                loading="lazy"
              /><span>{photoTitle(p)}{p.group ? ' · 照片组' : ''}</span></button
            >
          {/each}
          {#if !items.length}<p class="empty">这里还没有公开照片。</p>{/if}
          <div class="pagination feed-pagination">
            {#if feed.page > 1}<a href={feedLink(feed.page - 1)}>上一页</a>{/if}<span
              >{feed.page} / {Math.max(1, Math.ceil(feed.total / 48))}</span
            >{#if feed.page * 48 < feed.total}<a href={feedLink(feed.page + 1)}>下一页</a>{/if}
          </div>
        </div>
        <aside class="timeline">
          <label
            >跳转年月<select
              aria-label="跳转年月"
              value={feed.month}
              onchange={(e) => {
                window.location.href = feedLink(1, e.currentTarget.value);
              }}
              ><option value="">全部时间</option>{#each feed.months as m}<option value={m.month}
                  >{m.month === 'unknown' ? '日期未知' : m.month} · {m.count}</option
                >{/each}</select
            ></label
          >
          <nav aria-label="照片时间轴">
            <a class:chosen={!feed.month} href={feedLink(1, '')}>全部</a>{#each feed.months as m}<a
                class:chosen={feed.month === m.month}
                href={feedLink(1, m.month)}>{m.month === 'unknown' ? '日期未知' : m.month}<small>{m.count}</small></a
              >{/each}
          </nav>
        </aside>
      </div>
    {:else if !active}<div class="heading">
        <p class="kicker">COLLECTIONS</p>
        <h1>相册</h1>
        <p>{site.tagline}</p>
      </div>
      <div class="album-grid">
        {#each children.slice(albumPage * 24, (albumPage + 1) * 24) as album}<a class="album-card" href={link(album)}
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
      {@render albumPagination()}
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
              {#each children.slice(albumPage * 24, (albumPage + 1) * 24) as album}<a
                  class="album-card"
                  href={link(album)}
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
            </div>
            {@render albumPagination()}{/if}
          <h2 class="section-title">照片 <span>{active.photos.length}</span></h2>
          <div class="photos-grid">
            {#each items.slice(page * 48, (page + 1) * 48) as p}<button
                id={`photo-${p.id}`}
                class="photo"
                class:stack={!!p.group}
                onclick={() => show(p)}
                ><img
                  src={p.thumbnail}
                  alt={p.alt || p.title || '查看照片'}
                  loading="lazy"
                  width="600"
                  height="450"
                />{#if p.group}<span class="stack-label"
                    >▱ {active.photos.filter((x) => x.group?.id === p.group?.id).length} 张 · {p.group.title ||
                      '照片组'}</span
                  >{:else if p.title}<span>{p.title}</span>{/if}</button
              >{/each}
          </div>
          {#if !active.photos.length}<p class="empty">
              本册暂无直接照片{children.length ? '，可以继续浏览子相册。' : '。'}
            </p>{/if}{#if items.length > 48}<div class="pagination">
              <button disabled={page === 0} onclick={() => page--}>上一页</button><span
                >{page + 1} / {Math.ceil(items.length / 48)}</span
              ><button disabled={(page + 1) * 48 >= items.length} onclick={() => page++}>下一页</button>
            </div>{/if}
        </div>
        <aside class="album-story" aria-label="相册介绍">
          <div class="desktop-story">
            <h2 class="story-heading">相册介绍</h2>
            {@render story()}
          </div>
          <details class="mobile-story"><summary>相册介绍 · 展开阅读</summary>{@render story()}</details>
        </aside>
      </div>{/if}
  </main>
  <footer>© {new Date().getFullYear()} {site.name}</footer>
</div>
<dialog
  bind:this={viewer}
  class:immersive
  aria-label="照片大图"
  onclose={closePhoto}
  oncancel={(e) => {
    if (immersive) {
      e.preventDefault();
      void setImmersive(false);
    }
  }}
>
  {#if photo}<div class="viewer-toolbar">
      <span
        >{feed ? '相片' : '相册项目'}
        {itemIndex(photo) + 1} / {items.length}{variants.length
          ? ` · 组内 ${variants.findIndex((p) => p.id === photo!.id) + 1} / ${variants.length}`
          : ''}</span
      >
      <div>
        {#if variants.length}<button onclick={() => (showVariants = !showVariants)}
            >{showVariants ? '收起组内视角' : '展开组内视角'}</button
          >{/if}
        {#if !preview}<a class="photo-permalink" href={photoLink(photo)}>照片直链</a>{/if}
        <button
          bind:this={immersiveButton}
          title="隐藏全部界面，点击照片或按 Esc 返回"
          onclick={() => setImmersive(true)}>沉浸查看</button
        ><button onclick={() => (info = !info)}>{info ? '隐藏信息' : '显示信息'}</button><button
          class="viewer-close"
          aria-label="关闭大图"
          onclick={() => viewer.close()}>×</button
        >
      </div>
    </div>
    <div class="viewer-body" class:with-variants={variants.length > 0 && showVariants} class:without-info={!info}>
      {#if variants.length && showVariants}<div class="group-variants" aria-label="组内视角">
          <span title="使用上下方向键切换">组内视角</span>{#each variants as p, index}<button
              class:chosen={p.id === photo.id}
              aria-label={`查看组内第 ${index + 1} 张`}
              aria-pressed={p.id === photo.id}
              onclick={() => choose(p)}><img src={p.thumbnail} alt={p.alt || p.title || `视角 ${index + 1}`} /></button
            >{/each}
        </div>{/if}
      <div
        role="group"
        aria-label="照片画面"
        class="full-image"
        class:has-variants={variants.length > 0}
        onpointerdown={(e) => {
          touchX = e.clientX;
          touchY = e.clientY;
          swiped = false;
        }}
        onpointerup={(e) => {
          if (e.pointerType !== 'touch') return;
          const dx = e.clientX - touchX,
            dy = e.clientY - touchY;
          if (Math.abs(dx) > 60 && Math.abs(dy) < 60) {
            swiped = true;
            shift(dx < 0 ? 1 : -1);
          } else if (immersive && variants.length > 1 && Math.abs(dy) > 60 && Math.abs(dx) < 60) {
            swiped = true;
            angle(dy < 0 ? 1 : -1);
          }
        }}
      >
        <img src={photo.src} alt={photo.alt || photo.title || '照片'} />
        {#if immersive}<button
            class="immersive-exit"
            aria-label="退出沉浸模式"
            title="点击返回，Esc 退出"
            onclick={() => {
              if (!swiped) void setImmersive(false);
            }}
          ></button>{/if}
      </div>
      {#if info}<aside class="photo-information">
          <section class="work-description">
            <h2>{photoTitle(photo)}</h2>
            {#if photo.group}<Markdown text={photo.group.description} />{:else if photo.description}<Markdown
                text={photo.description}
              />{/if}
          </section>
          <section class="capture-facts">
            <p><span>{captureTime(photo).label}</span><strong>{captureTime(photo).value}</strong></p>
            {#if feed?.sort === 'added' && photo.addedAt}<p>
                <span>加入 Gallery</span><strong
                  >{date(photo.addedAt)}{photo.addedEstimated ? '（历史估算）' : ''}</strong
                >
              </p>{/if}
            {#if photo.latitude !== null && photo.longitude !== null}<details>
                <summary>拍摄位置</summary>
                <p class="coordinates">{photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}</p>
              </details>{/if}
          </section>
          {#if photo.exif && Object.values(photo.exif).some((v) => v !== null && v !== '')}<details
              class="camera-details"
            >
              <summary>拍摄参数</summary>
              <dl>
                {#each Object.entries(photo.exif).filter(([key, value]) => ['make', 'model', 'lensModel', 'fNumber', 'focalLength', 'iso', 'exposureTime'].includes(key) && value !== null && value !== '') as [key, value]}<div
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
                      )[key]}
                    </dt>
                    <dd>
                      {key === 'fNumber'
                        ? `f/${value}`
                        : key === 'focalLength'
                          ? `${value} mm`
                          : key === 'exposureTime'
                            ? `${value} s`
                            : value}
                    </dd>
                  </div>{/each}
              </dl>
            </details>{/if}
          {#if photo.occurrences?.length}<section class="photo-context">
              <h3>所在相册</h3>
              {#each photo.occurrences as occurrence}<a
                  href={`/albums/${occurrence.albumSlug}/photos/${occurrence.photoId}`}>{occurrence.albumTitle} →</a
                >{/each}{#if photo.group}<a href={photoLink(photo)}>查看整组 →</a>{/if}
            </section>{/if}
        </aside>{/if}
    </div>
    <nav class="album-navigation" aria-label={feed ? '当前相片列表' : '同相册项目'}>
      <div class="strip-heading">
        <button aria-label="上一项" title="上一项（←）" onclick={() => shift(-1)}>←</button><span
          >{feed ? '当前相片列表' : '同相册作品'}</span
        ><button aria-label="下一项" title="下一项（→）" onclick={() => shift(1)}>→</button>
      </div>
      <div class="album-strip">
        {#each items as p, index (p.id)}<button
            class:chosen={itemIndex(photo) === index}
            aria-current={itemIndex(photo) === index ? 'true' : undefined}
            aria-label={`查看第 ${index + 1} 项：${photoTitle(p)}`}
            onclick={() => choose(p)}
            ><img loading="lazy" src={p.thumbnail} alt="" /><span>{index + 1}{p.group && !feed ? ' · 组' : ''}</span
            ></button
          >{/each}
      </div>
    </nav>
  {/if}
</dialog>

<style>
  .feed-heading {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: start;
    flex-wrap: wrap;
  }
  select {
    display: block;
    padding: 10px;
    margin-top: 8px;
    border: 1px solid #dce2d6;
    background: white;
    color: inherit;
    max-width: 100%;
  }
  .timeline-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px;
    gap: 40px;
  }
  .timeline-photos {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 22px 16px;
    align-content: start;
  }
  .month-heading,
  .feed-pagination {
    grid-column: 1/-1;
  }
  .month-heading {
    font-size: 19px;
    margin: 18px 0 0;
    font-weight: 500;
  }
  .timeline {
    position: sticky;
    top: 20px;
    align-self: start;
    max-height: 80dvh;
    overflow: auto;
  }
  .timeline nav {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 15px;
  }
  .timeline a {
    display: flex;
    justify-content: space-between;
  }
  .timeline small {
    color: #8c9881;
  }
  .stack img {
    box-shadow:
      4px 4px 0 #e0e7d9,
      8px 8px 0 #edf1e8;
  }
  .stack-label {
    margin-top: 8px;
  }
  .work-description {
    padding-bottom: 24px;
  }
  .capture-facts {
    border-top: 1px solid #384433;
    padding: 22px 0;
  }
  .capture-facts p {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 0 0 15px;
    font-size: 13px;
    line-height: 1.7;
  }
  .capture-facts span {
    color: #8c9c85;
    font-size: 11px;
  }
  .capture-facts strong {
    font-weight: 400;
  }
  .camera-details {
    border-block: 1px solid #384433;
    padding: 18px 0;
  }
  .camera-details summary,
  .capture-facts summary {
    cursor: pointer;
    font-size: 13px;
  }
  .photo-context {
    margin-top: 25px;
  }
  .photo-context a {
    display: block;
    padding: 8px 0;
    font-size: 13px;
    color: #becbb4;
  }
  .group-variants {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 12px 20px;
    overflow: auto;
    border-top: 1px solid #384433;
  }
  .group-variants span {
    font-size: 11px;
    color: #a1b195;
    white-space: nowrap;
  }
  .group-variants button {
    padding: 2px;
    background: none;
    border: 1px solid transparent;
    flex-shrink: 0;
  }
  .group-variants button.chosen {
    border-color: #a1ba90;
  }
  .group-variants img {
    display: block;
    width: 64px;
    height: 48px;
    object-fit: contain;
  }
  @media (max-width: 760px) {
    .timeline-layout {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .timeline {
      position: static;
      order: -1;
      max-height: none;
    }
    .timeline nav {
      display: none;
    }
    .timeline-photos {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .group-variants span {
      display: block;
    }
    .viewer-toolbar {
      flex-wrap: wrap;
    }
    .viewer-toolbar > div {
      display: flex;
      align-items: center;
    }
    .viewer-body {
      min-height: 0;
    }
    nav {
      gap: 16px !important;
    }
  }

  :global(body) {
    margin: 0;
    background: #fafbf9;
    color: #2f3731;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  }
  .photo-permalink {
    color: inherit;
    margin-right: 1rem;
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
  aside p {
    font-size: 15px;
    line-height: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0 0 26px;
  }
  aside h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 30px 0 16px;
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
  .viewer-toolbar .viewer-close {
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
    .photo-permalink {
      color: inherit;
      margin-right: 1rem;
    }
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
    .full-image > img,
    .full-image.has-variants > img {
      height: auto;
      max-height: 60dvh;
    }
    .viewer-body.without-info .full-image > img {
      max-height: none;
      height: calc(100dvh - 110px);
    }
    .viewer-body.without-info .full-image.has-variants > img {
      height: calc(100dvh - 195px);
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
  .viewer-body {
    min-height: 0;
    height: auto;
    overflow: hidden;
  }
  .viewer-body.with-variants {
    grid-template-columns: 92px minmax(0, 1fr) 300px;
  }
  .viewer-body.with-variants.without-info {
    grid-template-columns: 92px minmax(0, 1fr);
  }
  .viewer-body .full-image {
    height: 100%;
    min-height: 0;
  }
  .viewer-body .full-image > img,
  .viewer-body .full-image.has-variants > img {
    height: 100%;
    max-height: none;
  }
  .viewer-body aside {
    max-height: none;
    min-height: 0;
    box-sizing: border-box;
  }
  .group-variants {
    flex-direction: column;
    padding: 10px 8px;
    border-top: 0;
    border-right: 1px solid #384433;
    min-height: 0;
    gap: 8px;
  }
  .group-variants span {
    text-align: center;
    line-height: 1.5;
  }
  .group-variants button {
    color: #dae5d3;
  }
  .album-navigation {
    display: block;
    padding: 8px 16px 12px;
    border-top: 1px solid #384433;
    background: #171d18;
  }
  .strip-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #adbea1;
  }
  .strip-heading button {
    min-width: 40px;
    min-height: 36px;
    font-size: 19px;
    background: none;
    color: #d9e3d1;
    border: 0;
    padding: 5px;
  }
  .album-strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 5px 0;
  }
  .album-strip button {
    position: relative;
    padding: 2px;
    border: 1px solid transparent;
    background: #263021;
    color: #e1eadc;
    flex: 0 0 76px;
  }
  .album-strip button.chosen {
    border-color: #c0d2af;
    background: #435239;
  }
  .album-strip img {
    width: 70px;
    height: 48px;
    object-fit: contain;
    display: block;
  }
  .album-strip span {
    display: block;
    font-size: 10px;
  }
  @media (max-width: 760px) {
    .viewer-body,
    .viewer-body.with-variants,
    .viewer-body.without-info {
      height: auto;
      grid-template-columns: minmax(0, 1fr);
    }
    .viewer-body.with-variants,
    .viewer-body.with-variants.without-info {
      grid-template-columns: 64px minmax(0, 1fr);
    }
    .viewer-body .full-image {
      height: 54dvh;
    }
    .viewer-body.without-info .full-image > img {
      height: 100%;
    }
    .viewer-body .photo-information {
      grid-column: 1 / -1;
    }
    .group-variants {
      max-height: 54dvh;
      padding: 6px 3px;
    }
    .group-variants img {
      width: 48px;
      height: 40px;
    }
    .group-variants span {
      font-size: 10px;
    }
    .viewer-toolbar > div {
      flex-wrap: wrap;
    }
    .album-navigation {
      position: sticky;
      bottom: 0;
      padding: 5px 8px;
      z-index: 2;
    }
    .strip-heading {
      font-size: 10px;
    }
  }
  @media (max-width: 760px) {
    .viewer-toolbar {
      position: relative;
      padding: 12px 42px 8px 12px;
      gap: 6px;
    }
    .viewer-toolbar > span {
      flex-basis: 100%;
    }
    .viewer-toolbar button {
      font-size: 12px;
      padding: 6px 7px;
    }
    .viewer-toolbar .viewer-close {
      position: absolute;
      right: 5px;
      top: 4px;
      font-size: 25px;
    }
  }

  /* Separate the reading surface from the image canvas. */
  .detail {
    gap: 32px;
    grid-template-columns: minmax(0, 1fr) 340px;
    align-items: start;
  }
  .album-story {
    background: #f0f3ed;
    border: 1px solid #dce3d7;
    border-radius: 8px;
    padding: 26px;
    min-width: 0;
  }
  .story-heading {
    margin: 0 0 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #d6dfd1;
    color: #6c7c64;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 1px;
  }
  dialog[open] {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: calc(100dvh - 32px);
    overflow: hidden;
  }
  .viewer-toolbar {
    background: #1c231e;
    border-bottom: 1px solid #343e35;
  }
  .viewer-toolbar > div {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .photo-permalink {
    color: #b9c4b2;
    padding: 8px 12px;
    text-decoration: none;
  }
  .full-image {
    background: #0f1411;
    touch-action: pan-y;
  }
  .viewer-body .photo-information {
    background: #232c25;
    border-left: 1px solid #3c483e;
    padding: 30px 26px;
  }
  .work-description {
    padding-bottom: 28px;
  }
  .album-navigation {
    background: #1c231e;
  }
  .group-variants {
    background: #1c231e;
  }
  @media (max-width: 1100px) and (min-width: 761px) {
    .detail {
      grid-template-columns: minmax(0, 1fr) 290px;
      gap: 24px;
    }
    .album-story {
      padding: 22px;
    }
  }
  @media (max-width: 760px) {
    .detail {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }
    .detail .album-story {
      padding: 20px;
      border: 1px solid #dce3d7;
    }
    .mobile-story summary {
      padding-bottom: 0;
    }
    .mobile-story[open] summary {
      padding-bottom: 20px;
      margin-bottom: 18px;
      border-bottom: 1px solid #d6dfd1;
    }
    dialog[open] {
      display: block;
      height: auto;
      overflow: auto;
    }
    .viewer-body {
      overflow: visible;
    }
    .viewer-body .photo-information {
      border-left: 0;
      border-top: 1px solid #3c483e;
      padding: 24px;
    }
    .photo-permalink {
      margin-right: 0;
      padding: 6px 7px;
    }
  }
  :global(html:has(dialog[aria-label='照片大图'][open])) {
    overflow: hidden;
  }
  /* One complete image, no crop, controls, description or thumbnails. */
  dialog.immersive[open] {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    inset: 0;
    margin: 0;
    width: 100%;
    max-width: none;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    background: #0b0f0c;
    overflow: hidden;
  }
  dialog.immersive .viewer-toolbar,
  dialog.immersive .group-variants,
  dialog.immersive .photo-information,
  dialog.immersive .album-navigation {
    display: none;
  }
  dialog.immersive .viewer-body {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  dialog.immersive .full-image {
    height: 100%;
    touch-action: none;
    background: #0b0f0c;
  }
  dialog.immersive .full-image > img {
    width: 100%;
    height: 100%;
    max-height: none;
    object-fit: contain;
  }
  .immersive-exit {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: default;
  }
  .immersive-exit:focus-visible {
    outline-offset: -4px;
  }
</style>
