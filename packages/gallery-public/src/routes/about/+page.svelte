<script lang="ts">
  import { Gallery, PublicFrame, ArticleReader } from '@gallery/ui';
  import { articleImageKey, type ArticleNode } from '@gallery/core';
  let { data } = $props();
</script>

<svelte:head><title>关于 · {data.site.name}</title><meta name="description" content={data.site.tagline} /></svelte:head>
{#if data.article}<PublicFrame site={data.site} active="about"
    ><main>
      <ArticleReader
        title={data.article.title}
        firstPublishedAt={data.article.firstPublishedAt}
        publishedAt={data.article.publishedAt}
        document={data.article.document}
        resolveImage={(node: ArticleNode) => data.article!.images[articleImageKey(node)] ?? null}
      />
    </main></PublicFrame
  >{:else}<Gallery site={data.site} albums={data.albums} about />{/if}
