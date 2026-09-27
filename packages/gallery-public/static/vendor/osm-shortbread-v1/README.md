# OSM Shortbread display assets

Gallery hosts the display assets itself. OSM's `/styles/` demonstration endpoint
restricts cross-origin use to OSM and development origins. It is not a public
third-party style/font/sprite hosting service. No proxy or forged Referer is used.

- `style.json`: VersaTiles Style **5.13.0**, `colorful/style.json` from
  <https://github.com/versatiles-org/versatiles-style/releases/tag/v5.13.0>.
  Source archive SHA-256: `71d34eb7c759553ee6ed3667264d9d871b2045fe2e840de948a5cf4363a05b3c`.
  Only resource URLs changed: fonts/sprites are relative to this file; vector
  tiles use `https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt`.
- Basic sprites: the same **5.13.0** release, 1x and 2x sheets, CC0.
- Noto Sans regular/bold glyphs: VersaTiles Fonts **2.1.0**, SIL OFL 1.1.
  <https://github.com/versatiles-org/versatiles-fonts/releases/tag/v2.1.0>.
  Full published ranges retained for local-language fallback; no geographic subset.
- Licenses are in `LICENSE-style.txt`, `LICENSE-icons.txt`, `LICENSE-fonts.txt`.

`scripts/prepare-map-assets.mjs` installs the two fixed, SHA-256-checked release
archives before development/build. Generated assets are ignored by Git and copied
into the production image by the normal Svelte build. Subsequent local builds
verify each file against the generated manifest. GitHub is needed at build time
only; visitors load styles, fonts and sprites from Gallery, without GitHub access.

This downloads **display assets only**, never map tiles. Tiles are fetched by
visitors for the current viewport under the [OSM vector policy](https://operations.osmfoundation.org/policies/vector/),
with normal browser caching, attribution and Referer. This does not guarantee
third-party service availability. Vector errors trigger a single attempt to use
standard raster tiles, which retain local-language labels.
