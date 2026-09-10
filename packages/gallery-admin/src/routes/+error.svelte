<script lang="ts">
  import { page } from '$app/state';
  import { Unavailable } from '@gallery/ui';
</script>

<Unavailable status={page.status} message={page.error?.message ?? '暂时无法访问'} />
