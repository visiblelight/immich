<script lang="ts">
  import {
    articleHeadings,
    articleTime,
    articleText,
    renderArticle,
    type ArticleDocument,
    type ArticleImageResolver,
    type ArticleNode,
  } from '../../../gallery-core/src/article';
  import './article.css';
  import { onMount } from 'svelte';
  import Icon from '../Icon.svelte';
  import { exitViewerFullscreen, enterViewerFullscreen } from '../viewer-fullscreen';
  let copied = $state(false);
  let focusView = $state(false);
  function focusImage(value: boolean) {
    focusView = value;
    if (value) void enterViewerFullscreen();
    else void exitViewerFullscreen();
  }
  onMount(() => {
    const changed = () => {
      if (!window.document.fullscreenElement) focusView = false;
    };
    window.document.addEventListener('fullscreenchange', changed);
    return () => window.document.removeEventListener('fullscreenchange', changed);
  });
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
    } catch {
      copied = false;
    }
  }

  let {
    title,
    date = '',
    firstPublishedAt = null,
    publishedAt = null,
    document,
    resolveImage,
    related = [],
  }: {
    title: string;
    date?: string;
    firstPublishedAt?: string | null;
    publishedAt?: string | null;
    document: ArticleDocument;
    resolveImage: ArticleImageResolver;
    related?: { title: string; href: string }[];
  } = $props();
  let dialog: HTMLDialogElement;
  let current = $state(0);
  let active = $state(false);
  const headings = $derived(articleHeadings(document));
  const html = $derived(renderArticle(document, resolveImage));
  const images = $derived.by(() => {
    const nodes: ArticleNode[] = [];
    const visit = (node: ArticleNode) => {
      if (node.type === 'galleryImage') nodes.push(node);
      node.content?.forEach(visit);
    };
    visit(document.doc);
    return nodes.map(resolveImage);
  });
  const minutes = $derived(Math.max(1, Math.ceil(articleText(document.doc).length / 350)));
  function openImage(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-article-image]');
    if (button) {
      current = Number(button.dataset.articleImage);
      dialog.showModal();
      active = true;
    }
  }
  function move(direction: number) {
    let next = current + direction;
    while (next >= 0 && next < images.length && !images[next]) next += direction;
    if (next >= 0 && next < images.length) current = next;
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (!active) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    }
  }}
/>
<div class="article-layout">
  <article>
    <header class="article-heading">
      <h1>{title}</h1>
      <p>
        {#if firstPublishedAt}<time datetime={firstPublishedAt} title="北京时间 UTC+8"
            >发布于 {articleTime(firstPublishedAt)}</time
          ><span>·</span>
          {#if publishedAt && publishedAt !== firstPublishedAt}<time datetime={publishedAt} title="北京时间 UTC+8"
              >更新于 {articleTime(publishedAt)}</time
            ><span>·</span>{/if}
        {:else if date}<time datetime={date}>{date.replaceAll('-', '.')}</time><span>·</span>{/if}约 {minutes} 分钟
      </p>
    </header>
    {#if headings.length}<details class="mobile-toc">
        <summary>文章目录</summary>
        <nav aria-label="文章目录">
          {#each headings as item}<a class:sub={item.level === 3} href={'#' + item.id}>{item.text}</a>{/each}
        </nav>
      </details>{/if}
    <!-- Buttons in the sanitized renderer are keyboard-accessible; clicks bubble here. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="article-prose" onclick={openImage}>{@html html}</div>
    {#if related.length}<footer>
        <span>相关相册</span>
        <div>
          {#each related as album}<a href={album.href}>{album.title} <span aria-hidden="true">↗</span></a>{/each}
        </div>
      </footer>{/if}
  </article>
  {#if headings.length}<aside class="desktop-toc">
      <span>本文目录</span>
      <nav aria-label="文章目录">
        {#each headings as item}<a class:sub={item.level === 3} href={'#' + item.id}>{item.text}</a>{/each}
      </nav>
    </aside>{/if}
</div>
<dialog
  bind:this={dialog}
  class="immersive"
  oncancel={(event) => {
    if (focusView) {
      event.preventDefault();
      focusImage(false);
    }
  }}
  aria-label="文章图片"
  onclose={() => {
    active = false;
    focusView = false;
    copied = false;
    void exitViewerFullscreen();
  }}
>
  {#if images[current]}<img src={images[current]!.preview} alt={images[current]!.alt} />{/if}
  {#if focusView}<button class="focus-exit" aria-label="退出全屏欣赏" onclick={() => focusImage(false)}
    ></button>{:else}<div class="viewer-tools">
      <button
        onclick={() => move(-1)}
        disabled={!images.slice(0, current).some(Boolean)}
        aria-label="上一张"
        title="上一张"><Icon name="left" /></button
      >
      <span>{current + 1} / {images.length}</span>
      <button
        onclick={() => move(1)}
        disabled={!images.slice(current + 1).some(Boolean)}
        aria-label="下一张"
        title="下一张"><Icon name="right" /></button
      >
      <button onclick={() => focusImage(true)} aria-label="全屏欣赏" title="全屏欣赏"><Icon name="fullscreen" /></button
      >
      <button onclick={copyLink} aria-label="复制文章链接" title={copied ? '链接已复制' : '复制文章链接'}
        ><Icon name="copy" /></button
      >
      <button onclick={() => dialog.close()} aria-label="关闭图片" title="关闭（Esc）"><Icon name="close" /></button>
      <span class="sr-status" role="status">{copied ? '链接已复制' : ''}</span>
    </div>{/if}
</dialog>

<style>
  .article-layout {
    max-width: 1090px;
    margin: 42px auto 100px;
    display: grid;
    grid-template-columns: minmax(0, 740px) 180px;
    gap: 80px;
    justify-content: center;
  }
  article {
    min-width: 0;
  }
  .article-heading {
    margin-bottom: 35px;
  }
  h1 {
    font-size: clamp(25px, 2.5vw, 33px);
    line-height: 1.5;
    font-weight: 600;
    letter-spacing: -0.7px;
    color: #2d4031;
    margin: 0 0 14px;
  }
  .article-heading p {
    display: flex;
    gap: 12px;
    color: #7b8378;
    font-size: 13px;
    margin: 0;
  }
  .desktop-toc {
    align-self: start;
    position: sticky;
    top: 35px;
    border-left: 1px solid #e0e5db;
    padding-left: 22px;
    margin-top: 7px;
  }
  .desktop-toc > span {
    font-size: 12px;
    color: #8a9185;
  }
  nav {
    display: grid;
    gap: 16px;
    margin-top: 18px;
  }
  nav a {
    font-size: 13px;
    line-height: 1.7;
    text-decoration: none;
    color: #6a7765;
  }
  nav a:hover {
    color: #274d35;
  }
  nav a.sub {
    padding-left: 12px;
  }
  .mobile-toc {
    display: none;
  }
  footer {
    margin-top: 50px;
    border-top: 1px solid #e0e5db;
    padding-top: 25px;
  }
  footer > span {
    font-size: 13px;
    color: #7b8378;
  }
  footer div {
    display: flex;
    flex-wrap: wrap;
    gap: 15px 30px;
    margin-top: 15px;
  }
  footer a {
    text-decoration: none;
    color: #435e46;
    font-size: 14px;
  }
  .immersive {
    position: fixed;
    inset: 0;
    margin: 0;
    width: 100vw;
    max-width: none;
    height: 100dvh;
    max-height: none;
    padding: 0;
    border: 0;
    background: #111713;
    color: white;
  }
  .immersive img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .viewer-tools {
    position: absolute;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 14px;
    background: #152019dd;
    padding: 8px 14px;
    border-radius: 40px;
    font-size: 13px;
    white-space: nowrap;
  }
  .viewer-tools button {
    font: inherit;
    color: white;
    border: 0;
    background: transparent;
    padding: 8px;
    cursor: pointer;
  }
  .viewer-tools button:disabled {
    opacity: 0.3;
  }
  @media (max-width: 1000px) {
    .article-layout {
      gap: 36px;
      grid-template-columns: minmax(0, 720px) 155px;
    }
  }
  @media (max-width: 780px) {
    .article-layout {
      display: block;
      max-width: 720px;
      margin-top: 28px;
    }
    .desktop-toc {
      display: none;
    }
    .mobile-toc {
      display: block;
      margin-bottom: 28px;
      padding: 14px 0;
      border-top: 1px solid #e0e5db;
      border-bottom: 1px solid #e0e5db;
      font-size: 13px;
      color: #64705e;
    }
    summary {
      cursor: pointer;
    }
  }
  .viewer-tools {
    top: 10px;
    right: 12px;
    bottom: auto;
    left: auto;
    transform: none;
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
  }
  .viewer-tools button {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 50%;
  }
  .viewer-tools button:hover {
    background: #ffffff14;
  }
  .viewer-tools span {
    padding: 0 8px;
  }
  .viewer-tools .sr-status:empty {
    display: none;
  }
  @media (max-width: 600px) {
    .viewer-tools button {
      width: 40px;
      height: 40px;
    }
    .viewer-tools {
      right: 6px;
      gap: 0;
    }
    .viewer-tools .sr-status {
      position: absolute;
      top: 50px;
      right: 4px;
    }
  }
  .focus-exit {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
    width: 100%;
    height: 100%;
  }
</style>
