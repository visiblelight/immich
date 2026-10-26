-- Run using a dedicated database administrator, never a runtime service.
-- A separate credential owns no schema and cannot modify Gallery content or Immich.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gallery_community') THEN
  CREATE ROLE gallery_community LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gallery_community' AND
   (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe existing gallery_community role';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member='gallery_community'::regrole) OR
    EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner='gallery_community'::regrole) OR
    EXISTS(SELECT 1 FROM pg_database WHERE datdba='gallery_community'::regrole) THEN
  RAISE EXCEPTION 'gallery_community must not own schemas/databases or inherit roles';
 END IF;
END $$;
GRANT USAGE ON SCHEMA gallery TO gallery_community;
GRANT SELECT ON gallery.community_settings TO gallery_community;
GRANT SELECT ON gallery.published_album,gallery.published_photo,gallery.published_media,
 gallery.published_article,gallery.published_article_photo,gallery.published_article_photo_media TO gallery_community;
GRANT SELECT,INSERT,UPDATE,DELETE ON gallery.member,gallery.member_session,
 gallery.member_challenge,gallery.community_comment,gallery.community_like TO gallery_community;
DO $$ BEGIN
 IF to_regprocedure('gallery.capture_source_signature(timestamptz,timestamptz,text,double precision,double precision)') IS NOT NULL THEN
  GRANT EXECUTE ON FUNCTION gallery.capture_source_signature(timestamptz,timestamptz,text,double precision,double precision) TO gallery_community;
 END IF;
END $$;
ALTER ROLE gallery_community SET search_path=pg_catalog,gallery;
ALTER ROLE gallery_community SET statement_timeout='10s';
