SET LOCAL ROLE gallery_view_owner;
-- The only source qualification definition. Even known IDs must pass this view.
CREATE VIEW gallery.admin_source_asset WITH (security_barrier = true) AS
SELECT a.id AS asset_id, a."ownerId" AS owner_id, a.width, a.height,
 a."fileCreatedAt" AS taken_at, a."originalFileName" AS filename, a.thumbhash,
 a."isEdited" AS is_edited, a."updateId" AS asset_update_id,
 p.id AS preview_id, p.path AS preview_path, p."updateId" AS preview_update_id,
 t.id AS thumbnail_id, t.path AS thumbnail_path, t."updateId" AS thumbnail_update_id,
 e.latitude, e.longitude, e.city, e.state, e.country, e.description AS source_description, e.make, e.model, e."lensModel" AS lens_model,
 e."fNumber" AS f_number, e."focalLength" AS focal_length, e.iso, e."exposureTime" AS exposure_time
FROM public.asset a
JOIN gallery.immich_source_owner o ON o.immich_owner_id = a."ownerId" AND o.enabled
JOIN public.asset_file p ON p."assetId" = a.id AND p.type = 'preview' AND p."isEdited" = a."isEdited"
JOIN public.asset_file t ON t."assetId" = a.id AND t.type = 'thumbnail' AND t."isEdited" = a."isEdited"
LEFT JOIN public.asset_exif e ON e."assetId" = a.id
WHERE a.type = 'IMAGE' AND a.status = 'active' AND a."deletedAt" IS NULL
 AND NOT a."isOffline" AND a.visibility IN ('timeline','archive');

CREATE VIEW gallery.admin_source_album WITH (security_barrier = true) AS
SELECT a.id AS album_id, a."albumName" AS name
FROM public.album a WHERE a."deletedAt" IS NULL AND EXISTS (
 SELECT 1 FROM public.album_user u JOIN gallery.immich_source_owner o ON o.immich_owner_id = u."userId" AND o.enabled
 WHERE u."albumId" = a.id
);
CREATE VIEW gallery.admin_source_album_asset WITH (security_barrier = true) AS
SELECT aa."albumId" AS album_id, s.asset_id FROM public.album_asset aa
JOIN gallery.admin_source_album a ON a.album_id = aa."albumId"
JOIN gallery.admin_source_asset s ON s.asset_id = aa."assetId";
CREATE VIEW gallery.admin_source_tag WITH (security_barrier = true) AS
SELECT t.id AS tag_id, t.value, t."parentId" AS parent_id, t.color
FROM public.tag t JOIN gallery.immich_source_owner o ON o.immich_owner_id = t."userId" AND o.enabled;
CREATE VIEW gallery.admin_source_tag_asset WITH (security_barrier = true) AS
SELECT ta."tagId" AS tag_id, s.asset_id FROM public.tag_asset ta
JOIN gallery.admin_source_tag t ON t.tag_id = ta."tagId"
JOIN gallery.admin_source_asset s ON s.asset_id = ta."assetId";

-- Downward traversal starts only from currently published roots. A disconnected
-- cycle, offline ancestor or draft ancestor cannot be reached and fails closed.
CREATE VIEW gallery.published_album WITH (security_barrier = true) AS
WITH RECURSIVE visible AS (
 SELECT a.id AS album_id, a.slug, a.current_release_id AS release_id, a.first_published_at,
 r.parent_album_id, r.position, r.title, r.summary, r.description_document,
 r.location_mode, r.show_exif, r.seo_title, r.seo_description, r.published_at,
 ARRAY[a.id] AS ancestor_ids
 FROM gallery.album a JOIN gallery.album_release r ON r.id = a.current_release_id AND r.album_id = a.id
 WHERE a.status = 'published' AND r.parent_album_id IS NULL
 UNION ALL
 SELECT a.id, a.slug, a.current_release_id, a.first_published_at,
 r.parent_album_id, r.position, r.title, r.summary, r.description_document,
 r.location_mode, r.show_exif, r.seo_title, r.seo_description, r.published_at,
 v.ancestor_ids || a.id
 FROM visible v JOIN gallery.album_release r ON r.parent_album_id = v.album_id
 JOIN gallery.album a ON a.id = r.album_id AND a.current_release_id = r.id
 WHERE a.status = 'published' AND NOT a.id = ANY(v.ancestor_ids)
) SELECT * FROM visible;

CREATE VIEW gallery.published_photo WITH (security_barrier = true) AS
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
 ELSE NULL END AS longitude
FROM (
 SELECT a.album_id, a.slug, a.ancestor_ids, a.show_exif,
 p.photo_id, p.immich_asset_id, p.position, p.title, p.description, p.alt_text, p.public_exif,
 s.width, s.height, s.thumbhash, s.latitude, s.longitude,
 s.latitude BETWEEN -90 AND 90 AND s.longitude BETWEEN -180 AND 180 AS valid_gps,
 CASE WHEN a.location_mode = 'hidden' OR p.location_mode = 'hidden' THEN 'hidden'
 WHEN a.location_mode = 'approximate' OR p.location_mode = 'approximate' THEN 'approximate'
 ELSE 'exact' END AS effective_location_mode
 FROM gallery.published_album a JOIN gallery.album_release_photo p ON p.release_id = a.release_id
 JOIN gallery.admin_source_asset s ON s.asset_id = p.immich_asset_id
) q;

-- These paths are server-internal; never spread their rows into HTTP DTOs.
CREATE VIEW gallery.published_media WITH (security_barrier = true) AS
SELECT p.album_id, p.photo_id, p.asset_id, s.is_edited, s.asset_update_id,
 s.preview_id, s.preview_path, s.preview_update_id,
 s.thumbnail_id, s.thumbnail_path, s.thumbnail_update_id
FROM gallery.published_photo p JOIN gallery.admin_source_asset s ON s.asset_id = p.asset_id;

CREATE VIEW gallery.published_cover WITH (security_barrier = true) AS
SELECT DISTINCT ON (a.album_id) a.album_id, p.album_id AS photo_album_id, p.photo_id, p.asset_id, r.cover_focal_point
FROM gallery.published_album a JOIN gallery.album_release r ON r.id = a.release_id
JOIN gallery.published_photo p ON p.asset_id = r.cover_asset_id AND a.album_id = ANY(p.ancestor_ids)
ORDER BY a.album_id, p.album_id, p.position, p.photo_id;
CREATE VIEW gallery.published_site WITH (security_barrier = true) AS
SELECT s.id, s.name, s.tagline, s.intro, s.about_document, s.contact_links, s.seo_description,
 c.album_id AS hero_album_id
FROM gallery.site s LEFT JOIN gallery.published_cover c ON c.album_id = s.hero_album_id;
CREATE VIEW gallery.published_homepage WITH (security_barrier = true) AS
SELECT a.album_id, h.position FROM gallery.homepage_item h JOIN gallery.published_album a ON a.album_id = h.album_id;
GRANT SELECT ON gallery.admin_source_asset, gallery.admin_source_album, gallery.admin_source_album_asset,
 gallery.admin_source_tag, gallery.admin_source_tag_asset TO gallery_admin;
GRANT SELECT ON gallery.published_album, gallery.published_photo, gallery.published_media,
 gallery.published_cover, gallery.published_site, gallery.published_homepage TO gallery_public, gallery_admin;
RESET ROLE;
