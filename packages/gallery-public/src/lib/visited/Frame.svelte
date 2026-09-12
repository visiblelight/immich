<script lang="ts">
  import type { Snippet } from 'svelte';
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div class="frame">
  <header>
    <a class="brand" href="/albums">{name}</a>
    <nav aria-label="主导航">
      <a href="/albums">相册</a><a href="/photos">相片</a><a class="active" href="/visited">去过</a><a href="/about"
        >关于</a
      >
    </nav>
  </header>
  <main>{@render children()}</main>
  <footer>{name} · 旅行与日常</footer>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #faf9f5;
    color: #303b32;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }
  .frame {
    max-width: 1560px;
    margin: auto;
    padding: 0 5%;
  }
  header {
    height: 86px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e4e5dc;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .brand {
    font-size: 20px;
    letter-spacing: 2px;
  }
  nav {
    display: flex;
    gap: 28px;
    font-size: 13px;
  }
  nav a {
    color: #8c9086;
  }
  nav .active {
    color: #344d3d;
  }
  footer {
    font-size: 11px;
    color: #94988d;
    padding: 30px 0;
    border-top: 1px solid #e4e5dc;
  }
  @media (max-width: 600px) {
    header {
      height: 70px;
    }
    .brand {
      font-size: 16px;
    }
    nav {
      gap: 17px;
    }
    .frame {
      padding: 0 18px;
    }
  }
</style>
