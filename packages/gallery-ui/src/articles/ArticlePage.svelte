<script lang="ts">
  import PublicFrame from '../PublicFrame.svelte';
  import ArticleReader from './ArticleReader.svelte';
  import { articleImageKey, type ArticleContent, type ArticleImage } from '../../../gallery-core/src/article';
  import type { ContactLink } from '../../../gallery-core/src/content';
  let {
    site,
    article,
    linkOrigin = '',
    editHref = '',
  }: {
    site: { name: string; contactLinks?: ContactLink[]; copyrightName?: string; footerText?: string };
    article: Pick<ArticleContent, 'title' | 'document'> & {
      firstPublishedAt?: string | null;
      publishedAt?: string | null;
      images: Record<string, ArticleImage>;
      related: { title: string; href: string }[];
    };
    linkOrigin?: string;
    editHref?: string;
  } = $props();
</script>

<PublicFrame {site} active="records" {linkOrigin}>
  <div class="back">
    {#if editHref}
      <a href={editHref} data-sveltekit-reload>← 返回编辑</a>
      <span role="status">草稿预览 · 仅登录管理员可见，尚未发布的修改不会公开</span>
    {:else}
      <a href="/records">← 全部记录</a>
    {/if}
  </div>
  <ArticleReader
    title={article.title || '未命名文章'}
    firstPublishedAt={article.firstPublishedAt}
    publishedAt={article.publishedAt}
    document={article.document}
    resolveImage={(node) => article.images[articleImageKey(node)] ?? null}
    related={article.related}
  />
</PublicFrame>

<style>
  .back {
    max-width: 1090px;
    margin: 24px auto 0;
    font-size: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    color: #7b8378;
  }
  .back a {
    color: #6c7b65;
    text-decoration: none;
  }
</style>
