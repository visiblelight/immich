<script lang="ts">
  import { getContext, type Snippet } from 'svelte';
  const community = getContext<{ accountControl?: Snippet } | undefined>('gallery-community-header');
  let {
    name,
    active = 'albums',
    preview = false,
    linkOrigin = '',
    recordsHref = '/records',
    aboutHref = '/about',
    accountControl,
  }: {
    name: string;
    active?: string;
    preview?: boolean;
    linkOrigin?: string;
    recordsHref?: string;
    aboutHref?: string;
    accountControl?: Snippet;
  } = $props();
  const account = $derived(accountControl ?? community?.accountControl);
</script>

<header class="public-header" class:with-records={!!recordsHref} class:with-account={!!account}>
  <a class="brand" href={linkOrigin + '/albums'}>{name}</a>
  <nav aria-label="主导航">
    {#each [['albums', '相册'], ['photos', '相片'], ['visited', '去过'], ...(recordsHref ? [['records', '记录']] : []), ['about', '关于']] as [id, label]}
      {#if !preview || id === 'albums'}<a
          href={linkOrigin + (id === 'records' ? recordsHref : id === 'about' ? aboutHref : `/${id}`)}
          aria-current={active === id ? 'page' : undefined}>{label}</a
        >{/if}
    {/each}
  </nav>
  {#if account}<div class="account-control">{@render account()}</div>{/if}
</header>

<style>
  :global(html) {
    scrollbar-gutter: stable;
  }
  :global(html:has(dialog[data-gallery-viewer][open])) {
    overflow: hidden;
    scrollbar-gutter: auto;
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
  .with-account nav {
    margin-left: auto;
  }
  .account-control {
    display: flex;
    align-items: center;
    flex: none;
  }
  @media (max-width: 700px) {
    .public-header.with-account {
      height: auto;
      min-height: 96px;
      flex-wrap: wrap;
      gap: 0 16px;
      padding-top: 16px;
    }
    .with-account .brand {
      max-width: calc(100% - 70px);
    }
    .with-account nav {
      order: 3;
      width: 100%;
      justify-content: space-between;
      margin: 4px 0 0;
      gap: 14px;
    }
    .account-control {
      margin-left: auto;
    }
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
    outline: 1px solid #88978b;
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
    .with-records nav {
      gap: 12px;
    }
    nav a {
      font-size: 13px;
    }
  }
  @media (max-width: 360px) {
    .with-records nav {
      gap: 9px;
    }
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
    outline: 1px solid #88978b;
    outline-offset: 3px;
  }
  :global(.public-site :is(button, a, input, select, summary):focus:not(:focus-visible)) {
    outline: none;
    box-shadow: none;
  }
  :global(html:not([data-keyboard-focus='true']) .public-site :focus) {
    outline: none;
    box-shadow: none;
  }
</style>
