<script lang="ts">
  import type { GalleryUser } from '@gallery/core';
  import { goto } from '$app/navigation';
  let {
    active,
    user,
    publicOrigin,
    onNavigate,
  }: { active: string; user: GalleryUser; publicOrigin: string; onNavigate?: (target: string) => void } = $props();
  const entries = [
    ['albums', '▦', '相册'],
    ['visits', '◎', '到访记录'],
    ['maps', '⌘', '地图设置'],
    ['settings', '⚙', '站点设置'],
  ] as const;
  function navigate(target: string) {
    if (onNavigate) onNavigate(target);
    else void goto('/' + target);
  }
</script>

<aside class="sidebar admin-sidebar">
  <a
    class="brand"
    href="/albums"
    onclick={(e) => {
      e.preventDefault();
      navigate('albums');
    }}><span class="brand-mark">G</span><span>Gallery<small>创作工作台</small></span></a
  >
  <p class="nav-label">内容管理</p>
  <nav aria-label="后台导航">
    {#each entries as [target, icon, label]}<button
        class:active={active === target}
        aria-current={active === target ? 'page' : undefined}
        onclick={() => navigate(target)}
        ><span class="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></button
      >{/each}
  </nav>
  <div class="sidebar-bottom">
    <a class="connection" href={publicOrigin + '/albums'} target="_blank" rel="noreferrer">↗ 打开 Gallery 前台</a
    ><button
      class="account"
      class:active={active === 'account'}
      aria-label="个人账号"
      onclick={() => navigate('account')}
      ><span class="avatar">{user.displayName.slice(0, 1)}</span><span
        >{user.displayName}<small>Gallery 管理员</small></span
      ></button
    >
  </div>
</aside>

<style>
  .nav-icon {
    flex: 0 !important;
    width: 18px;
  }
  .admin-sidebar nav {
    width: 100%;
  }
  @media (max-width: 780px) {
    .admin-sidebar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
    }
    .admin-sidebar nav {
      grid-row: 2;
      grid-column: 1/-1;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }
    .admin-sidebar nav button {
      justify-content: center;
      gap: 6px;
      padding: 10px 4px;
      white-space: nowrap;
    }
    .sidebar-bottom {
      grid-column: 2;
      grid-row: 1;
    }
    .admin-sidebar .nav-label {
      display: none;
    }
    .nav-icon {
      display: none;
    }
  }
</style>
