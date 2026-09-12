-- Owner preparation: grant SELECT(localDateTime), SELECT(timeZone) to gallery_view_owner.
ALTER TABLE gallery.album ADD COLUMN has_unpublished_changes boolean NOT NULL DEFAULT true;
UPDATE gallery.album a SET has_unpublished_changes=(d.version<>r.source_draft_version)
FROM gallery.album_draft d,gallery.album_release r WHERE d.album_id=a.id AND r.id=a.current_release_id;
UPDATE gallery.album SET version=version+1;
SET LOCAL ROLE gallery_view_owner;
-- The only source qualification definition. Even known IDs must pass this view.
CREATE OR REPLACE VIEW gallery.admin_source_asset WITH (security_barrier = true) AS
SELECT a.id AS asset_id, a."ownerId" AS owner_id, a.width, a.height,
 a."fileCreatedAt" AS taken_at, a."originalFileName" AS filename, a.thumbhash,
 a."isEdited" AS is_edited, a."updateId" AS asset_update_id,
 p.id AS preview_id, p.path AS preview_path, p."updateId" AS preview_update_id,
 t.id AS thumbnail_id, t.path AS thumbnail_path, t."updateId" AS thumbnail_update_id,
 e.latitude, e.longitude, e.city, e.state, e.country, e.description AS source_description, e.make, e.model, e."lensModel" AS lens_model,
 e."fNumber" AS f_number, e."focalLength" AS focal_length, e.iso, e."exposureTime" AS exposure_time,
 a."localDateTime" AS local_taken_at, e."timeZone" AS time_zone
FROM public.asset a
JOIN gallery.immich_source_owner o ON o.immich_owner_id = a."ownerId" AND o.enabled
JOIN public.asset_file p ON p."assetId" = a.id AND p.type = 'preview' AND p."isEdited" = a."isEdited"
JOIN public.asset_file t ON t."assetId" = a.id AND t.type = 'thumbnail' AND t."isEdited" = a."isEdited"
LEFT JOIN public.asset_exif e ON e."assetId" = a.id
WHERE a.type = 'IMAGE' AND a.status = 'active' AND a."deletedAt" IS NULL
 AND NOT a."isOffline" AND a.visibility IN ('timeline','archive');


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
 q.group_id,q.description_format,q.taken_at,q.first_added_at,q.estimated,q.local_taken_at,q.time_zone
FROM (
 SELECT a.album_id, a.slug, a.ancestor_ids, a.show_exif,
 p.photo_id, p.immich_asset_id, p.position, p.title, p.description, p.alt_text, p.public_exif,
 s.width, s.height, s.thumbhash, s.latitude, s.longitude,
 p.group_id,p.description_format,s.taken_at,entry.first_added_at,entry.estimated,s.local_taken_at,s.time_zone,
 s.latitude BETWEEN -90 AND 90 AND s.longitude BETWEEN -180 AND 180 AS valid_gps,
 CASE WHEN a.location_mode = 'hidden' OR p.location_mode = 'hidden' THEN 'hidden'
 WHEN a.location_mode = 'approximate' OR p.location_mode = 'approximate' THEN 'approximate'
 ELSE 'exact' END AS effective_location_mode
 FROM gallery.published_album a JOIN gallery.album_release_photo p ON p.release_id = a.release_id
 JOIN gallery.admin_source_asset s ON s.asset_id = p.immich_asset_id
 LEFT JOIN gallery.asset_entry entry ON entry.immich_asset_id=p.immich_asset_id
) q;

RESET ROLE;
