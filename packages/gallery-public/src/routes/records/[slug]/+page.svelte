<script lang="ts">
  import { ArticlePage } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.article.title} · {data.site.name}</title>
  <meta name="description" content={data.article.summary} />
</svelte:head>
<ArticlePage site={data.site} article={data.article} />
