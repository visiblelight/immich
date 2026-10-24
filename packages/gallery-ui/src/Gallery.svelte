<script lang="ts">
  import { tick, untrack, onMount, onDestroy, type Snippet } from 'svelte';
  import { enterViewerFullscreen, exitViewerFullscreen } from './viewer-fullscreen';
  import { captureTime } from '../../gallery-core/src/capture-time';
  import Markdown from './Markdown.svelte';
  import LoadMore from './LoadMore.svelte';
  import type { BrowseStream } from './browse-stream';
  import AlbumCover from './AlbumCover.svelte';
  import SearchField from './SearchField.svelte';
  import SegmentedControl from './SegmentedControl.svelte';

  function previewPlaceholder(image: HTMLImageElement) {
    const ready = () => {
      delete image.dataset.loading;
    };
    if (image.complete && image.naturalWidth) ready();
    image.addEventListener('load', ready);
    image.addEventListener('error', ready);
    return {
      destroy() {
        image.removeEventListener('load', ready);
        image.removeEventListener('error', ready);
      },
    };
  }
  import PublicFrame from './PublicFrame.svelte';
  import Icon from './Icon.svelte';
  import PhotoRefinements from './PhotoRefinements.svelte';
  import { appendPhotoFilters, type PhotoFilters } from '../../gallery-core/src/photo-filters';
  let filtersOpen = $state(false);
  import { documentMarkdown } from '../../gallery-core/src/markdown';
  import type { DisplayAlbum, DisplayPhoto } from '../../gallery-core/src/content';
  let {
    site,
    stream,
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
    relatedArticles = [],
    albumSearch,
    searchAlbums,
    accountControl,
    albumActions,
    albumComments,
    albumHasComments,
    commentsEnabled = false,
    photoLike,
    photoCommentCount,
    photoInformation,
    photoCommunity,
    likeCount,
    albumHref,
  }: {
    site: {
      name: string;
      tagline: string;
      copyrightName?: string;
      footerText?: string;
      contactLinks?: import('../../gallery-core/src/content').ContactLink[];
    };
    albums: DisplayAlbum[];
    stream?: BrowseStream;
    albumSearch?: { query: string; matchedIds: string[] };
    searchAlbums?: (query: string) => void;
    accountControl?: Snippet;
    albumActions?: Snippet<[DisplayAlbum]>;
    albumComments?: Snippet<[DisplayAlbum, boolean, () => void]>;
    albumHasComments?: (album: DisplayAlbum) => boolean;
    commentsEnabled?: boolean;
    photoLike?: Snippet<[DisplayPhoto]>;
    photoCommentCount?: (photo: DisplayPhoto) => number;
    photoInformation?: Snippet<[DisplayPhoto]>;
    photoCommunity?: Snippet<[DisplayPhoto]>;
    likeCount?: (kind: 'album' | 'photo', id: string) => number | null;
    albumHref?: (album: DisplayAlbum) => string;
    active?: DisplayAlbum | null;
    preview?: boolean;
    about?: boolean;
    initialPhotoId?: string | null;
    initialPage?: number;
    navigatePhoto?: (photo: DisplayPhoto | null, replace?: boolean) => void;
    navigateBoundary?: (offset: number) => void;
    immersive?: boolean;
    relatedArticles?: { title: string; slug: string }[];
    feed?: {
      filters?: PhotoFilters;
      availablePlaces?: {
        id: string;
        name: string;
        count: number;
        path: string;
        kind: string;
        parent: string;
      }[];
      availableCameras?: { id: string; name: string; count: number }[];
      availableLenses?: { id: string; name: string; count: number }[];
      focalBounds?: { min: number; max: number } | null;
      unavailableTags?: string[];
      tags?: string[];
      availableTags?: { id: string; name: string; count: number }[];
      months: { month: string; count: number }[];
      sort: string;
      month: string;
      page: number;
      total: number;
    };
  } = $props();
  let searchText = $state(untrack(() => albumSearch?.query ?? ''));
  let lastSearch = untrack(() => albumSearch?.query ?? '');
  let composingSearch = false;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const query = albumSearch?.query ?? '';
    untrack(() => {
      if (query !== lastSearch) {
        clearTimeout(searchTimer);
        searchText = query;
        lastSearch = query;
      }
    });
  });
  onDestroy(() => clearTimeout(searchTimer));
  function applySearch() {
    clearTimeout(searchTimer);
    lastSearch = searchText.trim();
    searchAlbums?.(lastSearch);
  }
  function scheduleSearch() {
    clearTimeout(searchTimer);
    if (searchAlbums && !composingSearch) searchTimer = setTimeout(applySearch, 350);
  }
  let photo = $state<DisplayPhoto | null>(null);
  let viewer: HTMLDialogElement;
  let showVariants = $state(true);
  const listTitle = (p: DisplayPhoto) => (p.group ? p.group.title : p.title)?.trim() || '';
  const photoTitle = (p: DisplayPhoto) =>
    p.group ? p.group.title || '未命名照片组' : p.title || '未命名照片';
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
    if (value) void enterViewerFullscreen();
    else void exitViewerFullscreen();
    await tick();
    if (value) viewer?.querySelector<HTMLButtonElement>('.immersive-exit')?.focus({ preventScroll: true });
    else immersiveButton?.focus({ preventScroll: true });
  }
  let copyStatus = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyPhotoLink() {
    if (!photo || preview) return;
    const url = new URL(photoLink(photo), location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      copyStatus = '链接已复制';
    } catch {
      copyStatus = '复制失败，请复制浏览器地址';
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copyStatus = ''), 2400);
  }
  onMount(() => {
    const changed = () => {
      if (!document.fullscreenElement && immersive) void setImmersive(false);
    };
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      clearTimeout(copyTimer);
    };
  });
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
      .map((p) =>
        p.group ? (photos.find((x) => x.id === p.group!.cover && x.group?.id === p.group!.id) ?? p) : p,
      );
  });
  let variants = $derived(
    photo?.group && !feed ? (active?.photos ?? []).filter((p) => p.group?.id === photo?.group?.id) : [],
  );
  const itemIndex = (p: DisplayPhoto) =>
    items.findIndex((x) => x.id === p.id || (!feed && p.group && x.group?.id === p.group.id));
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(value))
      : '日期未知';
  let tagSearch = $state('');
  const feedLink = (
    page: number,
    month = feed?.month ?? '',
    sort = feed?.sort ?? 'taken',
    tags = feed?.tags ?? [],
  ) => {
    const q = new URLSearchParams({ sort, month, page: String(page) });
    for (const tag of tags) q.append('tag', tag);
    appendPhotoFilters(q, feed?.filters);
    return `/photos?${q}`;
  };
  const toggleTag = (id: string) =>
    feedLink(
      1,
      feed?.month,
      feed?.sort,
      (feed?.tags ?? []).includes(id)
        ? (feed?.tags ?? []).filter((t) => t !== id)
        : [...(feed?.tags ?? []), id],
    );

  let info = $state(true);
  let photoTab = $state('information');
  const hasPhotoStory = $derived(
    !!photo &&
      !!(
        (photo.group
          ? photo.group.title?.trim() || photo.group.description?.trim()
          : photo.title?.trim() || photo.description?.trim()) || photo.tags?.length
      ),
  );
  const hasPhotoDiscussion = $derived(!!photoCommunity || hasPhotoStory);
  let compactLayout = $state(false),
    albumDiscussionOpen = $state(false);
  let albumDiscussion = $state<HTMLDialogElement>();
  const hasStory = $derived(!!active && !!documentMarkdown(active, active.summary).trim());
  const hasDiscussion = $derived(!!active && !!albumComments && !!albumHasComments?.(active));
  const showStory = $derived(hasStory || hasDiscussion || (!!albumComments && albumDiscussionOpen));
  onMount(() => {
    const media = matchMedia('(max-width: 760px)');
    const update = () => {
      compactLayout = media.matches;
      if (!media.matches) albumDiscussion?.close();
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  $effect(() => {
    active?.id;
    untrack(() => {
      albumDiscussionOpen = false;
      albumDiscussion?.close();
    });
  });
  async function openDiscussion() {
    albumDiscussionOpen = true;
    await tick();
    if (compactLayout && albumDiscussion && !albumDiscussion.open) albumDiscussion.showModal();
  }
  function collapseDiscussion() {
    albumDiscussionOpen = false;
    if (!hasStory && !hasDiscussion) albumDiscussion?.close();
  }

  let page = $state(
    untrack(() => Math.max(0, Math.min(Math.ceil((items.length || 1) / 48) - 1, initialPage - 1))),
  );
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
  $effect(() => {
    albumSearch?.query;
    albumPage = 0;
  });
  const link = (a: DisplayAlbum) =>
    albumHref ? albumHref(a) : preview ? `/preview/${a.id}` : `/albums/${a.slug}`;
  let albumSort = $state<'updated' | 'taken'>('updated');
  $effect(() => {
    if (stream) albumSort = stream.sort === 'taken' ? 'taken' : 'updated';
  });
  let children = $derived(
    albums
      .filter((a) =>
        !active && albumSearch?.query
          ? albumSearch.matchedIds.includes(a.id)
          : a.parent === (active?.id ?? ''),
      )
      .sort((a, b) => {
        const key = albumSort === 'taken' ? 'takenAt' : 'updatedAt';
        return (
          (b[key] ?? '').localeCompare(a[key] ?? '') ||
          (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') ||
          a.id.localeCompare(b.id)
        );
      }),
  );
  function albumSubtitle(album: DisplayAlbum) {
    const childCount = album.childCount ?? albums.filter((a) => a.parent === album.id).length;
    return `共${album.totalCount ?? album.count}张照片${childCount ? `，含 ${childCount} 个子相册` : ''}`;
  }
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
    void exitViewerFullscreen();
    immersive = false;
    photo = null;
    if (stream) stream.photoChange(null);
    else if (initialPhotoId && navigatePhoto) navigatePhoto(null, true);
  }
  async function show(p: DisplayPhoto) {
    if (stream) {
      photo = p;
      stream.photoChange(p);
      await tick();
      if (!viewer.open) viewer.showModal();
      return;
    }
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
    if (stream) {
      photo = next;
      stream.photoChange(next);
    } else if (!preview && navigatePhoto) navigatePhoto(next, true);
    else photo = next;
  }
  async function shift(offset: number) {
    if (!photo) return;
    const index = itemIndex(photo),
      next = index + offset;
    if (stream && (next < 0 || next >= items.length)) {
      const current = photo;
      if ((next < 0 && stream.previous.photos) || (next >= items.length && stream.photos?.hasMore)) {
        if (await stream.load('photos', next < 0)) {
          await tick();
          const index = itemIndex(current);
          choose(items[index + offset] ?? null);
        }
      }
      return;
    }
    if (feed && !stream && (next < 0 || next >= items.length)) {
      navigateBoundary?.(offset);
      return;
    }
    choose(items[(next + items.length) % items.length] ?? null);
  }
  $effect(() => {
    if (
      stream &&
      photo &&
      itemIndex(photo) >= items.length - 5 &&
      stream.photos?.hasMore &&
      !stream.loading.photos &&
      !stream.errors.photos
    ) {
      untrack(() => void stream?.load('photos'));
    }
  });
  $effect(() => {
    if (!stream) return;
    const selected = initialPhotoId ? active?.photos.find((p) => p.id === initialPhotoId) : null;
    untrack(() => {
      if (selected && photo?.id !== selected.id) {
        photo = selected;
        void tick().then(() => {
          if (viewer?.isConnected && !viewer.open) viewer.showModal();
        });
      } else if (!initialPhotoId && photo) {
        photo = null;
        viewer?.close();
      }
    });
  });
  function angle(offset: number) {
    if (!photo || variants.length < 2) return;
    const i = variants.findIndex((p) => p.id === photo!.id);
    choose(variants[(i + offset + variants.length) % variants.length]!);
  }
  function keys(e: KeyboardEvent) {
    if (
      !viewer?.open ||
      (e.target instanceof Element && !viewer.contains(e.target)) ||
      (e.target instanceof HTMLElement && e.target.closest('input,textarea,[contenteditable=true]'))
    )
      return;
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      void setImmersive(!immersive);
      return;
    }
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    if (e.key === 'ArrowRight') shift(1);
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowDown') angle(1);
    if (e.key === 'ArrowUp') angle(-1);
  }
</script>

<svelte:window onkeydown={keys} />
{#snippet story()}<Markdown text={active ? documentMarkdown(active, active.summary) : ''} />{/snippet}
{#snippet discussion()}
  {#if active}
    {#if hasStory}<div class="album-description">
        <h2 class="story-heading">相册介绍</h2>
        {@render story()}
      </div>{/if}
    {#if albumComments}{@render albumComments(
        active,
        albumDiscussionOpen && !hasStory && !hasDiscussion,
        collapseDiscussion,
      )}{/if}
  {/if}
{/snippet}
{#if preview}<div class="preview-notice">
    草稿预览 · 仅管理员可见 · 当前显示已保存内容 <a href="/albums">返回工作台 →</a>
  </div>{/if}
{#snippet albumPagination()}
  {#if stream?.albums}<LoadMore
      more={stream.albums.hasMore}
      loading={stream.loading.albums}
      error={stream.errors.albums}
      label="相册"
      load={() => stream!.load('albums')}
      previous={stream.previous.albums}
      loadPrevious={() => stream!.load('albums', true)}
    />
  {:else if children.length > 24}<div class="pagination">
      <button disabled={albumPage === 0} onclick={() => albumPage--}>上一页</button><span
        >{albumPage + 1} / {Math.ceil(children.length / 24)}</span
      ><button disabled={(albumPage + 1) * 24 >= children.length} onclick={() => albumPage++}>下一页</button>
    </div>{/if}
{/snippet}
<PublicFrame {site} active={about ? 'about' : feed ? 'photos' : 'albums'} {preview} {accountControl}>
  <main>
    {#if about}<article class="about">
        <h1>在路上，也在日常里</h1>
        <p>
          {site.tagline || '这里收藏旅行中的风景，也记录日常里不经意的光。'}
        </p>
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
        <h1>相片 <small>{feed.total} 张</small></h1>
        <button
          class="filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="photo-filters"
          onclick={() => (filtersOpen = !filtersOpen)}
          >筛选{feed.tags?.length ? ` · ${feed.tags.length} 个标签` : ''}{feed.month
            ? ' · ' + feed.month
            : ''}</button
        >
      </div>
      <div class="timeline-layout">
        <aside id="photo-filters" class="photo-filters" class:expanded={filtersOpen} aria-label="照片筛选">
          <section class="sort-options">
            <h2>排序</h2>
            <SegmentedControl
              label="相片排序"
              value={feed.sort}
              options={[
                {
                  value: 'taken',
                  label: '拍摄时间',
                  href: feedLink(1, '', 'taken'),
                },
                {
                  value: 'added',
                  label: '最近加入',
                  href: feedLink(1, '', 'added'),
                },
              ]}
            />
          </section>
          {#if feed.filters}<PhotoRefinements
              filters={feed.filters}
              places={feed.availablePlaces ?? []}
              cameras={feed.availableCameras ?? []}
              lenses={feed.availableLenses ?? []}
              bounds={feed.focalBounds ?? null}
              sort={feed.sort}
              month={feed.month}
              tags={feed.tags ?? []}
            />{/if}
          <section class="timeline">
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
                  href={feedLink(1, m.month)}
                  >{m.month === 'unknown' ? '日期未知' : m.month}<small>{m.count}</small></a
                >{/each}
            </nav>
          </section>
          <div class="photo-tag-filter">
            <section class="tag-section">
              <h2>标签</h2>
              <input aria-label="搜索照片标签" placeholder="搜索标签" bind:value={tagSearch} />
              <div class="tag-options">
                {#each (feed.availableTags ?? [])
                  .filter((t) => t.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()))
                  .slice(0, 50) as tag}<a
                    class:selected={feed.tags?.includes(tag.id)}
                    href={toggleTag(tag.id)}>{tag.name}<small>{tag.count}</small></a
                  >{/each}
              </div>
              {#if !feed.availableTags?.length}<p>暂无公开标签。</p>{/if}
              <p>选择多个标签时，显示同时包含这些标签的照片。</p>
            </section>
            {#if feed.tags?.length}<div class="selected-tags">
                {#each feed.tags as id}<a
                    href={toggleTag(id)}
                    aria-label={`移除筛选 ${feed.availableTags?.find((t) => t.id === id)?.name ?? '已失效标签'}`}
                    >{feed.availableTags?.find((t) => t.id === id)?.name ?? '已失效标签'} ×</a
                  >{/each}<a class="clear-tags" href={feedLink(1, feed.month, feed.sort, [])}>清空标签</a>
              </div>{/if}
          </div>
        </aside>
        <div class="timeline-photos">
          {#if feed.unavailableTags?.length}<p role="status">
              所选标签已停用或不再公开。<a
                href={feedLink(
                  1,
                  feed.month,
                  feed.sort,
                  (feed.tags ?? []).filter((t) => !feed.unavailableTags?.includes(t)),
                )}>清除失效标签</a
              >
            </p>{/if}
          {#if !items.length}<p>
              没有符合当前筛选条件的照片。<a href="/photos">清除筛选</a>
            </p>{/if}
          {#each items as p, index (p.id)}{@const month =
              (feed.sort === 'added' ? p.addedAt : p.localTakenAt)?.slice(0, 7) || 'unknown'}
            {#if index === 0 || month !== ((feed.sort === 'added' ? items[index - 1]?.addedAt : items[index - 1]?.localTakenAt)?.slice(0, 7) || 'unknown')}<h2
                class="month-heading"
              >
                {month === 'unknown' ? '日期未知' : month.replace('-', ' 年 ') + ' 月'}
              </h2>{/if}
            <button
              class="photo"
              id={`photo-${p.id}`}
              aria-label={`查看${p.group?.title || p.title || `第 ${index + 1} 张照片`}`}
              onclick={() => show(p)}
              ><img
                data-loading
                use:previewPlaceholder
                src={p.thumbnail}
                alt={p.alt || p.title || p.group?.title || '查看照片'}
                width="600"
                height="450"
                loading="lazy"
              />{#if listTitle(p)}<span>{listTitle(p)}</span>{/if}{@render cardLikes('photo', p.id)}</button
            >
          {/each}
          {#if !items.length}<p class="empty">这里还没有公开照片。</p>{/if}
          {#if stream?.photos}<LoadMore
              more={stream.photos.hasMore}
              loading={stream.loading.photos}
              error={stream.errors.photos}
              label="照片"
              load={() => stream!.load('photos')}
              previous={stream.previous.photos}
              loadPrevious={() => stream!.load('photos', true)}
            />{:else}<div class="pagination feed-pagination">
              {#if feed.page > 1}<a href={feedLink(feed.page - 1)}>上一页</a>{/if}<span
                >{feed.page} / {Math.max(1, Math.ceil(feed.total / 48))}</span
              >{#if feed.page * 48 < feed.total}<a href={feedLink(feed.page + 1)}>下一页</a>{/if}
            </div>{/if}
        </div>
      </div>
    {:else if !active}<div class="heading album-heading">
        <h1>
          相册 <small>{stream?.albums?.total ?? children.length} 本</small>
        </h1>
        <div class="album-tools">
          {#if albumSearch}<form
              class="album-search"
              action="/albums"
              method="GET"
              role="search"
              onsubmit={(e) => {
                if (searchAlbums) {
                  e.preventDefault();
                  applySearch();
                }
              }}
            >
              <SearchField
                name="q"
                label="搜索相册"
                placeholder="搜索相册、照片或地点"
                clearLabel="清除相册搜索"
                bind:value={searchText}
                maxlength={120}
                oninput={scheduleSearch}
                onclear={applySearch}
                oncompositionstart={() => {
                  composingSearch = true;
                  clearTimeout(searchTimer);
                }}
                oncompositionend={() => {
                  composingSearch = false;
                  scheduleSearch();
                }}
              />
            </form>{/if}
          {@render albumSorting()}
        </div>
      </div>
      <div class="album-grid">
        {#each stream ? children : children.slice(albumPage * 24, (albumPage + 1) * 24) as album (album.id)}<a
            class="album-card"
            id={`album-${album.id}`}
            href={link(album)}
            >{#if album.cover}<div class="album-cover">
                {#key album.cover}<AlbumCover src={album.cover} alt={album.title} />{/key}
              </div>{:else}<div class="empty-cover">
                {album.title.slice(0, 1)}
              </div>{/if}
            <h2>{album.title}</h2>
            <p class="album-meta">
              <span>{albumSubtitle(album)}</span>
              {@render cardLikes('album', album.id)}
            </p>
          </a>{/each}
      </div>
      {@render albumPagination()}
      {#if !children.length}<div class="empty">
          <h2>
            {albumSearch?.query ? '没有找到匹配的相册' : '相册正在整理中'}
          </h2>
          <p>
            {albumSearch?.query ? '试试其它相册名、照片描述或地点。' : '发布后的作品会在这里出现。'}
          </p>
        </div>{/if}
    {:else}<div class="breadcrumbs">
        <a href="/albums">相册</a>{#each crumbs as parent}<span>/</span><a href={link(parent)}
            >{parent.title}</a
          >{/each}
      </div>
      <div class="album-title-row">
        <h1>{active.title}</h1>
        {#if albumActions}{@render albumActions(active)}{/if}
      </div>
      <div class="detail" class:no-story={!showStory || compactLayout}>
        <div class="images">
          {#if children.length}<h2 class="section-title">
              子相册 <span>{stream?.albums?.total ?? children.length}</span>
              {@render albumSorting()}
            </h2>
            <div class="children-grid" class:compact-children={active.photos.length > 0}>
              {#each stream ? children : children.slice(albumPage * 24, (albumPage + 1) * 24) as album (album.id)}<a
                  class="album-card"
                  id={`album-${album.id}`}
                  href={link(album)}
                  >{#if album.cover}<div class="album-cover">
                      {#key album.cover}<AlbumCover src={album.cover} alt={album.title} />{/key}
                    </div>{:else}<div class="empty-cover">
                      {album.title.slice(0, 1)}
                    </div>{/if}
                  <h2>{album.title}</h2>
                  <p class="album-meta">
                    <span>{albumSubtitle(album)}</span>
                    {@render cardLikes('album', album.id)}
                  </p></a
                >{/each}
            </div>
            {@render albumPagination()}{/if}
          <div class="photo-list-heading">
            <h2 class="section-title">
              照片 <span>{stream ? active.count : active.photos.length}</span>
            </h2>
            {#if compactLayout && (hasStory || hasDiscussion || commentsEnabled)}
              <button class="discussion-entry" onclick={openDiscussion}
                >{hasStory || hasDiscussion ? (albumComments ? '说明与评论' : '相册介绍') : '写评论'}
                <span aria-hidden="true">↗</span></button
              >
            {:else if !showStory && commentsEnabled}<button class="discussion-entry" onclick={openDiscussion}
                >写评论 <span aria-hidden="true">＋</span></button
              >{/if}
          </div>
          <div class="photos-grid">
            {#each stream ? items : items.slice(page * 48, (page + 1) * 48) as p, index (p.id)}<button
                aria-label={`查看${p.group?.title || p.title || `第 ${page * 48 + index + 1} 张照片`}`}
                id={`photo-${p.id}`}
                class="photo"
                class:stack={!!p.group}
                onclick={() => show(p)}
                ><span class="photo-frame"
                  ><img
                    data-loading
                    use:previewPlaceholder
                    src={p.thumbnail}
                    alt={p.alt || p.title || '查看照片'}
                    loading="lazy"
                    width="600"
                    height="450"
                  /></span
                >{#if p.group}<span class="stack-label"
                    >▱ {active.photos.filter((x) => x.group?.id === p.group?.id).length} 张 · {p.group
                      .title || '照片组'}</span
                  >{:else if p.title}<span>{p.title}</span>{/if}{@render cardLikes('photo', p.id)}</button
              >{/each}
          </div>
          {#if !active.photos.length && !children.length}<p class="empty">
              本册暂无直接照片{children.length ? '，可以继续浏览子相册。' : '。'}
            </p>{/if}{#if stream?.photos && (items.length || stream.photos.hasMore)}<LoadMore
              more={stream.photos.hasMore}
              loading={stream.loading.photos}
              error={stream.errors.photos}
              label="照片"
              load={() => stream!.load('photos')}
              previous={stream.previous.photos}
              loadPrevious={() => stream!.load('photos', true)}
            />{:else if items.length > 48}<div class="pagination">
              <button disabled={page === 0} onclick={() => page--}>上一页</button><span
                >{page + 1} / {Math.ceil(items.length / 48)}</span
              ><button disabled={(page + 1) * 48 >= items.length} onclick={() => page++}>下一页</button>
            </div>{/if}
        </div>
        {#if showStory && !compactLayout}<aside class="album-story" aria-label="相册说明与评论">
            {@render discussion()}
          </aside>{/if}
      </div>{/if}
    {#if !photo && relatedArticles.length}<aside class="related-articles" aria-label="相关文章">
        <span>相关文章</span>{#each relatedArticles as article}<a href={'/records/' + article.slug}
            >{article.title} ↗</a
          >{/each}
      </aside>{/if}
  </main>
</PublicFrame>
{#if compactLayout && active}
  <dialog
    bind:this={albumDiscussion}
    class="album-discussion"
    aria-label="相册说明与评论"
    onclose={() => (albumDiscussionOpen = false)}
  >
    <header>
      <span>{active.title}</span><button aria-label="关闭相册评论" onclick={() => albumDiscussion?.close()}
        >×</button
      >
    </header>
    <div class="discussion-body">{@render discussion()}</div>
  </dialog>
{/if}
<dialog
  bind:this={viewer}
  data-gallery-viewer
  class="public-site photo-viewer"
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
  {#if photo}<span class="copy-status" role="status">{copyStatus}</span>
    <div class="viewer-toolbar">
      <span
        >{feed ? '相片' : '相册项目'}
        {(stream?.photoOffset ?? 0) + itemIndex(photo) + 1} / {stream?.photos?.total ??
          items.length}{variants.length
          ? ` · 组内 ${variants.findIndex((p) => p.id === photo!.id) + 1} / ${variants.length}`
          : ''}</span
      >
      <div class="viewer-actions">
        {#if variants.length}<button
            class="icon-button"
            aria-label={showVariants ? '隐藏组内视角' : '显示组内视角'}
            title={showVariants ? '隐藏组内视角' : '显示组内视角'}
            aria-pressed={showVariants}
            onclick={() => (showVariants = !showVariants)}><Icon name="stack" /></button
          >{/if}
        <button
          class="icon-button"
          aria-label={info ? '隐藏信息' : '显示信息'}
          title={info ? '隐藏信息' : '显示信息'}
          aria-pressed={info}
          onclick={() => (info = !info)}><Icon name="info" /></button
        >
        <button
          class="icon-button"
          bind:this={immersiveButton}
          aria-label="全屏欣赏"
          title="全屏欣赏（F）"
          onclick={() => setImmersive(true)}><Icon name="fullscreen" /></button
        >
        {#if !preview}<button
            class="icon-button"
            aria-label="复制照片链接"
            title="复制照片链接"
            onclick={copyPhotoLink}><Icon name="copy" /></button
          >{/if}
        <button
          class="icon-button viewer-close"
          aria-label="关闭大图"
          title="关闭（Esc）"
          onclick={() => viewer.close()}><Icon name="close" /></button
        >
      </div>
    </div>
    <div
      class="viewer-body"
      class:with-variants={variants.length > 0 && showVariants}
      class:without-info={!info}
    >
      {#if variants.length && showVariants}<div class="group-variants" aria-label="组内视角">
          <span title="使用上下方向键切换">组内视角</span>{#each variants as p, index}<button
              class:chosen={p.id === photo.id}
              aria-label={`查看组内第 ${index + 1} 张`}
              aria-pressed={p.id === photo.id}
              onclick={() => choose(p)}
              ><img src={p.thumbnail} alt={p.alt || p.title || `视角 ${index + 1}`} /></button
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
        {#if photoLike}<div class="photo-like-overlay">
            {@render photoLike(photo)}
          </div>{/if}
        {#if immersive}<button
            class="immersive-exit"
            aria-label="退出沉浸模式"
            title="点击返回，Esc 退出"
            onclick={() => {
              if (!swiped) void setImmersive(false);
            }}
          ></button>{/if}
      </div>
      {#if info}<aside
          class="photo-information"
          class:comments-active={hasPhotoDiscussion && photoTab === 'comments'}
        >
          {#if hasPhotoDiscussion}<div class="photo-community-tabs">
              <SegmentedControl
                label="照片内容"
                options={[
                  { value: 'information', label: '照片信息' },
                  {
                    value: 'comments',
                    label: photoCommunity
                      ? `评论${photoCommentCount?.(photo) ? ` · ${photoCommentCount(photo)}` : ''}`
                      : '说明',
                  },
                ]}
                value={photoTab}
                onchange={(value) => (photoTab = value)}
              />
            </div>{/if}
          {#if hasPhotoDiscussion && photoTab === 'comments'}
            {#if hasPhotoStory}<section class="work-description">
                <h2>{photoTitle(photo)}</h2>
                {#if photo.tags?.length}<nav class="photo-tags" aria-label="照片标签">
                    {#each photo.tags as tag}<a href={`/photos?${new URLSearchParams({ tag: tag.id })}`}
                        >{tag.name}</a
                      >{/each}
                  </nav>{/if}
                {#if photo.group}<Markdown
                    text={photo.group.description}
                  />{:else if photo.description}<Markdown text={photo.description} />{/if}
              </section>{/if}
            {@render photoCommunity?.(photo)}
          {:else}
            {#if photoInformation}{@render photoInformation(photo)}{:else}
              <section class="capture-facts">
                <p>
                  <span>{captureTime(photo).label}</span><strong>{captureTime(photo).value}</strong>
                </p>
                {#if feed?.sort === 'added' && photo.addedAt}<p>
                    <span>加入 Gallery</span><strong
                      >{date(photo.addedAt)}{photo.addedEstimated ? '（历史估算）' : ''}</strong
                    >
                  </p>{/if}
                {#if photo.latitude !== null && photo.longitude !== null}<section class="location-facts">
                    <h3>拍摄位置</h3>
                    {#if photo.places?.length}<nav class="place-trail" aria-label="按拍摄地点筛选">
                        {#each photo.places.filter((p, i, all) => p.name !== all[i + 1]?.name) as place, index}<span
                            class="place-step"
                          >
                            {#if index > 0}<span class="place-separator" aria-hidden="true">›</span>{/if}<a
                              href={`/photos?${new URLSearchParams({ place: place.id })}`}>{place.name}</a
                            >
                          </span>{/each}
                      </nav>{/if}
                    {#if photo.places?.[0]?.kind === 'country'}<a
                        class="place-map"
                        href={`/visited/${photo.places[0].id.split(':')[1]}?${new URLSearchParams({ lat: String(photo.latitude), lng: String(photo.longitude), zoom: '11' })}`}
                        >查看地图</a
                      >{/if}
                    <p class="coordinates">
                      {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                    </p>
                  </section>{/if}
              </section>
              {#if photo.exif && Object.entries(photo.exif).some(([key, v]) => ['make', 'model', 'lensModel', 'fNumber', 'focalLength', 'iso', 'exposureTime'].includes(key) && v !== null && v !== '')}<section
                  class="camera-details"
                >
                  <h3>拍摄参数</h3>
                  <dl>
                    {#each ['make', 'model', 'lensModel', 'focalLength', 'fNumber', 'exposureTime', 'iso']
                      .map((key) => [key, photo!.exif![key]] as const)
                      .filter(([, value]) => value !== null && value !== undefined && value !== '') as [key, value]}<div
                        class:equipment={['make', 'model', 'lensModel'].includes(key)}
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
                </section>{/if}
              {#if photo.occurrences?.length}<section class="photo-context">
                  <h3>所在相册</h3>
                  {#each photo.occurrences as occurrence}<a href={`/albums/${occurrence.albumSlug}`}
                      >{occurrence.albumTitle} →</a
                    >{/each}{#if feed && photo.group}<a href={photoLink(photo)}>查看整组 →</a>{/if}
                </section>{/if}
            {/if}{/if}
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
            ><img loading="lazy" src={p.thumbnail} alt="" /><span
              >{index + 1}{p.group && !feed ? ' · 组' : ''}</span
            ></button
          >{/each}
      </div>
    </nav>
  {/if}
</dialog>

{#snippet cardLikes(kind: 'album' | 'photo', id: string)}
  {@const count = likeCount?.(kind, id) ?? 0}
  {#if count > 0}<span class="card-likes" aria-label={`${count} 人点赞`}>♡ {count}</span>{/if}
{/snippet}

{#snippet albumSorting()}
  <span class="album-sorting">
    <SegmentedControl
      label="相册排序"
      value={albumSort}
      options={[
        { value: 'updated', label: '最近更新' },
        { value: 'taken', label: '拍摄时间' },
      ]}
      onchange={(sort) => {
        const next = sort === 'taken' ? 'taken' : 'updated';
        if (stream) stream.changeSort(next);
        else albumSort = next;
        albumPage = 0;
      }}
    />
  </span>
{/snippet}

<style>
  .card-likes {
    display: inline-block !important;
    padding: 3px 0 !important;
    font-size: 12px !important;
    line-height: 1.5;
    color: #7b8477;
    background: transparent !important;
    white-space: nowrap;
  }
  .album-meta {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .album-meta > span:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .album-meta .card-likes {
    margin-left: auto;
    flex: 0 0 auto;
    padding: 0 !important;
  }
  .album-tools {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-left: auto;
    min-width: 0;
  }
  .album-search {
    width: 260px;
    display: flex;
    align-items: center;
  }
  @media (max-width: 600px) {
    .album-heading {
      row-gap: 18px;
    }
    .album-heading h1 {
      flex-basis: 100%;
    }
    .album-tools {
      flex-wrap: wrap;
      width: 100%;
      gap: 14px;
    }
    .album-search {
      flex: 1 1 180px;
      width: auto;
      min-width: 0;
    }
  }

  .place-trail {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 8px;
    align-items: baseline;
    line-height: 1.6;
    margin: 8px 0 12px;
  }
  .place-step {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .place-separator {
    color: #819079;
    font-size: 13px;
  }
  .place-trail a {
    padding: 0;
    color: #c7d2bf;
    font-size: 13px;
    text-decoration: none;
    border: 0;
    transition: color 0.15s;
  }
  .place-trail a:hover {
    color: #fff;
  }
  .place-map {
    font-size: 12px;
    color: #8f9f84;
    text-decoration: none;
    border: 0;
  }
  .place-map:hover {
    color: #d6e0ca;
  }

  .album-sorting {
    display: inline-flex;
    margin-left: auto;
    flex-shrink: 0;
  }
  .heading,
  .section-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

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
  .photo .photo-frame {
    position: relative;
    display: block;
    padding: 0;
    isolation: isolate;
  }
  .photo img[data-loading] {
    background: linear-gradient(100deg, #edf0e9 25%, #f7f8f4 50%, #edf0e9 75%);
    background-size: 200% 100%;
    animation: photo-loading 1.6s linear infinite;
  }
  @keyframes photo-loading {
    to {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .photo img[data-loading] {
      animation: none;
    }
  }
  .stack .photo-frame {
    margin: 3px 12px 15px 3px;
  }
  .stack .photo-frame::before,
  .stack .photo-frame::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid #fff;
    border-radius: 2px;
    background: #f0eee7;
    box-shadow: 0 3px 8px #25322526;
    pointer-events: none;
  }
  .stack .photo-frame::before {
    transform: translate(8px, 8px) rotate(1.5deg);
    z-index: -2;
  }
  .stack .photo-frame::after {
    transform: translate(4px, 4px) rotate(-1deg);
    z-index: -1;
    background: #faf9f5;
  }
  .stack .photo-frame img {
    aspect-ratio: auto;
    border-radius: 2px;
    box-shadow: 0 2px 7px #25322530;
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
  .camera-details h3,
  .capture-facts h3 {
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
  }

  a {
    color: inherit;
    text-decoration: none;
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

  .album-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 40px 24px;
  }
  .album-card {
    min-width: 0;
  }
  .album-cover,
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
  .section-title > span:not(.album-sorting) {
    color: #9ca593;
    margin-left: 8px;
    font-size: 12px;
  }
  .children-grid + .photo-list-heading {
    margin-top: 42px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .photo {
    align-self: start;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    color: inherit;
    min-width: 0;
  }
  .photo img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4/3;
    object-fit: contain;
    background: transparent;
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
  a:focus-visible,
  button:focus-visible {
    outline: 1px solid #88978b;
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
  .photo-tag-filter {
    margin: 0 0 28px;
    font-size: 13px;
  }

  .photo-tag-filter input {
    width: 100%;
    box-sizing: border-box;
    margin-top: 14px;
    padding: 10px;
    border: 1px solid #cad7c3;
    background: #fff;
    border-radius: 4px;
  }
  .tag-options,
  .selected-tags,
  .photo-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .tag-options a,
  .selected-tags a,
  .photo-tags a {
    padding: 6px 10px;
    border: 1px solid #cedac7;
    border-radius: 4px;
    text-decoration: none;
    color: inherit;
    overflow-wrap: anywhere;
  }
  .tag-options small {
    margin-left: 8px;
    opacity: 0.6;
  }
  .tag-options a.selected {
    background: #36543c;
    color: white;
  }
  .photo-tag-filter p {
    font-size: 12px;
    color: #677861;
  }
  .selected-tags .clear-tags {
    border: 0;
  }
  .photo-tags {
    margin: 12px 0 22px;
  }
  .photo-tags a {
    border-color: #4b604c;
    color: #dcebd5;
    font-size: 12px;
  }

  main {
    padding: 28px 0 48px;
  }
  h1 {
    font-size: 25px;
    line-height: 1.35;
    margin: 0 0 24px;
  }
  h1 small {
    font-size: 13px;
    color: #7c8678;
    font-weight: 400;
    margin-left: 10px;
    white-space: nowrap;
  }
  .heading {
    margin-bottom: 24px;
  }
  .heading h1 {
    margin: 0;
  }
  .feed-heading {
    align-items: center;
  }
  .timeline-layout {
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }
  .photo-filters {
    position: sticky;
    top: 24px;
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
    padding-right: 8px;
  }
  .photo-filters h2 {
    font-size: 12px;
    font-weight: 500;
    color: #7b8576;
    margin: 0 0 12px;
  }
  .photo-filters > section,
  .photo-tag-filter {
    margin: 0 0 28px;
  }
  .timeline {
    position: static;
    max-height: none;
    overflow: visible;
  }
  .timeline label {
    font-size: 12px;
    color: #7b8576;
  }
  .timeline nav {
    gap: 0;
  }
  .month-heading {
    margin: 0;
    font-size: 15px;
  }
  .timeline-photos {
    gap: 20px 16px;
  }
  .photo-tag-filter {
    width: auto;
    max-width: none;
  }
  .photo-tag-filter p {
    font-size: 11px;
    line-height: 1.7;
  }
  .tag-options {
    max-height: 240px;
    overflow-y: auto;
    gap: 6px;
  }
  .tag-options a {
    font-size: 12px;
    padding: 6px 9px;
  }
  .filter-toggle {
    display: none;
  }
  select {
    appearance: none;
    font: inherit;
    box-sizing: border-box;
    width: 100%;
    border-radius: 5px;
    padding: 10px 36px 10px 12px;
    background: white
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23727e70' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 12px center;
  }
  select:focus-visible,
  button:focus-visible,
  a:focus-visible,
  input:focus-visible {
    outline: 1px solid #88978b;
    outline-offset: 3px;
  }
  .breadcrumbs {
    margin-bottom: 12px;
  }
  .compact-children {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 24px;
  }
  .compact-children .album-card {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    column-gap: 12px;
    align-items: center;
    padding: 8px 14px 8px 8px;
    border: 1px solid #e4e8df;
    border-radius: 6px;
  }
  .compact-children .album-cover,
  .compact-children .empty-cover {
    grid-row: span 2;
    width: 54px;
    height: 44px;
  }
  .compact-children h2 {
    font-size: 14px;
    margin: 0;
  }
  .compact-children p {
    font-size: 11px;
  }
  .compact-children + .photo-list-heading {
    margin-top: 0;
  }
  .section-title {
    margin-bottom: 14px;
  }
  .viewer-toolbar {
    background: transparent;
    border: 0;
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .viewer-body .photo-information {
    background: #202821;
    border: 0;
    border-radius: 8px;
    padding: 24px;
    margin-left: 16px;
  }
  .full-image {
    border: 0;
  }
  .work-description {
    padding-bottom: 20px;
  }
  .capture-facts {
    padding: 20px 0 0;
    border: 0;
  }
  .capture-facts p {
    margin: 0 0 16px;
  }
  .camera-details {
    border: 0;
    padding-top: 8px;
    margin-top: 0;
  }
  .camera-details h3,
  .location-facts h3 {
    font-size: 11px;
    font-weight: 400;
    color: #9aa992;
    margin: 0 0 8px;
  }
  .camera-details dl {
    font-size: 12px;
    margin: 0;
  }
  .camera-details dl > div {
    padding: 5px 0;
  }
  .album-navigation {
    border: 0;
    background: transparent;
    padding-top: 12px;
  }
  @media (max-width: 1000px) and (min-width: 761px) {
    .timeline-photos {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .timeline-layout {
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 24px;
    }
  }
  @media (max-width: 760px) {
    main {
      padding-top: 22px;
    }
    .timeline-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .photo-filters {
      display: none;
      position: static;
      max-height: none;
      padding: 16px;
      background: #f0f3ed;
      border-radius: 8px;
    }
    .photo-filters.expanded {
      display: block;
    }
    .filter-toggle {
      display: block;
      padding: 8px 12px;
      border: 1px solid #dce2d6;
      border-radius: 5px;
      background: transparent;
      font-size: 12px;
    }
    .timeline-photos {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .viewer-body .photo-information {
      margin: 12px 0 0;
      padding: 20px;
    }
  }
  @media (max-width: 600px) {
  }

  .viewer-body .photo-information {
    scrollbar-width: thin;
    scrollbar-color: #52604f transparent;
  }
  .camera-details dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
  }
  .camera-details dl > div {
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0;
  }
  .camera-details dl > .equipment {
    grid-column: 1/-1;
    flex-direction: row;
    justify-content: space-between;
  }
  .camera-details dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .photo-filters :is(input, select) {
    font: inherit;
    font-size: 12px;
    min-height: 36px;
    box-sizing: border-box;
    border: 1px solid #e0e5dc;
    border-radius: 5px;
    background-color: #fff;
    color: #465443;
  }
  .photo-filters input {
    width: 100%;
    padding: 8px 10px;
    margin: 0 0 10px;
  }
  .photo-filters .tag-options,
  .photo-filters .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
  }
  .photo-filters .tag-options a,
  .photo-filters .selected-tags a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    box-sizing: border-box;
    font-size: 12px;
    line-height: 18px;
    padding: 5px 9px;
    border: 0;
    border-radius: 4px;
    background: #f0f3ee;
    color: #697566;
  }
  .photo-filters .tag-options a.selected {
    background: #e0e8dc;
    color: #354d38;
  }
  .photo-filters .tag-options small {
    font-size: 11px;
    margin: 0;
    opacity: 0.7;
  }
  .photo-filters .photo-tag-filter p {
    font-size: 11px;
    line-height: 1.8;
    color: #899283;
    margin: 12px 0 0;
  }
  .photo-filters .selected-tags {
    margin: 12px 0 0;
  }
  .photo-filters .selected-tags .clear-tags {
    background: transparent;
  }
  .photo-filters :is(input, select):focus:not(:focus-visible) {
    outline: none;
    box-shadow: none;
    border-color: #e0e5dc;
  }
  dialog[open] {
    inset: 0;
    margin: 0;
    width: 100%;
    max-width: none;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    display: grid;
    grid-template-rows: 52px minmax(0, 1fr) auto;
    overflow: hidden;
  }
  .viewer-toolbar {
    padding: 4px 12px 4px 18px;
    gap: 8px;
    position: relative;
    background: #141b16;
  }
  .viewer-toolbar > span {
    flex-basis: auto;
    white-space: nowrap;
    font-size: 11px;
    color: #aeb9aa;
  }
  .viewer-toolbar .viewer-actions {
    flex-wrap: nowrap;
    gap: 4px;
  }
  .viewer-toolbar .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 50%;
    background: transparent;
    color: #ced8c9;
    position: static;
  }
  .viewer-toolbar .icon-button:hover {
    background: #29342b;
  }
  .viewer-toolbar .icon-button[aria-pressed='true'] {
    background: #263029;
  }
  .viewer-body .photo-information {
    margin: 0;
    border-radius: 0;
    padding: 22px;
  }
  .viewer-body {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .viewer-body .full-image {
    height: 100%;
    min-height: 0;
  }
  .album-navigation {
    position: relative;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    align-items: center;
    padding: 6px 10px;
    background: #141b16;
    border: 0;
  }
  .strip-heading {
    display: contents;
  }
  .strip-heading > span {
    display: none;
  }
  .strip-heading button {
    min-width: 30px;
    width: 30px;
    grid-row: 1;
  }
  .strip-heading button:last-child {
    grid-column: 3;
  }
  .album-strip {
    grid-column: 2;
    grid-row: 1;
    padding: 2px 4px;
  }
  .album-strip button {
    flex-basis: 64px;
    padding: 2px;
    border-radius: 2px;
  }
  .album-strip img {
    width: 58px;
    height: 40px;
  }
  .album-strip span {
    display: none;
  }
  .copy-status {
    position: absolute;
    top: 58px;
    right: 16px;
    z-index: 5;
    color: #e8eee4;
    background: #29362def;
    border-radius: 5px;
    font-size: 12px;
  }
  .copy-status:not(:empty) {
    padding: 8px 12px;
  }
  @media (max-width: 760px) {
    dialog[open] {
      grid-template-rows: 52px minmax(0, 1fr) auto;
    }
    .viewer-toolbar {
      padding: 4px 8px;
    }
    .viewer-toolbar > span {
      font-size: 10px;
      white-space: normal;
      line-height: 1.5;
    }
    .viewer-toolbar .viewer-actions {
      gap: 0;
    }
    .viewer-toolbar .icon-button {
      width: 40px;
      height: 40px;
    }
    .viewer-body,
    .viewer-body.with-variants {
      height: 100%;
      overflow-y: auto;
      align-content: start;
    }
    .viewer-body .full-image {
      height: 54dvh;
      min-height: 200px;
    }
    .viewer-body.without-info {
      align-content: stretch;
    }
    .viewer-body.without-info .full-image {
      height: 100%;
      min-height: 0;
    }
    .viewer-body .photo-information {
      padding: 22px 18px;
    }
    .group-variants {
      height: 54dvh;
    }
    .album-strip img {
      height: 36px;
      width: 54px;
    }
    .album-strip button {
      flex-basis: 60px;
    }
  }
  dialog.immersive[open] {
    grid-template-rows: minmax(0, 1fr);
  }
  dialog.immersive .viewer-body,
  dialog.immersive .full-image {
    height: 100%;
    min-height: 0;
  }
  dialog.immersive .copy-status {
    display: none;
  }
  .related-articles {
    margin-top: 32px;
    border-top: 1px solid #e2e7dd;
    padding-top: 22px;
    display: flex;
    gap: 18px 30px;
    flex-wrap: wrap;
    font-size: 13px;
    color: #7b8974;
  }
  @media (max-width: 760px) {
    /* Keep intrinsic portrait dimensions from overflowing a shrunken grid row.
       The image and metadata share one scroll container, with explicit rows. */
    dialog:not(.immersive) .viewer-body:not(.without-info) {
      grid-template-rows: min(65dvh, 640px) max-content;
    }
    dialog:not(.immersive) .viewer-body:not(.without-info) .full-image {
      height: 100%;
      min-height: 0;
      grid-row: 1;
      overflow: hidden;
    }
    dialog:not(.immersive) .viewer-body:not(.without-info) .full-image > img {
      height: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    dialog:not(.immersive) .viewer-body:not(.without-info) .group-variants {
      grid-row: 1;
      min-height: 0;
      height: 100%;
      max-height: 100%;
    }
    dialog:not(.immersive) .viewer-body:not(.without-info) .photo-information {
      grid-row: 2;
      overflow: visible;
    }
  }
  .detail.no-story {
    grid-template-columns: minmax(0, 1fr);
  }
  .viewer-body .camera-details dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .viewer-body .camera-details dl > div {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    align-items: baseline;
    gap: 16px;
  }
  .viewer-body .camera-details dt {
    text-align: left;
  }
  .viewer-body .camera-details dd {
    text-align: right;
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .album-title-row {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 18px 0 32px;
  }
  .album-title-row h1 {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .photo-list-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  .photo-list-heading .section-title {
    margin: 0;
  }
  .discussion-entry {
    background: none;
    border: 0;
    padding: 8px 0;
    color: #73816b;
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }
  .discussion-entry span {
    margin-left: 8px;
  }
  .detail .album-story {
    position: sticky;
    top: 24px;
    max-height: calc(100dvh - 48px);
    overflow: auto;
    padding: 0 0 0 26px;
    border: 0;
    border-left: 1px solid #e3e8de;
    border-radius: 0;
    background: transparent;
  }
  .album-description {
    padding: 0 0 16px;
  }
  .album-description .story-heading {
    border: 0;
    padding: 0;
    margin: 0 0 20px;
  }
  .photo-like-overlay {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 5;
    color: #eef2eb;
    border-radius: 30px;
    background: #172119b8;
    backdrop-filter: blur(8px);
  }
  .photo-like-overlay:empty {
    display: none;
  }
  @media (min-width: 761px) {
    .viewer-body .photo-information.comments-active {
      display: flex;
      flex-direction: column;
    }
    .comments-active .photo-community-tabs,
    .comments-active .work-description {
      flex: none;
    }
    .comments-active :global(.community-panel) {
      display: flex;
      flex-direction: column;
      flex: 1 0 auto;
    }
    .comments-active :global(.comments) {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .comments-active :global(.composer) {
      margin-top: auto;
      flex-shrink: 0;
    }
  }
  .photo-community-tabs {
    position: sticky;
    top: -22px;
    z-index: 4;
    padding: 0 0 16px;
    background: #212a23;
    --segment-background: #ffffff08;
    --segment-color: #a3b09b;
    --segment-chosen: #ffffff10;
    --segment-active: #e1e9dc;
  }
  dialog.album-discussion[open] {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset: auto 0 0;
    margin: 0;
    width: 100%;
    max-width: none;
    height: auto;
    max-height: 85dvh;
    box-sizing: border-box;
    border: 0;
    border-radius: 18px 18px 0 0;
    padding: 0;
    background: #fafbf9;
    color: #303c34;
    overflow: hidden;
  }
  dialog.album-discussion::backdrop {
    background: #14231b70;
    backdrop-filter: blur(3px);
  }
  .album-discussion header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 18px 22px;
    border-bottom: 1px solid #e3e8de;
    font-size: 14px;
  }
  .album-discussion header button {
    border: 0;
    background: none;
    color: #788570;
    font-size: 24px;
    padding: 0 4px;
    cursor: pointer;
  }
  .discussion-body {
    padding: 22px 22px max(8px, env(safe-area-inset-bottom));
    overflow: auto;
    overscroll-behavior: contain;
  }
  @media (max-width: 760px) {
    .album-title-row {
      gap: 12px;
      margin-bottom: 28px;
    }
    .photo-like-overlay {
      top: 12px;
      right: 12px;
    }
  }
</style>
