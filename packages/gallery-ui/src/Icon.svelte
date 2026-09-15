<script lang="ts">
  let {
    name,
    size = 18,
  }: {
    name: 'info' | 'fullscreen' | 'copy' | 'close' | 'stack' | 'left' | 'right' | 'exit';
    size?: number;
  } = $props();
  const paths = {
    info: 'M12 11v6 M12 7h.01',
    fullscreen: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
    copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
    close: 'm6 6 12 12 M18 6 6 18',
    stack: 'M7 7h14v14H7z M17 7V3H3v14h4',
    left: 'm14 5-7 7 7 7',
    right: 'm10 5 7 7-7 7',
    exit: 'M8 3v5H3 M16 3v5h5 M3 16h5v5 M21 16h-5v5',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  >{#if name === 'info'}<circle cx="12" cy="12" r="9" />{/if}<path d={paths[name]} /></svg
>
