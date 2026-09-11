ALTER TABLE gallery.album_photo DROP CONSTRAINT album_photo_description_check;
ALTER TABLE gallery.album_photo ADD CHECK (length(description)<=50000);
ALTER TABLE gallery.album_release_photo DROP CONSTRAINT album_release_photo_description_check;
ALTER TABLE gallery.album_release_photo ADD CHECK (length(description)<=50000);
-- Additive Gallery-only migration. Historical release documents remain unchanged.
ALTER TABLE gallery.album_photo ADD COLUMN group_id uuid;
ALTER TABLE gallery.album_release_photo ADD COLUMN group_id uuid;
ALTER TABLE gallery.album_photo ADD COLUMN description_format text NOT NULL DEFAULT 'plain' CHECK (description_format IN ('plain','markdown'));
ALTER TABLE gallery.album_release_photo ADD COLUMN description_format text NOT NULL DEFAULT 'plain' CHECK (description_format IN ('plain','markdown'));
CREATE TABLE gallery.asset_entry (
 immich_asset_id uuid PRIMARY KEY,
 first_added_at timestamptz NOT NULL DEFAULT now(),
 estimated boolean NOT NULL DEFAULT false
);
INSERT INTO gallery.asset_entry(immich_asset_id,first_added_at,estimated)
SELECT immich_asset_id,min(added),true FROM (
 SELECT immich_asset_id,created_at AS added FROM gallery.album_photo
 UNION ALL
 SELECT p.immich_asset_id,r.published_at FROM gallery.album_release_photo p JOIN gallery.album_release r ON r.id=p.release_id
) history GROUP BY immich_asset_id;
CREATE INDEX asset_entry_added_idx ON gallery.asset_entry(first_added_at DESC,immich_asset_id);
REVOKE ALL ON gallery.asset_entry FROM PUBLIC;
GRANT SELECT,INSERT ON gallery.asset_entry TO gallery_admin;
GRANT SELECT ON gallery.asset_entry TO gallery_view_owner;
-- Force stale, already-open editing forms to reload rather than erase new fields.
UPDATE gallery.album SET version=version+1;
SET LOCAL ROLE gallery_view_owner;
CREATE OR REPLACE VIEW gallery.published_photo WITH (security_barrier = true) AS
SELECT q.album_id, q.slug AS album_slug, q.ancestor_ids, q.photo_id, q.immich_asset_id AS asset_id,
 q.position, q.title, q.description, q.alt_text, q.width, q.height, q.thumbhash,
 CASE WHEN q.show_exif THEN q.public_exif ELSE NULL END AS public_exif,
 q.effective_location_mode AS location_mode,
 CASE WHEN q.valid_gps AND q.effective_location_mode = 'exact' THEN q.latitude
 WHEN q.valid_gps AND q.effective_location_mode = 'approximate'
 THEN greatest(-90::numeric, least(90::numeric, floor(q.latitude::numeric / 0.02) * 0.02 + 0.01))::double precision
 ELSE NULL END AS latitude,
 CASE WHEN q.valid_gps AND q.effective_location_mode = 'exact' THEN q.longitude
 WHEN q.valid_gps AND q.effective_location_mode = 'approximate'
 THEN greatest(-180::numeric, least(180::numeric, floor(q.longitude::numeric / 0.02) * 0.02 + 0.01))::double precision
 ELSE NULL END AS longitude,
 q.group_id,q.description_format,q.taken_at,q.first_added_at,q.estimated
FROM (
 SELECT a.album_id, a.slug, a.ancestor_ids, a.show_exif,
 p.photo_id, p.immich_asset_id, p.position, p.title, p.description, p.alt_text, p.public_exif,
 s.width, s.height, s.thumbhash, s.latitude, s.longitude,
 p.group_id,p.description_format,s.taken_at,entry.first_added_at,entry.estimated,
 s.latitude BETWEEN -90 AND 90 AND s.longitude BETWEEN -180 AND 180 AS valid_gps,
 CASE WHEN a.location_mode = 'hidden' OR p.location_mode = 'hidden' THEN 'hidden'
 WHEN a.location_mode = 'approximate' OR p.location_mode = 'approximate' THEN 'approximate'
 ELSE 'exact' END AS effective_location_mode
 FROM gallery.published_album a JOIN gallery.album_release_photo p ON p.release_id = a.release_id
 JOIN gallery.admin_source_asset s ON s.asset_id = p.immich_asset_id
 LEFT JOIN gallery.asset_entry entry ON entry.immich_asset_id=p.immich_asset_id
) q;

RESET ROLE;
