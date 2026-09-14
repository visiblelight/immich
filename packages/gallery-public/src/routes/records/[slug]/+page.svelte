<script lang="ts">
  import { ArticleReader, PublicHeader } from '@gallery/ui';
  import { articleImageKey, type ArticleNode } from '@gallery/core';
  let { data } = $props();
</script>

<svelte:head
  ><title>{data.article.title} · {data.site.name}</title><meta
    name="description"
    content={data.article.summary}
  /></svelte:head
>
<div class="public-site" style="padding:0 4vw">
  <PublicHeader name={data.site.name} active="records" />
  <div class="back"><a href="/records">← 全部记录</a></div>
  <ArticleReader
    title={data.article.title}
    firstPublishedAt={data.article.firstPublishedAt}
    publishedAt={data.article.publishedAt}
    document={data.article.document}
    resolveImage={(node: ArticleNode) => data.article.images[articleImageKey(node)] ?? null}
    related={data.article.related}
  />
</div>

<style>
  .back {
    max-width: 1090px;
    margin: 24px auto 0;
    font-size: 12px;
  }
  .back a {
    color: #6c7b65;
    text-decoration: none;
  }
</style>
