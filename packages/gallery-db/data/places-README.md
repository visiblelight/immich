# Offline Gallery place names

Derived from [GeoNames export](https://download.geonames.org/export/dump/), downloaded 2026-10-05, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is included in the public location filter and administration UI. The dataset license is separate from the application's AGPL code license.

`places-source.json` records input/output SHA-256 checksums. `places.json.gz` contains a compact subset of cities500, admin1CodesASCII and Chinese/English alternateNamesV2: 235,917 populated places, 77,737 localized entries. This is not a city-boundary dataset. Country grouping follows the existing Natural Earth map policy.

`places-editorial.json` adds the user-supplied Chinese name 埃里温 and alias 耶烈万 for Yerevan. Site-specific corrections belong in the Gallery admin dictionary.

Reproduction with archived official inputs:

```sh
python3 packages/gallery-db/scripts/prepare-places.py /path/to/geonames-inputs
python3 packages/gallery-db/scripts/localize-places.py /path/to/geonames-inputs/alternateNamesV2.zip
```

The directory must contain cities500.zip and admin1CodesASCII.txt. Omitting it downloads those two files from the official source. Scripts reject changed checksums before writing output. Daily dumps change: preserve the originals or explicitly review updated data and its manifest. Deployments use the checked-in compact file and never download data or send photo coordinates to a geocoder.

Review stable IDs, parent relationships, overrides and merges before updating. gzip output is deterministic on the same Python/zlib toolchain; decompressed JSON is authoritative when compression versions differ.
