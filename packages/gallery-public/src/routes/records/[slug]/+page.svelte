<script lang="ts">
  import { ArticlePage } from '@gallery/ui';
  import Panel from '$lib/community/Panel.svelte';
  import { communityClient } from '$lib/community/context';
  const community = communityClient();
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.article.title} · {data.site.name}</title>
  <meta name="description" content={data.article.summary} />
</svelte:head>
{#snippet interaction()}<Panel target={{ kind: 'article', id: data.article.id }} mode="comments" />{/snippet}
<ArticlePage
  site={data.site}
  article={data.article}
  interaction={community.enabled && community.settings.showComments ? interaction : undefined}
/>
