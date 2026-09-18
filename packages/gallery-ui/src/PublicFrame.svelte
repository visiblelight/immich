<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ContactLink } from '../../gallery-core/src/content';
  import PublicHeader from './PublicHeader.svelte';
  let {
    site,
    active = 'albums',
    preview = false,
    linkOrigin = '',
    children,
  }: {
    site: {
      name: string;
      tagline?: string;
      contactLinks?: ContactLink[];
      copyrightName?: string;
      footerText?: string;
    };
    active?: string;
    preview?: boolean;
    linkOrigin?: string;
    children: Snippet;
  } = $props();
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Tab') document.documentElement.dataset.keyboardFocus = 'true';
  }}
  onpointerdown={() => {
    document.documentElement.dataset.keyboardFocus = 'false';
  }}
/>
<div class="public-site public-shell">
  <PublicHeader name={site.name} {active} {preview} {linkOrigin} />
  <div class="public-content">{@render children()}</div>
  <footer class="public-footer">
    {#if site.contactLinks?.length}<nav aria-label="联系链接">
        {#each site.contactLinks as link}<a href={link.url} rel="noreferrer">{link.label}</a>{/each}
      </nav>{/if}
    {#if site.footerText}<p>{site.footerText}</p>{/if}
    <p>© {new Date().getFullYear()} {site.copyrightName || site.name}</p>
  </footer>
</div>

<style>
  .public-shell {
    box-sizing: border-box;
    max-width: 1680px;
    margin: 0 auto;
    padding: 0 5%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .public-content {
    flex: 1;
    min-width: 0;
  }
  .public-footer {
    padding: 14px 0;
    border-top: 1px solid #e4e7e0;
    text-align: center;
    color: #7e897c;
    font-size: 12px;
    line-height: 1.8;
  }
  .public-footer p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .public-footer > * + * {
    margin-top: 6px;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 20px;
    margin: 0;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    color: #344d3d;
  }
  @media (max-width: 600px) {
    .public-shell {
      padding: 0 18px;
    }
    .public-footer {
      padding: 14px 0;
    }
  }
</style>
