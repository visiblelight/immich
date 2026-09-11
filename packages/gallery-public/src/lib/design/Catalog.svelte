<script lang="ts">
  import { tick } from 'svelte';
  import { roots, albumById, photoById, ancestors, sampleExif, type Album } from './catalog-data';
  import { imageCredits } from './credits';
  import './catalog.css';
  let { albumId, view }: { albumId: string | null; view: string } = $props();
  const album = $derived(albumId ? albumById(albumId) : null);
  const title = $derived(view === 'about' ? '关于' : album?.title || '相册');
  let expanded = $state(false);
  let selected = $state<string | null>(null);
  let information = $state(true);
  let imageFailed = $state(false);
  let viewer: HTMLDialogElement;
  let trigger: HTMLElement | null = null;
  const photo = $derived(selected ? photoById(selected) : null);
  const photoIndex = $derived(album && selected ? album.photoIds.indexOf(selected) : 0);
  const credit = $derived(imageCredits.find((item) => item.id === selected));
  $effect(() => {
    albumId;
    expanded = false;
  });
  const albumUrl = (id: string) => `/design?album=${id}`;
  async function openPhoto(id: string) {
    trigger = document.activeElement as HTMLElement;
    selected = id;
    imageFailed = false;
    information = window.matchMedia('(min-width: 768px)').matches;
    await tick();
    viewer.showModal();
  }
  function step(delta: number) {
    if (!album || !selected) return;
    const index = (photoIndex + delta + album.photoIds.length) % album.photoIds.length;
    selected = album.photoIds[index]!;
    imageFailed = false;
  }
  function keydown(event: KeyboardEvent) {
    if (!viewer?.open) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  }
</script>

<svelte:head><title>{title} · Gallery · 页面预览</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<svelte:window onkeydown={keydown} />

{#snippet cover(id: string, eager = false)}
  {@const image = photoById(id)}
  <img
    src={image.src}
    srcset={`${image.src.replace('.jpg', '-small.jpg')} 800w, ${image.src} ${image.width}w`}
    sizes="(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 25vw"
    alt={image.alt}
    width={image.width}
    height={image.height}
    loading={eager ? 'eager' : 'lazy'}
  />
{/snippet}
{#snippet card(item: Album, eager = false)}
  <a class="album-card" href={albumUrl(item.id)}>
    <div class="album-cover">
      {@render cover(item.cover, eager)}{#if item.children.length}<span class="nested-badge"
          >{item.children.length} 个子相册</span
        >{/if}
    </div>
    <div class="album-label">
      <h2>{item.title}</h2>
      <span>{item.photoIds.length} 张照片</span>
    </div>
    <p>{item.subtitle}</p>
  </a>
{/snippet}

<div class="catalog-site">
  <a class="skip-content" href="#catalog-main">跳到正文</a>
  <header class="catalog-header">
    <div class="header-inner">
      <a class="catalog-brand" href="/design" aria-label="Gallery 相册">Gallery<span>摄影记录</span></a>
      <nav aria-label="主导航">
        <a href="/design" aria-current={view !== 'about' ? 'page' : undefined}>相册</a><a
          href="/design?page=about"
          aria-current={view === 'about' ? 'page' : undefined}>关于</a
        >
      </nav>
    </div>
  </header>
  <main id="catalog-main" class="catalog-main">
    {#if view === 'about'}
      <article class="about-page">
        <div class="about-heading">
          <span class="page-eyebrow">关于这个相册</span>
          <h1>你好，欢迎来看看。</h1>
          <p>用照片记下一些地方，也记下一些平常的日子。</p>
        </div>
        <div class="about-prose">
          <h2>关于我</h2>
          <p>
            我是一名喜欢旅行的摄影爱好者。带着相机出门，拍风景、街道，也拍那些很快就会忘记的小事。比起安排得满满当当的行程，我更喜欢在一个地方多待一会儿。
          </p>
          <p>这里整理了旅途中和日常生活里的部分照片。每本相册有它自己的故事，有时是一座城市，有时只是某一天的下午。</p>
          <h2>关于这里</h2>
          <p>
            你可以从相册列表开始，进入感兴趣的一册。相册里的文字记录当时的经历，照片旁的说明则补充一些画面之外的细节。
          </p>
          <p>希望翻看这些照片的时候，你也能找到一两个愿意停留的瞬间。</p>
          <hr />
          <p class="about-demo">以上是“关于”文章的静态示例。后续由后台文章模块选择一篇文章展示。</p>
        </div>
      </article>
    {:else if album}
      <nav class="album-breadcrumb" aria-label="相册层级">
        <a href="/design">全部相册</a>{#each ancestors(album) as parent}<span aria-hidden="true">/</span><a
            href={albumUrl(parent.id)}>{parent.title}</a
          >{/each}<span aria-hidden="true">/</span><span aria-current="page">{album.title}</span>
      </nav>
      <div class="album-title">
        <h1>{album.title}</h1>
        <p>
          {album.photoIds.length} 张本册照片{#if album.children.length}<span>·</span>{album.children.length} 个子相册{/if}
        </p>
      </div>
      <div class="album-detail">
        <div class="album-content">
          {#if album.children.length}<section class="child-albums" aria-labelledby="children-title">
              <div class="content-heading">
                <h2 id="children-title">子相册</h2>
                <span>{album.children.length}</span>
              </div>
              <div class="child-grid">
                {#each album.children as id}{@render card(albumById(id), true)}{/each}
              </div>
            </section>{/if}
          {#if album.photoIds.length}<section aria-labelledby="photos-title">
              <div class="content-heading">
                <h2 id="photos-title">照片</h2>
                <span>{album.photoIds.length}</span>
              </div>
              <div class="photo-grid">
                {#each album.photoIds as id, index}{@const image = photoById(id)}
                  <figure>
                    <button class="photo-tile" onclick={() => openPhoto(id)} aria-label={`查看照片：${image.title}`}
                      ><img
                        src={image.src}
                        srcset={`${image.src.replace('.jpg', '-small.jpg')} 800w, ${image.src} ${image.width}w`}
                        sizes="(max-width: 767px) 50vw, 30vw"
                        alt={image.alt}
                        width={image.width}
                        height={image.height}
                        loading={index < 3 ? 'eager' : 'lazy'}
                      /><span class="enlarge" aria-hidden="true">⤢</span></button
                    >
                    <figcaption>{image.title}</figcaption>
                  </figure>{/each}
              </div>
            </section>{:else}<p class="no-direct-photos">这本相册的照片整理在上方的子相册中。</p>{/if}
        </div>
        <aside class="album-introduction" class:expanded aria-label="相册介绍">
          <div class="intro-heading">
            <h2>相册介绍</h2>
            <button
              class="intro-toggle"
              aria-expanded={expanded}
              aria-controls="intro-body"
              onclick={() => (expanded = !expanded)}
              >{expanded ? '收起' : '展开阅读'} <span aria-hidden="true">{expanded ? '−' : '+'}</span></button
            >
          </div>
          <div class="intro-body" id="intro-body">
            <p class="intro-lede">{album.subtitle}</p>
            {#each album.intro as paragraph, index}{#if index === 2}<h3>路上的记录</h3>{/if}
              <p>{paragraph}</p>{/each}
            <blockquote>有些片刻，当时觉得平常，回来后却记了很久。</blockquote>
            <p>把它们放在这里，留着以后慢慢看。</p>
          </div>
        </aside>
      </div>
    {:else}
      <div class="listing-heading">
        <div>
          <h1>相册</h1>
          <p>旅行和日常，按相册慢慢翻看。</p>
        </div>
        <span>{roots.length} 本相册</span>
      </div>
      <div class="album-grid">
        {#each roots as item, index}{@render card(item, index < 4)}{/each}
      </div>
    {/if}
  </main>
  <footer class="catalog-footer">
    <span>Gallery · 摄影记录</span><span class="preview-note">设计预览 · 示例照片与文字</span><a href="/design/credits"
      >照片来源与许可</a
    >
  </footer>
</div>

<dialog
  class="catalog-viewer"
  bind:this={viewer!}
  aria-label="照片浏览"
  onclose={() => {
    selected = null;
    trigger?.focus();
  }}
>
  {#if photo && album}
    <header class="viewer-toolbar">
      <span class="viewer-position">{photoIndex + 1} / {album.photoIds.length}</span><span class="viewer-photo-title"
        >{photo.title}</span
      >
      <div>
        <button
          onclick={() => (information = !information)}
          aria-pressed={information}
          aria-controls="photo-information">{information ? '隐藏信息' : '照片信息'}</button
        ><button class="viewer-close" onclick={() => viewer.close()} aria-label="关闭照片">×</button>
      </div>
    </header>
    <div class="viewer-workspace" class:with-info={information}>
      <div class="large-photo">
        <div class="image-space">
          {#key photo.id}{#if imageFailed}<p role="status">照片暂时无法显示，请关闭后重试。</p>{:else}<img
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                onerror={() => (imageFailed = true)}
              />{/if}{/key}
        </div>
        {#if album.photoIds.length > 1}<button
            class="photo-arrow previous"
            onclick={() => step(-1)}
            aria-label="上一张照片">‹</button
          ><button class="photo-arrow next" onclick={() => step(1)} aria-label="下一张照片">›</button>{/if}
      </div>
      {#if information}<aside class="photo-information" id="photo-information">
          <h2>{photo.title}</h2>
          <p class="photo-album">{album.title}</p>
          <p class="photo-description">{photo.description}</p>
          <h3>拍摄参数 <span>示例</span></h3>
          <dl>
            {#each sampleExif as [label, value]}<div>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>{/each}
          </dl>
          <p class="exif-note">参数仅演示 EXIF 的呈现方式，并非这张示例照片的真实拍摄数据。</p>
          {#if credit}<p class="photo-credit">
              示例摄影：<a href={credit.page} target="_blank" rel="noreferrer">{credit.author}</a>
            </p>{/if}
        </aside>{/if}
    </div>
  {/if}
</dialog>
