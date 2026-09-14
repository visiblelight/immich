<script lang="ts">
  import ArticleEditor from '$lib/articles/ArticleEditor.svelte';
  let { data } = $props();
</script>

{#key data.article.id}<ArticleEditor initial={data} />{/key}
