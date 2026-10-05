-- Gallery-only live tag visibility and independently managed place labels.
CREATE TABLE gallery.place_label (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 80),
 name_zh text NOT NULL DEFAULT '' CHECK(length(name_zh)<=120),
 name_en text NOT NULL DEFAULT '' CHECK(length(name_en)<=120),
 aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
 canonical_id text,
 version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.photo_place (
 asset_id uuid PRIMARY KEY,
 place_id text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON gallery.place_label,gallery.photo_place FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON gallery.place_label,gallery.photo_place TO gallery_admin;
GRANT SELECT ON gallery.place_label,gallery.photo_place TO gallery_view_owner;
SET LOCAL ROLE gallery_view_owner;
CREATE OR REPLACE VIEW gallery.article_source_photo WITH (security_barrier = true) AS
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
 q.group_id,q.description_format,q.taken_at,q.first_added_at,q.estimated,q.local_taken_at,q.time_zone,q.tags,q.hidden_from_gallery
FROM (
 SELECT a.album_id, a.slug, a.ancestor_ids, a.show_exif, coalesce(r.hidden_from_gallery,false) AS hidden_from_gallery,
 p.photo_id, p.immich_asset_id, p.position, coalesce(r.title,p.title) AS title, coalesce(r.description,p.description) AS description, coalesce(r.alt_text,p.alt_text) AS alt_text, CASE WHEN r.id IS NOT NULL THEN r.public_exif ELSE p.public_exif END AS public_exif,
 s.width, s.height, s.thumbhash, s.latitude, s.longitude,
 p.group_id,coalesce(r.description_format,p.description_format) AS description_format,s.taken_at,entry.first_added_at,entry.estimated,s.local_taken_at,s.time_zone,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) ORDER BY t.name,t.id) FROM gallery.photo_release_tag pt JOIN gallery.tag t ON t.id=pt.tag_id WHERE pt.release_id=r.id AND t.active),'[]'::jsonb) AS tags,
 s.latitude BETWEEN -90 AND 90 AND s.longitude BETWEEN -180 AND 180 AS valid_gps,
 CASE WHEN a.location_mode = 'hidden' OR p.location_mode = 'hidden' THEN 'hidden'
 WHEN a.location_mode = 'approximate' OR p.location_mode = 'approximate' THEN 'approximate'
 ELSE 'exact' END AS effective_location_mode
 FROM gallery.published_album a JOIN gallery.album_release_photo p ON p.release_id = a.release_id
 JOIN gallery.admin_source_asset s ON s.asset_id = p.immich_asset_id
 LEFT JOIN gallery.photo shared ON shared.immich_asset_id=p.immich_asset_id
 LEFT JOIN gallery.photo_release r ON r.id=shared.current_release_id
 LEFT JOIN gallery.asset_entry entry ON entry.immich_asset_id=p.immich_asset_id
) q;


CREATE OR REPLACE VIEW gallery.published_tag WITH(security_barrier=true) AS
 SELECT t.id,t.name,count(DISTINCT p.asset_id)::bigint AS photo_count FROM gallery.tag t
 JOIN gallery.photo_release_tag pt ON pt.tag_id=t.id JOIN gallery.photo shared ON shared.current_release_id=pt.release_id
 JOIN gallery.published_photo p ON p.asset_id=shared.immich_asset_id
 WHERE t.active GROUP BY t.id,t.name;
CREATE VIEW gallery.public_place_label WITH(security_barrier=true) AS SELECT * FROM gallery.place_label;
CREATE VIEW gallery.published_photo_place_source WITH(security_barrier=true) AS
 SELECT p.asset_id,p.album_id,p.photo_id,p.location_mode,p.latitude,p.longitude,
 CASE WHEN p.location_mode='exact' THEN s.city END AS city,
 CASE WHEN p.location_mode='exact' THEN s.state END AS state,
 CASE WHEN p.location_mode='exact' AND o.latitude=s.latitude AND o.longitude=s.longitude THEN o.place_id END AS manual_place
 FROM gallery.published_photo p JOIN gallery.admin_source_asset s ON s.asset_id=p.asset_id
 LEFT JOIN gallery.photo_place o ON o.asset_id=p.asset_id;
GRANT SELECT ON gallery.public_place_label,gallery.published_photo_place_source TO gallery_public,gallery_admin;
RESET ROLE;
