<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { GalleryUser } from '@gallery/core';
  import AdminSidebar from './AdminSidebar.svelte';
  import './design/admin.css';
  let {
    children,
    active,
    user,
    publicOrigin,
  }: { children: Snippet; active: 'maps' | 'visits'; user: GalleryUser; publicOrigin: string } = $props();
</script>

<div class="workspace live-workspace">
  <AdminSidebar {active} {user} {publicOrigin} />
  <main class="main">
    <div class="topline">
      <span>工作台 / {active === 'maps' ? '地图设置' : '到访记录'}</span><a
        href="/login"
        target="_blank"
        rel="noreferrer">登录页</a
      >
    </div>
    {@render children()}
  </main>
</div>

<style>
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
  :global(.map-admin input[type='checkbox']),
  :global(.map-admin input[type='radio']) {
    width: auto;
  }
</style>
