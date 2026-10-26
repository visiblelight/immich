-- Independent Gallery evidence and reversible corrections. No Immich writes or foreign keys.
CREATE FUNCTION gallery.capture_source_signature(taken timestamptz,local_clock timestamptz,zone text,lat double precision,lng double precision)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT md5(jsonb_build_array(extract(epoch from taken),extract(epoch from local_clock),zone,lat,lng)::text) $$;
REVOKE ALL ON FUNCTION gallery.capture_source_signature(timestamptz,timestamptz,text,double precision,double precision) FROM PUBLIC;
-- Pure hash function: view callers need EXECUTE; it reads no tables and runs as invoker.
GRANT EXECUTE ON FUNCTION gallery.capture_source_signature(timestamptz,timestamptz,text,double precision,double precision) TO gallery_view_owner,gallery_admin,gallery_public;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gallery_community') THEN
  GRANT EXECUTE ON FUNCTION gallery.capture_source_signature(timestamptz,timestamptz,text,double precision,double precision) TO gallery_community;
 END IF;
END $$;
CREATE TABLE gallery.capture_evidence (
 asset_id uuid PRIMARY KEY,
 source_signature text NOT NULL CHECK(length(source_signature)=32),
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 analysis jsonb NOT NULL CHECK(analysis->>'status' IN ('verified','suggested','unknown','conflict')),
 version bigint NOT NULL DEFAULT 1,
 collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.capture_correction (
 asset_id uuid PRIMARY KEY,
 source_signature text NOT NULL,
 evidence_fingerprint text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('confirmed','disabled')),
 source_zone text,
 resolved jsonb,
 version bigint NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES gallery."user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(mode='disabled' OR (source_zone IS NOT NULL AND resolved IS NOT NULL))
);
REVOKE ALL ON gallery.capture_evidence,gallery.capture_correction FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON gallery.capture_evidence,gallery.capture_correction TO gallery_admin;
GRANT SELECT ON gallery.capture_evidence,gallery.capture_correction TO gallery_view_owner;
SET LOCAL ROLE gallery_view_owner;
CREATE VIEW gallery.capture_source_asset WITH (security_barrier = true) AS
SELECT a.id AS asset_id, a."ownerId" AS owner_id, a.width, a.height,
 a."fileCreatedAt" AS taken_at, a."originalFileName" AS filename, a.thumbhash,
 a."isEdited" AS is_edited, a."updateId" AS asset_update_id,
 p.id AS preview_id, p.path AS preview_path, p."updateId" AS preview_update_id,
 t.id AS thumbnail_id, t.path AS thumbnail_path, t."updateId" AS thumbnail_update_id,
 e.latitude, e.longitude, e.city, e.state, e.country, e.description AS source_description, e.make, e.model, e."lensModel" AS lens_model,
 e."fNumber" AS f_number, e."focalLength" AS focal_length, e.iso, e."exposureTime" AS exposure_time,
 a."localDateTime" AS local_taken_at, e."timeZone" AS time_zone,
 gallery.capture_source_signature(a."fileCreatedAt",a."localDateTime",e."timeZone",e.latitude,e.longitude) AS source_signature
FROM public.asset a
JOIN gallery.immich_source_owner o ON o.immich_owner_id = a."ownerId" AND o.enabled
JOIN public.asset_file p ON p."assetId" = a.id AND p.type = 'preview' AND p."isEdited" = a."isEdited"
JOIN public.asset_file t ON t."assetId" = a.id AND t.type = 'thumbnail' AND t."isEdited" = a."isEdited"
LEFT JOIN public.asset_exif e ON e."assetId" = a.id
WHERE a.type = 'IMAGE' AND a.status = 'active' AND a."deletedAt" IS NULL
 AND NOT a."isOffline" AND a.visibility IN ('timeline','archive');

GRANT SELECT ON gallery.capture_source_asset TO gallery_admin;
CREATE OR REPLACE VIEW gallery.admin_source_asset WITH(security_barrier=true) AS
SELECT r.asset_id,
 r.owner_id,
 r.width,
 r.height,
 coalesce((v.resolved->>'takenAt')::timestamptz,r.taken_at) AS taken_at,
 r.filename,
 r.thumbhash,
 r.is_edited,
 r.asset_update_id,
 r.preview_id,
 r.preview_path,
 r.preview_update_id,
 r.thumbnail_id,
 r.thumbnail_path,
 r.thumbnail_update_id,
 r.latitude,
 r.longitude,
 r.city,
 r.state,
 r.country,
 r.source_description,
 r.make,
 r.model,
 r.lens_model,
 r.f_number,
 r.focal_length,
 r.iso,
 r.exposure_time,
 CASE WHEN v.resolved IS NOT NULL THEN (v.resolved->>'localTakenAt')::timestamptz WHEN v.status IN ('suggested','unknown','conflict') THEN coalesce((ev.evidence->>'clock')::timestamptz,r.local_taken_at) ELSE r.local_taken_at END AS local_taken_at,
 CASE WHEN v.resolved IS NOT NULL THEN v.resolved->>'timeZone' WHEN v.status IN ('suggested','unknown','conflict') THEN NULL ELSE r.time_zone END AS time_zone,v.status AS capture_status,r.source_signature
FROM gallery.capture_source_asset r
LEFT JOIN gallery.capture_evidence ev ON ev.asset_id=r.asset_id
LEFT JOIN gallery.capture_correction c ON c.asset_id=r.asset_id AND c.source_signature=r.source_signature AND c.evidence_fingerprint=ev.fingerprint
LEFT JOIN LATERAL (
 SELECT
 CASE WHEN ev.source_signature IS DISTINCT FROM r.source_signature THEN NULL
      WHEN c.mode='disabled' THEN NULL WHEN c.mode='confirmed' THEN c.resolved
      WHEN ev.analysis->>'status'='verified' THEN ev.analysis ELSE NULL END AS resolved,
 CASE WHEN ev.asset_id IS NULL THEN 'legacy' WHEN ev.source_signature<>r.source_signature THEN 'stale'
      WHEN c.mode='disabled' THEN 'legacy' WHEN c.mode='confirmed' THEN 'confirmed'
      ELSE ev.analysis->>'status' END AS status
) v ON true;
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
 q.group_id,q.description_format,q.taken_at,q.first_added_at,q.estimated,q.local_taken_at,q.time_zone,q.tags,q.hidden_from_gallery,q.capture_status
FROM (
 SELECT a.album_id, a.slug, a.ancestor_ids, a.show_exif, coalesce(r.hidden_from_gallery,false) AS hidden_from_gallery,
 p.photo_id, p.immich_asset_id, p.position, coalesce(r.title,p.title) AS title, coalesce(r.description,p.description) AS description, coalesce(r.alt_text,p.alt_text) AS alt_text, CASE WHEN r.id IS NOT NULL THEN r.public_exif ELSE p.public_exif END AS public_exif,
 s.width, s.height, s.thumbhash, s.latitude, s.longitude,
 p.group_id,coalesce(r.description_format,p.description_format) AS description_format,s.taken_at,entry.first_added_at,entry.estimated,s.local_taken_at,s.time_zone,s.capture_status,
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

CREATE OR REPLACE VIEW gallery.published_photo WITH(security_barrier=true) AS
 SELECT album_id,album_slug,ancestor_ids,photo_id,asset_id,position,title,description,alt_text,width,height,thumbhash,public_exif,location_mode,latitude,longitude,group_id,description_format,taken_at,first_added_at,estimated,local_taken_at,time_zone,tags,capture_status FROM gallery.article_source_photo WHERE NOT hidden_from_gallery;
RESET ROLE;
