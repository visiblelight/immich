<script lang="ts">
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import { photos, cityPhotos, coastPhotos, paragraphs, type Scene, type Photo as PhotoItem } from './content';
  import Photo from './Photo.svelte';
  import './exhibition.css';
  let { direction }: { direction: 'a' | 'b' } = $props();
  const scene = $derived((page.url.searchParams.get('scene') || 'home') as Scene);
  const focused = $derived(page.url.searchParams.get('album') === 'sololaki');
  const exhibition = $derived(direction === 'b');
  const frame = $derived(page.url.searchParams.get('embed') === '1');
  const brand = $derived(exhibition ? '别处' : '行间');
  const cityTitle = $derived(focused ? '索洛拉基的下午' : '在第比利斯，慢慢走');
  let dialog: HTMLDialogElement;
  let selected = $state<PhotoItem | null>(null);
  let photoIndex = $state(0);
  let menuOpen = $state(false);
  let galleryPage = $state(1);
  let layout = $state<'grid' | 'large'>('grid');
  let lastTrigger: HTMLElement | null = null;
  const activePhotos = $derived(scene === 'story' ? cityPhotos : coastPhotos);
  const collection = $derived(
    Array.from({ length: 12 * galleryPage }, (_, i) => ({ ...coastPhotos[i % coastPhotos.length]!, sequence: i + 1 })),
  );
  function url(next: Scene, album?: string) {
    const q = new URLSearchParams({ scene: next });
    if (frame) q.set('embed', '1');
    if (album) q.set('album', album);
    return `/design/${direction}?${q}`;
  }
  async function showPhoto(photo: PhotoItem) {
    selected = photo;
    photoIndex = activePhotos.findIndex((p) => p.id === photo.id);
    lastTrigger = document.activeElement as HTMLElement;
    await tick();
    dialog.showModal();
  }
  function closePhoto() {
    dialog.close();
  }
  function stepPhoto(delta: number) {
    photoIndex = (photoIndex + delta + activePhotos.length) % activePhotos.length;
    selected = activePhotos[photoIndex]!;
  }
  function onKey(event: KeyboardEvent) {
    if (!dialog?.open) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepPhoto(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepPhoto(1);
    }
  }
</script>

<svelte:head
  ><title
    >{brand} · {scene === 'home'
      ? '摄影与游记'
      : scene === 'country'
        ? '格鲁吉亚'
        : scene === 'story'
          ? cityTitle
          : '影像集'} — 视觉方案 {direction.toUpperCase()}</title
  ><meta name="robots" content="noindex,nofollow" /></svelte:head
>
<svelte:window onkeydown={onKey} />
<div class:exhibition class:book={!exhibition} class="design-site">
  {#if !frame}<div class="review-strip">
      <a href="/design">← 方案对比</a><span
        >方向 {direction.toUpperCase()} · {exhibition ? '当代摄影展' : '摄影画册'} · 示例内容</span
      ><a href={`/design/${exhibition ? 'a' : 'b'}?scene=${scene}`}>切换方向 ↔</a>
    </div>{/if}
  <a class="skip" href="#main">跳到正文</a>
  <header class="site-header shell">
    <a class="wordmark" href={url('home')} aria-label={`${brand}首页`}
      ><span class="brand-cn">{brand}<i aria-hidden="true">{exhibition ? '↗' : '·'}</i></span><span class="brand-en"
        >{exhibition ? 'ELSEWHERE' : 'FIELD NOTES'}</span
      ></a
    >
    <nav aria-label="主导航" class:open={menuOpen}>
      <a href={url('home')} class:current={scene === 'home'} onclick={() => (menuOpen = false)}>首页</a>
      <a href={url('country')} class:current={scene !== 'home'} onclick={() => (menuOpen = false)}>相册</a>
      <a href="#about" onclick={() => (menuOpen = false)}>关于</a>
    </nav>
    <span class="header-note">{exhibition ? '独立摄影档案 / 2024—2026' : '摄影与旅行札记'}</span>
    <button class="menu-toggle" aria-label="展开导航" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}
      >{menuOpen ? '关闭 −' : '目录 +'}</button
    >
  </header>
  <main id="main">
    {#if scene === 'home'}
      {#if exhibition}
        <section class="exhibit-intro shell">
          <div class="small-caps">PHOTOGRAPHS & JOURNEYS</div>
          <h1>目光所至<span class="title-period">.</span></h1>
          <div class="intro-bottom">
            <p>一些地方，一些停留。<br />用照片记住经过的世界。</p>
            <span class="archive-code">SELECTED WORKS<br />VOL. 001 — 003</span>
          </div>
        </section>
        <section class="exhibit-hero shell">
          <a class="hero-image" href={url('country')} aria-label="打开格鲁吉亚相册"
            ><Photo photo={photos[0]!} cover eager /></a
          ><a class="exhibit-hero-caption" href={url('country')}
            ><span>01 / GEORGIA</span>
            <h2>山海之间，格鲁吉亚</h2>
            <span class="round-arrow" aria-hidden="true">↗</span></a
          >
        </section>
      {:else}
        <section class="book-hero shell">
          <div class="book-hero-copy">
            <span class="small-caps">一册旅行 · GEORGIA</span>
            <h1>山海之间，<br />慢慢经过。</h1>
            <p>从高加索的山，走到黑海的岸。<br />把途中的光，收进这一册。</p>
            <a class="text-link" href={url('country')}>翻开格鲁吉亚 <span aria-hidden="true">↗</span></a><span
              class="hero-edition">01 <span>/ 旅行札记</span></span
            >
          </div>
          <a class="hero-image" href={url('country')} aria-label="翻开格鲁吉亚相册"
            ><Photo photo={photos[0]!} cover eager /></a
          >
          <div class="book-caption"><span>GEORGIA, IN BETWEEN</span><span>山与海之间的日子</span></div>
        </section>
      {/if}
      <section class="selected-section shell">
        <div class="section-heading">
          <div>
            <span class="small-caps">{exhibition ? 'THE ARCHIVE' : 'SELECTED JOURNEYS'}</span>
            <h2>{exhibition ? '系列 / 作品' : '继续，往下一页。'}</h2>
          </div>
          <span class="section-aside">三段旅程，各自成册</span>
        </div>
        <div class="album-grid">
          {#each [{ photo: photos[1]!, name: '在第比利斯，慢慢走', en: 'TBILISI', next: 'story' as Scene, meta: '城市游记 · 3 张照片', number: '01' }, { photo: photos[3]!, name: '风从黑海来', en: 'BATUMI', next: 'collection' as Scene, meta: '海岸影像 · 36 个示例图位', number: '02' }, { photo: photos[0]!, name: '格鲁吉亚', en: 'GEORGIA', next: 'country' as Scene, meta: '总游记 · 2 个子相册', number: '03' }] as album}
            <article class="album-card">
              <a href={url(album.next)}
                ><div class="album-image"><Photo photo={album.photo} cover /></div>
                <div class="card-meta"><span>{album.number} / {album.en}</span><span aria-hidden="true">↗</span></div>
                <h3>{album.name}</h3>
                <p>{album.meta}</p></a
              >
            </article>{/each}
        </div>
      </section>
      <section class="closing-note shell">
        <span class="small-caps">A NOTE ON SEEING</span>
        <p>不急着抵达。<br />先看见，正在经过的地方。</p>
        <a class="text-link" href={url('story')}>读一段游记 <span aria-hidden="true">↗</span></a>
      </section>
    {:else if scene === 'country'}
      <section class="album-heading shell">
        <nav class="breadcrumb" aria-label="相册层级">
          <a href={url('home')}>相册</a><span>/</span><span aria-current="page">格鲁吉亚</span>
        </nav>
        <span class="small-caps">01 / GEORGIA</span>
        <h1>{exhibition ? '格鲁吉亚。' : '格鲁吉亚，山海之间。'}</h1>
        <div class="album-lede">
          <p>向北是层层叠叠的山，向西是没有尽头的海。<br />在两者之间，城市和日常缓缓展开。</p>
          <div class="album-stats"><span>2 个子相册</span><span>本册 0 张直接照片</span></div>
        </div>
      </section>
      <div class="country-cover shell"><Photo photo={photos[0]!} cover eager /></div>
      <section class="country-introduction reading-layout shell">
        <aside class="margin-note"><span>旅程札记</span><span>01 — THE JOURNEY</span></aside>
        <div class="prose">
          <h2>从山间，到海边。</h2>
          <p>
            这趟旅行，从第比利斯开始。沿着街道认识一座城市，再沿着公路去看远处的山。最后，我们在巴统停下来，把剩下的时间交给海风。
          </p>
          <p>
            我把它们整理成两个相册：一个关于城市里的漫步，一个关于海岸上的停留。每一册都有自己的照片和故事，也都是这段旅程的一部分。
          </p>
        </div>
      </section>
      <section class="children shell">
        <div class="section-heading">
          <div>
            <span class="small-caps">CHAPTERS</span>
            <h2>两座城市，两种节奏。</h2>
          </div>
          <span class="section-aside">选择一册，继续走</span>
        </div>
        <div class="child-grid">
          {#each [{ p: photos[1]!, title: '第比利斯', en: 'TBILISI', description: '旧城、阳台与缓缓流动的河。', next: 'story' as Scene }, { p: photos[3]!, title: '巴统', en: 'BATUMI', description: '去海边，直到日光收起。', next: 'collection' as Scene }] as item, i}<a
              class="child-card"
              href={url(item.next)}
              ><div class="child-image"><Photo photo={item.p} cover /></div>
              <div class="child-copy">
                <span class="small-caps">0{i + 1} / {item.en}</span>
                <h3>{item.title}<span aria-hidden="true">↗</span></h3>
                <p>{item.description}</p>
              </div></a
            >{/each}
        </div>
        <p class="subtle-note">照片收录在上方的城市相册中。</p>
      </section>
    {:else if scene === 'story'}
      <article>
        <header class="album-heading story-heading shell">
          <nav class="breadcrumb" aria-label="相册层级">
            <a href={url('home')}>相册</a><span>/</span><a href={url('country')}>格鲁吉亚</a><span>/</span
            >{#if focused}<a href={url('story')}>第比利斯</a><span>/</span>{/if}<span aria-current="page"
              >{focused ? '索洛拉基' : '第比利斯'}</span
            >
          </nav>
          <div class="story-kicker">
            <span class="small-caps">CITY NOTES / {focused ? 'SOLOLAKI' : 'TBILISI'}</span><span>约 5 分钟阅读</span>
          </div>
          <h1>
            {#if focused}
              {cityTitle}<span class="title-period">{exhibition ? '.' : '。'}</span>
            {:else}
              <span class="title-phrase">在第比利斯，</span><wbr /><span class="title-phrase"
                >慢慢走<span class="title-period">{exhibition ? '.' : '。'}</span></span
              >
            {/if}
          </h1>
          <p class="story-deck">沿着那些没有计划的小路，<br class="mobile-break" />认识一座城市。</p>
          <div class="story-meta">
            <span>格鲁吉亚 · 城市札记</span><span>3 张本册照片</span><a href="#photographs">查看全部照片 ↓</a>
          </div>
        </header>
        <figure class="story-cover shell">
          <Photo photo={photos[1]!} eager onclick={() => showPhoto(photos[1]!)} />
          <figcaption><span>01 — {photos[1]!.title}</span><span>{photos[1]!.location}</span></figcaption>
        </figure>
        <div class="reading-layout shell">
          <aside class="margin-note story-index">
            <span>这一册</span><a href="#first">01 街巷之间</a><a href="#second">02 留在光里</a><a href="#photographs"
              >03 照片</a
            >
          </aside>
          <div class="prose">
            <span class="chapter-label" id="first">01 / 街巷之间</span>
            <h2>上坡之后，<br />是另一座城市。</h2>
            <p>{paragraphs[0]}</p>
            <p>{paragraphs[1]}</p>
          </div>
        </div>
        <div class="diptych shell">
          <figure>
            <Photo photo={photos[2]!} onclick={() => showPhoto(photos[2]!)} />
            <figcaption>02 — {photos[2]!.title}</figcaption>
          </figure>
          <figure>
            <Photo photo={photos[4]!} onclick={() => showPhoto(photos[4]!)} />
            <figcaption>03 — {photos[4]!.title}</figcaption>
          </figure>
        </div>
        <div class="reading-layout shell">
          <aside class="margin-note"><span>TBILISI</span><span>走过，也停留。</span></aside>
          <div class="prose">
            <blockquote>旅行中最想带走的，<br />常常只是某个普通的下午。</blockquote>
            <span class="chapter-label" id="second">02 / 留在光里</span>
            <h2>不必每一步，都有目的地。</h2>
            <p>{paragraphs[2]}</p>
            <p>{paragraphs[3]}</p>
          </div>
        </div>
        {#if !focused}<section class="nested-chapter shell">
            <div>
              <span class="small-caps">这一册里的另一段故事</span>
              <h3>索洛拉基的下午</h3>
              <p>走进老街区，继续往里看。</p>
              <a class="text-link" href={url('story', 'sololaki')}>打开子相册 <span aria-hidden="true">↗</span></a>
            </div>
            <a href={url('story', 'sololaki')} aria-label="打开索洛拉基子相册"><Photo photo={photos[4]!} cover /></a>
          </section>{/if}
        <section class="photo-section shell" id="photographs">
          <div class="section-heading">
            <div>
              <span class="small-caps">CONTACT SHEET</span>
              <h2>这一册的照片<span class="count">03</span></h2>
            </div>
            <span class="section-aside">点击照片，慢一点看</span>
          </div>
          <div class="contact-sheet">
            {#each cityPhotos as photo, i}<figure>
                <Photo
                  {photo}
                  sizes={layout === 'large' ? '(max-width: 767px) 100vw, 940px' : '(max-width: 767px) 45vw, 30vw'}
                  onclick={() => showPhoto(photo)}
                />
                <figcaption><span>{String(i + 1).padStart(2, '0')}</span>{photo.title}</figcaption>
              </figure>{/each}
          </div>
        </section>
        <a class="next-story shell" href={url('collection')}
          ><span class="small-caps">NEXT CHAPTER / BATUMI</span>
          <h2>下一站，去海边。 <span aria-hidden="true">↗</span></h2></a
        >
      </article>
    {:else if scene === 'collection'}
      <section class="album-heading shell">
        <nav class="breadcrumb" aria-label="相册层级">
          <a href={url('home')}>相册</a><span>/</span><a href={url('country')}>格鲁吉亚</a><span>/</span><span
            aria-current="page">巴统</span
          >
        </nav>
        <span class="small-caps">02 / BATUMI</span>
        <h1>风从黑海来<span class="title-period">。</span></h1>
        <div class="album-lede">
          <p>日光、海风，与路上的片刻。<br />把故事留给照片。</p>
          <div class="album-stats"><span>36 个示例图位</span><span>0 个子相册</span></div>
        </div>
      </section>
      <section class="collection-section shell">
        <div class="collection-tools">
          <span>影像集 / <span aria-live="polite">已显示 {collection.length} / 36</span></span>
          <div aria-label="照片排列">
            <button class:active={layout === 'grid'} aria-pressed={layout === 'grid'} onclick={() => (layout = 'grid')}
              >网格</button
            ><button
              class:active={layout === 'large'}
              aria-pressed={layout === 'large'}
              onclick={() => (layout = 'large')}>大图</button
            >
          </div>
        </div>
        <div class="contact-sheet collection" class:large={layout === 'large'}>
          {#each collection as photo}<figure>
              <Photo
                {photo}
                sizes={layout === 'large' ? '(max-width: 767px) 100vw, 940px' : '(max-width: 767px) 45vw, 30vw'}
                onclick={() => showPhoto(photo)}
              />
              <figcaption><span>{String(photo.sequence).padStart(2, '0')}</span>{photo.title}</figcaption>
            </figure>{/each}
        </div>
        {#if galleryPage < 3}<button class="load-more" onclick={() => (galleryPage += 1)}
            >继续看下一组 <span aria-hidden="true">↓</span></button
          >{:else}<p class="end-note" aria-live="polite">这一册，到这里。</p>{/if}
      </section>
    {:else}
      <section class="album-heading shell">
        <span class="small-caps">QUIET MOMENTS</span>
        <h1>留白，也有位置。</h1>
        <p class="story-deck">空内容、没有位置，以及暂时缺席的照片。</p>
      </section>
      <section class="states-grid shell">
        <article>
          <span class="state-number">01</span>
          <h2>故事还在路上。</h2>
          <p>这一册还没有照片。<br />下一次停留，再来翻开它。</p>
          <a class="text-link" href={url('country')}>看看其他相册 ↗</a>
        </article>
        <article>
          <span class="state-number">02</span>
          <h2>没有记录位置。</h2>
          <p>这些照片没有公开定位。<br />你仍可以在相册里，慢慢看。</p>
          <a class="text-link" href={url('story')}>返回相册 ↗</a>
        </article>
        <article>
          <div class="missing-photo"><span>照片暂不可用</span></div>
          <h2>城市留下的时间</h2>
          <p>影像暂时缺席，已经写下的故事仍在这里。</p>
        </article>
        <article>
          <span class="state-number">04 / 404</span>
          <h2>这一页，暂时合上了。</h2>
          <p>相册可能已下线，或地址已经失效。</p>
          <a class="text-link" href={url('home')}>回到首页 ↗</a>
        </article>
        <article>
          <span class="state-number">05 / LOADING</span>
          <div class="loading-sample" role="img" aria-label="照片加载占位示例"></div>
          <h2>影像即将展开。</h2>
          <p>保留照片位置，让等待时的页面也保持平稳。</p>
        </article>
        <article>
          <span class="state-number">06 / CONNECTION</span>
          <h2>连接暂时中断。</h2>
          <p>照片还在原来的地方。<br />连接恢复后，重新翻开这一册。</p>
          <a class="text-link" href={url('story')}>重新打开相册 ↗</a>
        </article>
      </section>
    {/if}
  </main>
  <footer class="site-footer shell" id="about">
    <div>
      <a class="footer-brand" href={url('home')}>{brand}<span aria-hidden="true">{exhibition ? '↗' : '·'}</span></a>
      <p>用照片，记录经过的地方。</p>
    </div>
    <div class="footer-right">
      <span>PHOTOGRAPHY & TRAVEL NOTES</span><a href="#main">回到顶部 ↑</a><a
        href="/design/credits"
        target={frame ? '_top' : undefined}>示例影像与来源</a
      >
    </div>
  </footer>
</div>
<dialog
  bind:this={dialog!}
  class="photo-dialog"
  class:dark={exhibition}
  onclose={() => {
    selected = null;
    lastTrigger?.focus();
  }}
  aria-label="照片浏览"
>
  {#if selected}<div class="viewer-header">
      <span
        >{selected.location}
        <span class="viewer-count"
          >/ {String(photoIndex + 1).padStart(2, '0')} — {String(activePhotos.length).padStart(2, '0')}</span
        ></span
      ><button onclick={closePhoto} aria-label="关闭照片">关闭 <span aria-hidden="true">×</span></button>
    </div>
    <div class="viewer-body">
      <button class="viewer-arrow previous" onclick={() => stepPhoto(-1)} aria-label="上一张">←</button>
      <div class="viewer-image">
        <img src={selected.src} alt={selected.alt} width={selected.width} height={selected.height} />
      </div>
      <button class="viewer-arrow next" onclick={() => stepPhoto(1)} aria-label="下一张">→</button>
    </div>
    <div class="viewer-caption">
      <h2>{selected.title}</h2>
      <p>{selected.description}</p>
      <span class="viewer-hint">← → 切换 · Esc 关闭</span>
    </div>{/if}
</dialog>
