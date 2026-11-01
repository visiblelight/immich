-- Separate camera/source clock changes from GPS and location-zone changes.
ALTER TABLE gallery.capture_evidence ADD COLUMN source_time_signature text
 CHECK(source_time_signature IS NULL OR length(source_time_signature)=32);
-- Only seed a legacy baseline when the full source still matches. No old GPS is copied.
-- The view owner reads authorized sources into a transaction-local, hash-only snapshot.
SET LOCAL ROLE gallery_view_owner;
CREATE TEMP TABLE capture_time_baseline ON COMMIT DROP AS
 SELECT e.asset_id,gallery.capture_source_signature(r.taken_at,r.local_taken_at,NULL,NULL,NULL) AS signature
 FROM gallery.capture_evidence e JOIN gallery.capture_source_asset r ON r.asset_id=e.asset_id
 WHERE e.source_signature=r.source_signature;
GRANT SELECT ON capture_time_baseline TO gallery_migrator;
RESET ROLE;
UPDATE gallery.capture_evidence e SET source_time_signature=b.signature
 FROM capture_time_baseline b WHERE e.asset_id=b.asset_id;
