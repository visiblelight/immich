-- Gallery-only; existing photos retain their public visibility.
ALTER TABLE gallery.photo ADD COLUMN hidden_from_gallery boolean NOT NULL DEFAULT false;
ALTER TABLE gallery.photo_release ADD COLUMN hidden_from_gallery boolean NOT NULL DEFAULT false;
CREATE TABLE gallery.article_group_ref (
 article_id uuid NOT NULL REFERENCES gallery.article(id), release_id uuid,
 node_key text NOT NULL, album_id uuid NOT NULL REFERENCES gallery.album(id), group_id uuid NOT NULL,
 FOREIGN KEY(article_id,release_id) REFERENCES gallery.article_release(article_id,id)
);
CREATE UNIQUE INDEX article_group_draft_unique ON gallery.article_group_ref(article_id,node_key) WHERE release_id IS NULL;
CREATE UNIQUE INDEX article_group_release_unique ON gallery.article_group_ref(release_id,node_key) WHERE release_id IS NOT NULL;
CREATE INDEX article_group_source ON gallery.article_group_ref(album_id,group_id);
REVOKE ALL ON gallery.article_group_ref FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON gallery.article_group_ref TO gallery_admin;
GRANT SELECT ON gallery.article_group_ref TO gallery_view_owner;
CREATE TRIGGER article_group_ref_immutable BEFORE DELETE ON gallery.article_group_ref FOR EACH ROW EXECUTE FUNCTION gallery.guard_article_release_ref();
SET LOCAL ROLE gallery_view_owner;
CREATE VIEW gallery.article_source_photo WITH (security_barrier = true) AS
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
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) ORDER BY t.name,t.id) FROM gallery.photo_release_tag pt JOIN gallery.tag t ON t.id=pt.tag_id WHERE pt.release_id=r.id),'[]'::jsonb) AS tags,
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

CREATE OR REPLACE VIEW gallery.published_photo WITH(security_barrier=true) AS
 SELECT album_id,album_slug,ancestor_ids,photo_id,asset_id,position,title,description,alt_text,width,height,thumbhash,public_exif,location_mode,latitude,longitude,group_id,description_format,taken_at,first_added_at,estimated,local_taken_at,time_zone,tags FROM gallery.article_source_photo WHERE NOT hidden_from_gallery;
CREATE VIEW gallery.article_source_group WITH(security_barrier=true) AS
 SELECT a.album_id,(g->>'id')::uuid AS group_id,g->>'title' AS title,g->>'description' AS description,g->>'cover' AS cover
 FROM gallery.published_album a CROSS JOIN LATERAL jsonb_array_elements(coalesce(a.description_document->'groups','[]'::jsonb)) g
 WHERE EXISTS(SELECT 1 FROM gallery.article_source_photo p WHERE p.album_id=a.album_id AND p.group_id=(g->>'id')::uuid);
CREATE VIEW gallery.published_article_group WITH(security_barrier=true) AS
 SELECT DISTINCT a.id AS article_id,g.* FROM gallery.published_article a
 JOIN gallery.article_group_ref ref ON ref.release_id=a.release_id
 JOIN gallery.article_source_group g ON g.album_id=ref.album_id AND g.group_id=ref.group_id;
CREATE OR REPLACE VIEW gallery.published_article_photo WITH(security_barrier=true) AS
 SELECT DISTINCT a.id AS article_id,p.album_id,p.photo_id,p.asset_id,p.title,p.alt_text,p.width,p.height,p.group_id,p.position
 FROM gallery.published_article a JOIN gallery.article_photo_ref ref ON ref.release_id=a.release_id
 JOIN gallery.article_source_photo p ON p.album_id=ref.album_id AND p.asset_id=ref.photo_id
 UNION
 SELECT g.article_id,p.album_id,p.photo_id,p.asset_id,p.title,p.alt_text,p.width,p.height,p.group_id,p.position
 FROM gallery.published_article_group g JOIN gallery.article_source_photo p ON p.album_id=g.album_id AND p.group_id=g.group_id;
CREATE VIEW gallery.published_article_photo_media WITH(security_barrier=true) AS
 SELECT p.article_id,p.album_id,p.asset_id,s.is_edited,s.asset_update_id,s.preview_id,s.preview_path,s.preview_update_id,s.thumbnail_id,s.thumbnail_path,s.thumbnail_update_id
 FROM gallery.published_article_photo p JOIN gallery.admin_source_asset s ON s.asset_id=p.asset_id;
GRANT SELECT ON gallery.article_source_photo,gallery.article_source_group TO gallery_admin;
GRANT SELECT ON gallery.published_article_group,gallery.published_article_photo_media TO gallery_public,gallery_admin;
RESET ROLE;
