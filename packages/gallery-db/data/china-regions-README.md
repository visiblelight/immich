# Offline China province assignment

The region geometry is derived from Natural Earth's **v5.1.2 repository tag**, using
its **1:10m admin-1 layer 5.1.1** plus the same admin-0 source used by the existing
world map. Natural Earth's [terms](https://www.naturalearthdata.com/about/terms-of-use/)
place all versions in the **public domain**, independently of Gallery's AGPL code.
The [publisher's layer documentation](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/)
explains the resolution and default de facto coverage. These are generalized
cartographic boundaries, not cadastral/legal boundary determinations.

`china-regions-source.json` records both fixed source URLs and SHA-256 checksums,
the uncompressed output checksum, and every input-to-Gallery code mapping.
`china-regions-5.1.2.json.gz` contains 34 groups in WGS84 longitude/latitude. All
source vertices, polygon holes and represented islands are retained; no additional
simplification or nearest-province fallback is applied. Each coordinate is looked
up offline; deployment neither downloads boundaries nor sends GPS to a geocoder.

The 31 mainland groups use admin-1. The source's separate Paracel feature belongs
to the CN-HI group. Hong Kong, Macao and Taiwan use the source's **admin-0 external
outlines**, so their internal districts do not introduce artificial ambiguous
province boundaries. All three remain in CN, matching the existing world map.
Unrepresented small/coastal islands, disputed gaps, exact shared edges and
multiple-region overlaps remain unknown; these need manual review rather than a
guessed assignment. A successful province lookup is accepted only after the
existing country lookup has established CN.

The original display/cartogram SVG is unrelated to these boundaries and must never
be used for location assignment. Populated-place text also cannot establish a
province. Exact public locations may expose the derived province; approximate
locations still expose only the safe country. Hidden locations expose nothing.

To reproduce after downloading the two exact source files listed in the manifest:

```sh
node packages/gallery-db/scripts/prepare-regions.ts /path/to/ne_10m_admin_1_states_provinces.geojson /path/to/ne_10m_admin_0_countries.geojson
```

Use the repository's pinned Node runtime. The script rejects changed checksums
before writing either output. Raw input files are not required at runtime.
GeoNames province IDs remain aliases for the new `region:CN-*` IDs; existing
manual photo assignments are still bound to the live Immich GPS fingerprint.
Province label merges cannot change geographic membership. A manual city/province
that conflicts with a reliable current boundary is flagged for review and does
not override that boundary's public province. A direct manual province assignment
is allowed when the country is reliable and no conflicting province is proven.
