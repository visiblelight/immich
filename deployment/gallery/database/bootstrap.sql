-- Run once using the database owner; never put this credential in a runtime service.
-- Role creation is deliberately not IF NOT EXISTS: refuse to take over existing roles.
CREATE ROLE gallery_view_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gallery_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gallery_admin LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE gallery_public LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA gallery AUTHORIZATION gallery_migrator;
REVOKE ALL ON SCHEMA gallery FROM PUBLIC;
-- PG14 grants CREATE on public to PUBLIC by default. Removing this inherited
-- privilege is necessary: REVOKE from only the runtime roles does not deny it.
-- The existing Immich owner retains its ownership rights.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA gallery TO gallery_admin, gallery_public, gallery_view_owner;
GRANT CREATE ON SCHEMA gallery TO gallery_view_owner;
GRANT USAGE ON SCHEMA public TO gallery_view_owner;
GRANT gallery_view_owner TO gallery_migrator;
GRANT SELECT (id, "ownerId", type, status, "deletedAt", "isOffline", visibility, "isEdited", width, height,
 "fileCreatedAt", "originalFileName", thumbhash, "updateId") ON public.asset TO gallery_view_owner;
GRANT SELECT ("assetId", latitude, longitude, city, state, country, description, make, model, "lensModel", "fNumber", "focalLength", iso, "exposureTime")
 ON public.asset_exif TO gallery_view_owner;
GRANT SELECT (id, "assetId", type, path, "isEdited", "updateId") ON public.asset_file TO gallery_view_owner;
GRANT SELECT (id, "albumName", "deletedAt") ON public.album TO gallery_view_owner;
GRANT SELECT ("albumId", "userId", role) ON public.album_user TO gallery_view_owner;
GRANT SELECT ("albumId", "assetId") ON public.album_asset TO gallery_view_owner;
GRANT SELECT (id, "userId", value, "parentId", color) ON public.tag TO gallery_view_owner;
GRANT SELECT ("tagId", "assetId") ON public.tag_asset TO gallery_view_owner;
ALTER ROLE gallery_admin SET search_path = pg_catalog, gallery;
ALTER ROLE gallery_public SET search_path = pg_catalog, gallery;
ALTER ROLE gallery_admin SET statement_timeout = '10s';
ALTER ROLE gallery_public SET statement_timeout = '10s';
