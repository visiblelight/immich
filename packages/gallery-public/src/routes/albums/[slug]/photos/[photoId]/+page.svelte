<script lang="ts">
  import AlbumView from '$lib/AlbumView.svelte';
  let { data } = $props();
</script>

<svelte:head
  ><title>{data.photoTitle || '照片'} · {data.active?.title}</title><meta
    name="description"
    content={data.photoDescription}
  /><link rel="canonical" href={`${data.origin}/albums/${data.active?.slug}/photos/${data.photoId}`} /></svelte:head
>
<AlbumView {data} />
<noscript
  ><h1>{data.photoTitle || '照片'}</h1>
  <p>{data.photoDescription}</p>
  <a href={`/albums/${data.active?.slug}`}>返回相册</a></noscript
>
