// The OSM demonstration style is not a third-party hosting service. Keep the
// old preset readable, but serve its licensed display assets with Gallery.
export const OSM_VECTOR_STYLE = '/vendor/osm-shortbread-v1/style.json';
export const OSM_RASTER_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export function osmStyleUrl(url: string) {
  return url === 'https://vector.openstreetmap.org/styles/shortbread/colorful.json' ? OSM_VECTOR_STYLE : url;
}
