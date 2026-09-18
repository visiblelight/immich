<script lang="ts">
  import { ArticlePage } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head>
  <title>草稿预览 · {data.article.title || '未命名文章'}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>
<ArticlePage
  site={data.site}
  article={data.article}
  linkOrigin={data.publicOrigin}
  editHref={`/articles/${data.article.id}`}
/>
