<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="workspace">
  <aside>
    <a class="brand" href="/albums">Gallery / 管理</a>
    <nav><a href="/albums">相册工作台</a><a href="/visits">到访记录</a><a href="/maps">地图设置</a></nav>
  </aside>
  <main>{@render children()}</main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #f5f6f3;
    color: #263429;
    font-family: system-ui, sans-serif;
  }
  .workspace {
    display: grid;
    grid-template-columns: 210px 1fr;
    min-height: 100dvh;
  }
  aside {
    padding: 30px 24px;
    background: #fff;
    border-right: 1px solid #e0e4dc;
  }
  .brand {
    font-weight: 600;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  nav {
    display: grid;
    gap: 24px;
    margin-top: 40px;
    font-size: 13px;
  }
  main {
    padding: 40px;
    max-width: 1100px;
    min-width: 0;
  }
  :global(.map-admin h1) {
    font-size: 27px;
    font-weight: 550;
  }
  :global(.map-admin p) {
    color: #758070;
    font-size: 13px;
    line-height: 1.8;
  }
  :global(.map-admin button) {
    padding: 10px 15px;
    background: #36593e;
    color: white;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
  }
  :global(.map-admin button:disabled) {
    opacity: 0.5;
    cursor: default;
  }
  :global(.map-admin input:not([type='checkbox']):not([type='radio'])),
  :global(.map-admin select) {
    padding: 10px;
    border: 1px solid #d5ded1;
    border-radius: 4px;
    background: white;
    color: inherit;
    box-sizing: border-box;
    max-width: 100%;
  }
  :global(.map-admin label) {
    font-size: 13px;
  }
  :global(.map-admin .notice) {
    background: #e7efdf;
    padding: 12px 16px;
    border-radius: 4px;
  }
  :global(.map-admin .error) {
    background: #fff0e8;
    color: #903c26;
  }
  @media (max-width: 700px) {
    .workspace {
      display: block;
    }
    aside {
      padding: 18px;
    }
    nav {
      display: flex;
      margin-top: 15px;
      gap: 20px;
    }
    main {
      padding: 20px;
    }
  }
</style>
