<script lang="ts">
  import type { Snippet } from 'svelte';
  import { PublicHeader } from '@gallery/ui';
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div class="frame public-site">
  <PublicHeader {name} active="visited" />
  <main>{@render children()}</main>
  <footer>© {new Date().getFullYear()} {name}</footer>
</div>

<style>
  .frame {
    max-width: 1680px;
    box-sizing: border-box;
    margin: auto;
    padding: 0 5%;
  }
  footer {
    font-size: 12px;
    color: #899281;
    padding: 28px 0;
    border-top: 1px solid #e4e7e0;
  }
  @media (max-width: 600px) {
    .frame {
      padding: 0 18px;
    }
  }
</style>
