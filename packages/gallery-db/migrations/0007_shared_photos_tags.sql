-- Gallery-only, additive migration. Existing album snapshots remain untouched.
-- Preflight approval is required when previously separate album text differs.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM gallery.album_photo GROUP BY immich_asset_id
   HAVING count(DISTINCT (title,description,description_format,alt_text)) FILTER(WHERE length(title)+length(description)+length(alt_text)>0)>1)
 THEN RAISE EXCEPTION 'Conflicting Gallery photo text: resolve migration choices before retrying'; END IF;
 IF EXISTS (SELECT 1 FROM gallery.album_release_photo p JOIN gallery.album a ON a.current_release_id=p.release_id GROUP BY p.immich_asset_id
   HAVING count(DISTINCT (p.title,p.description,p.description_format,p.alt_text)) FILTER(WHERE length(p.title)+length(p.description)+length(p.alt_text)>0)>1)
 THEN RAISE EXCEPTION 'Conflicting published Gallery photo text: resolve migration choices before retrying'; END IF;
END $$;
CREATE TABLE gallery.photo (
 immich_asset_id uuid PRIMARY KEY,
 title text NOT NULL DEFAULT '' CHECK(length(title)<=200),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=50000),
 description_format text NOT NULL DEFAULT 'markdown' CHECK(description_format IN ('plain','markdown')),
 alt_text text NOT NULL DEFAULT '' CHECK(length(alt_text)<=500),
 version bigint NOT NULL DEFAULT 1,
 current_release_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.photo_release (
 id uuid PRIMARY KEY, immich_asset_id uuid NOT NULL REFERENCES gallery.photo(immich_asset_id),
 title text NOT NULL CHECK(length(title)<=200), description text NOT NULL CHECK(length(description)<=50000),
 description_format text NOT NULL CHECK(description_format IN ('plain','markdown')), alt_text text NOT NULL CHECK(length(alt_text)<=500),
 public_exif jsonb CHECK(public_exif IS NULL OR (jsonb_typeof(public_exif)='object' AND public_exif-ARRAY['make','model','lensModel','fNumber','focalLength','iso','exposureTime']='{}'::jsonb)), source_version bigint NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(), published_by uuid REFERENCES gallery."user"(id),
 UNIQUE(immich_asset_id,id)
);
ALTER TABLE gallery.photo ADD FOREIGN KEY(immich_asset_id,current_release_id) REFERENCES gallery.photo_release(immich_asset_id,id);
CREATE TABLE gallery.tag (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60),
 active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tag_name_unique ON gallery.tag(lower(btrim(name)));
CREATE TABLE gallery.photo_tag (
 immich_asset_id uuid NOT NULL REFERENCES gallery.photo(immich_asset_id), tag_id uuid NOT NULL REFERENCES gallery.tag(id),
 PRIMARY KEY(immich_asset_id,tag_id)
);
CREATE INDEX photo_tag_lookup ON gallery.photo_tag(tag_id,immich_asset_id);
CREATE TABLE gallery.photo_release_tag (
 release_id uuid NOT NULL REFERENCES gallery.photo_release(id), tag_id uuid NOT NULL REFERENCES gallery.tag(id),
 PRIMARY KEY(release_id,tag_id)
);
CREATE INDEX photo_release_tag_lookup ON gallery.photo_release_tag(tag_id,release_id);
-- Seed public-only assets too; private/current drafts never become the initial public version.
INSERT INTO gallery.photo(immich_asset_id,title,description,description_format,alt_text)
 SELECT DISTINCT ON(immich_asset_id) immich_asset_id,title,description,description_format,alt_text FROM (
 SELECT immich_asset_id,title,description,description_format,alt_text,0 AS priority FROM gallery.album_photo
 UNION ALL SELECT p.immich_asset_id,p.title,p.description,p.description_format,p.alt_text,1 FROM gallery.album_release_photo p
 JOIN gallery.album a ON a.current_release_id=p.release_id
 ) x ORDER BY immich_asset_id,priority,(length(title)+length(description)+length(alt_text)) DESC;
INSERT INTO gallery.photo_release(id,immich_asset_id,title,description,description_format,alt_text,public_exif,source_version)
 SELECT DISTINCT ON(p.immich_asset_id) md5(p.immich_asset_id::text || ':gallery-photo-migration')::uuid,p.immich_asset_id,p.title,p.description,p.description_format,p.alt_text,
 (SELECT x.public_exif FROM gallery.album_release_photo x JOIN gallery.album b ON b.current_release_id=x.release_id
  WHERE x.immich_asset_id=p.immich_asset_id AND x.public_exif IS NOT NULL ORDER BY b.id LIMIT 1),1
 FROM gallery.album_release_photo p JOIN gallery.album a ON a.current_release_id=p.release_id
 ORDER BY p.immich_asset_id,(length(p.title)+length(p.description)+length(p.alt_text)) DESC,a.id;
UPDATE gallery.photo p SET current_release_id=r.id FROM gallery.photo_release r WHERE r.immich_asset_id=p.immich_asset_id;
REVOKE ALL ON gallery.photo,gallery.photo_release,gallery.tag,gallery.photo_tag,gallery.photo_release_tag FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON gallery.photo TO gallery_admin;
GRANT SELECT,INSERT ON gallery.photo_release,gallery.photo_release_tag TO gallery_admin;
GRANT SELECT,INSERT,UPDATE,DELETE ON gallery.tag,gallery.photo_tag TO gallery_admin;
GRANT SELECT ON gallery.photo,gallery.photo_release,gallery.tag,gallery.photo_tag,gallery.photo_release_tag TO gallery_view_owner;
UPDATE gallery.album SET version=version+1;
UPDATE gallery.site SET tree_version=tree_version+1 WHERE id=1;
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
 q.group_id,q.description_format,q.taken_at,q.first_added_at,q.estimated,q.local_taken_at,q.time_zone,q.tags
FROM (
 SELECT a.album_id, a.slug, a.ancestor_ids, a.show_exif,
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

CREATE VIEW gallery.published_tag WITH(security_barrier=true) AS
 SELECT t.id,t.name,count(DISTINCT p.asset_id)::bigint AS photo_count FROM gallery.tag t
 JOIN gallery.photo_release_tag pt ON pt.tag_id=t.id JOIN gallery.photo shared ON shared.current_release_id=pt.release_id
 JOIN gallery.published_photo p ON p.asset_id=shared.immich_asset_id GROUP BY t.id,t.name;
GRANT SELECT ON gallery.published_tag TO gallery_public,gallery_admin;
RESET ROLE;
