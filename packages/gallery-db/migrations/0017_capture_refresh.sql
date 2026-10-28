-- Gallery-only maintenance queue. No source/media access is added to runtime roles.
CREATE TABLE gallery.capture_refresh (
 asset_id uuid PRIMARY KEY,
 token uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','reading','completed','failed')),
 requested_by uuid NOT NULL REFERENCES gallery."user"(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 finished_at timestamptz,
 error text
);
CREATE INDEX capture_refresh_pending ON gallery.capture_refresh(requested_at) WHERE state IN ('queued','reading');
REVOKE ALL ON gallery.capture_refresh FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON gallery.capture_refresh TO gallery_admin;
