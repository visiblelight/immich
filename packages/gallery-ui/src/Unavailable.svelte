<script lang="ts">
  let { status, message }: { status: number; message: string } = $props();
</script>

<svelte:head>
  <title>Gallery — 暂时无法访问</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
  <p>{status}</p>
  <h1>{message}</h1>
  <p>请稍后再试。</p>
</main>

<style>
  main {
    max-width: 36rem;
    margin: 15vh auto;
    padding: 1.5rem;
    font: 1rem/1.6 system-ui, sans-serif;
  }
  h1 {
    font-size: 1.5rem;
  }
</style>
