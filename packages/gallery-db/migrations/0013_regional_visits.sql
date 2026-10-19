-- Independent regional evidence assignments. Existing country overrides stay intact.
-- Region identifiers come from the versioned Gallery region catalog; GPS remains live.
CREATE TABLE gallery.region_visit_override (
 id uuid PRIMARY KEY,
 region_code text NOT NULL CHECK (region_code ~ '^[A-Z]{2}-[A-Z0-9]{1,8}$'),
 start_local_date date, end_local_date date,
 label text NOT NULL DEFAULT '' CHECK (length(label)<=120),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES gallery."user"(id) ON DELETE SET NULL,
 UNIQUE(id,region_code),
 CHECK ((start_local_date IS NULL AND end_local_date IS NULL) OR
  (start_local_date IS NOT NULL AND end_local_date IS NOT NULL AND start_local_date<=end_local_date))
);
CREATE TABLE gallery.region_visit_override_asset (
 override_id uuid NOT NULL, region_code text NOT NULL, asset_id uuid NOT NULL,
 PRIMARY KEY(override_id,asset_id), UNIQUE(region_code,asset_id),
 FOREIGN KEY(override_id,region_code) REFERENCES gallery.region_visit_override(id,region_code) ON DELETE CASCADE
);
CREATE INDEX region_visit_override_region_idx ON gallery.region_visit_override(region_code);
REVOKE ALL ON gallery.region_visit_override,gallery.region_visit_override_asset FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON gallery.region_visit_override,gallery.region_visit_override_asset TO gallery_admin;
-- As with country visits, server projections revalidate published evidence before output.
GRANT SELECT ON gallery.region_visit_override,gallery.region_visit_override_asset TO gallery_public;
