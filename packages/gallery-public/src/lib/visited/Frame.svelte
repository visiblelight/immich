<script lang="ts">
  import type { Snippet } from 'svelte';
  import { PublicFrame } from '@gallery/ui';
  import type { ContactLink } from '@gallery/core';
  let {
    name,
    site,
    children,
  }: {
    name: string;
    site?: {
      name: string;
      copyrightName?: string;
      footerText?: string;
      contactLinks?: ContactLink[];
    };
    children: Snippet;
  } = $props();
</script>

<PublicFrame site={site ?? { name }} active="visited"><main>{@render children()}</main></PublicFrame>
