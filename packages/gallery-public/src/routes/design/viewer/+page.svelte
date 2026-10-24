<script lang="ts">
  import { Gallery } from '@gallery/ui';
  import type { DisplayAlbum, DisplayPhoto } from '@gallery/core';

  const photos: DisplayPhoto[] = ['street', 'mountains', 'detail'].map((image, index) => ({
    id: image, src: `/design-assets/${image}.jpg`, thumbnail: `/design-assets/${image}-small.jpg`,
    title: ['街道 · 竖图示例', '山地 · 横图示例', '建筑细节'][index]!, alt: '看图器布局验证示例',
    description: '示例影像用于验证图片、拍摄时间、位置和相机信息的布局。',
    localTakenAt: '2025-10-01T12:30:00', timeZone: 'Asia/Tbilisi',
    latitude: 41.7, longitude: 44.8,
    places: [{ id: 'country:GE', name: '格鲁吉亚', kind: 'country' }, { id: 'sample-city', name: '第比利斯', kind: 'city' }],
    exif: { make: 'Sony', model: 'ILCE-7CR', lensModel: 'FE 20-70mm F4 G', focalLength: 35, fNumber: 8, iso: 100, exposureTime: '1/250' },
    ...(index < 2 ? { group: { id: 'sample-group', title: '横竖图切换', description: '照片组布局示例', cover: 'street' } } : {}),
  }));
  const album: DisplayAlbum = { id: 'viewer-sample', slug: 'viewer-sample', title: '看图器布局预览',
    summary: '仅示例数据，可查看横竖图、照片组与信息栏。影像来源见 /design/credits。', parent: '', blocks: [],
    cover: photos[0]!.thumbnail, count: photos.length, photos };
</script>

<svelte:head><title>看图器布局预览 · Gallery</title></svelte:head>
<Gallery site={{ name: 'Gallery', tagline: '示例预览' }} albums={[album]} active={album} />
