<script lang="ts">
  import { Gallery, PublicHeader, ArticleReader } from '@gallery/ui';
  import { articleImageKey, type ArticleNode } from '@gallery/core';
  let { data } = $props();
</script>

<svelte:head><title>关于 · {data.site.name}</title></svelte:head>
{#if data.article}<div class="public-site" style="padding:0 4vw">
    <PublicHeader name={data.site.name} active="about" /><ArticleReader
      title={data.article.title}
      firstPublishedAt={data.article.firstPublishedAt}
      publishedAt={data.article.publishedAt}
      document={data.article.document}
      resolveImage={(node: ArticleNode) => data.article!.images[articleImageKey(node)] ?? null}
    />
  </div>{:else}<Gallery site={data.site} albums={data.albums} about />{/if}
