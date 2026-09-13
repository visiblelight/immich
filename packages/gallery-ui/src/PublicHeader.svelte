<script lang="ts">
  let {
    name,
    active = 'albums',
    preview = false,
  }: { name: string; active?: string; preview?: boolean } = $props();
</script>

<header class="public-header">
  <a class="brand" href="/albums">{name}</a>
  <nav aria-label="主导航">
    {#each [['albums', '相册'], ['photos', '相片'], ['visited', '去过'], ['about', '关于']] as [id, label]}
      {#if !preview || id === 'albums'}<a href={`/${id}`} aria-current={active === id ? 'page' : undefined}
          >{label}</a
        >{/if}
    {/each}
  </nav>
</header>

<style>
  :global(html) {
    scrollbar-gutter: stable;
  }
  :global(body) {
    margin: 0;
    background: #fafbf9;
    color: #2f3731;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  }
  .public-header {
    height: 80px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    border-bottom: 1px solid #e4e7e0;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .brand {
    font-family: Georgia, 'Songti SC', serif;
    font-size: 24px;
    font-weight: 650;
    white-space: nowrap;
  }
  nav {
    display: flex;
    gap: 28px;
    flex: none;
  }
  nav a {
    font-size: 14px;
    line-height: 24px;
    padding: 8px 0;
    color: #737d72;
    border-bottom: 1px solid transparent;
  }
  nav a[aria-current] {
    color: #344d3d;
    border-bottom-color: currentColor;
  }
  nav a:hover {
    color: #344d3d;
  }
  a:focus-visible {
    outline: 2px solid #52765c;
    outline-offset: 5px;
    border-radius: 2px;
  }
  @media (max-width: 600px) {
    .public-header {
      height: 68px;
      gap: 12px;
    }
    .brand {
      font-size: 18px;
      max-width: 40%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    nav {
      gap: 18px;
    }
    nav a {
      font-size: 13px;
    }
  }
  @media (max-width: 360px) {
    nav {
      gap: 12px;
    }
  }

  :global(.public-site select:not([multiple])) {
    appearance: none;
    font: inherit;
    box-sizing: border-box;
    max-width: 100%;
    border: 1px solid #dce2d6;
    border-radius: 5px;
    padding: 10px 36px 10px 12px;
    background: white
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23727e70' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 12px center;
  }
  :global(.public-site :is(button, a, input, select, summary):focus-visible) {
    outline: 2px solid #64826a;
    outline-offset: 3px;
  }
</style>
