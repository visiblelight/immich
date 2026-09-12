-- Existing installations only. Run with the Immich database owner before Gallery migration 0005.
-- Grants two read-only columns to the NOLOGIN view owner, never to runtime roles.
BEGIN;
GRANT SELECT ("localDateTime") ON public.asset TO gallery_view_owner;
GRANT SELECT ("timeZone") ON public.asset_exif TO gallery_view_owner;
COMMIT;
