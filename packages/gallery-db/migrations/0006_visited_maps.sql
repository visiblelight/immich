CREATE TABLE gallery.map_settings (
 id integer PRIMARY KEY CHECK (id=1), version integer NOT NULL DEFAULT 1 CHECK (version>0),
 visit_gap_days integer NOT NULL DEFAULT 30 CHECK (visit_gap_days BETWEEN 1 AND 365),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gallery.map_settings(id) VALUES(1);
CREATE TABLE gallery.map_provider_config (
 provider text PRIMARY KEY CHECK (provider IN ('osm','google','amap')),
 enabled boolean NOT NULL DEFAULT false, is_default boolean NOT NULL DEFAULT false,
 browser_key text NOT NULL DEFAULT '' CHECK (length(browser_key)<=256),
 tile_url text NOT NULL DEFAULT '', attribution text NOT NULL DEFAULT '' CHECK (length(attribution)<=300),
 secret_ciphertext text CHECK (length(secret_ciphertext)<=4096),
 CHECK (NOT is_default OR enabled),
 CHECK (provider='osm' OR NOT enabled OR browser_key<>''),
 CHECK (provider<>'amap' OR NOT enabled OR secret_ciphertext IS NOT NULL),
 CHECK (provider='amap' OR secret_ciphertext IS NULL)
);
CREATE UNIQUE INDEX map_provider_default_idx ON gallery.map_provider_config(is_default) WHERE is_default;
INSERT INTO gallery.map_provider_config(provider,enabled,is_default,tile_url,attribution) VALUES
 ('osm',true,true,'https://tile.openstreetmap.org/{z}/{x}/{y}.png','© OpenStreetMap contributors'),
 ('google',false,false,'',''),('amap',false,false,'','');
CREATE TABLE gallery.visit_override (
 id uuid PRIMARY KEY, country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
 start_local_date date, end_local_date date, label text NOT NULL DEFAULT '' CHECK (length(label)<=120),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES gallery."user"(id) ON DELETE SET NULL,
 UNIQUE(id,country_code),
 CHECK ((start_local_date IS NULL AND end_local_date IS NULL) OR
  (start_local_date IS NOT NULL AND end_local_date IS NOT NULL AND start_local_date<=end_local_date))
);
CREATE TABLE gallery.visit_override_asset (
 override_id uuid NOT NULL, country_code text NOT NULL, asset_id uuid NOT NULL,
 PRIMARY KEY(override_id,asset_id), UNIQUE(country_code,asset_id),
 FOREIGN KEY(override_id,country_code) REFERENCES gallery.visit_override(id,country_code) ON DELETE CASCADE
);
CREATE INDEX visit_override_country_idx ON gallery.visit_override(country_code);
REVOKE ALL ON gallery.map_settings,gallery.map_provider_config,gallery.visit_override,gallery.visit_override_asset FROM PUBLIC;
GRANT SELECT,UPDATE ON gallery.map_settings,gallery.map_provider_config TO gallery_admin;
GRANT SELECT,INSERT,UPDATE,DELETE ON gallery.visit_override,gallery.visit_override_asset TO gallery_admin;
-- Server runtime reads encrypted proxy credentials; HTTP projections must explicitly
-- select public fields. The decryption key belongs to the service environment only.
GRANT SELECT ON gallery.map_settings,gallery.map_provider_config,gallery.visit_override,gallery.visit_override_asset TO gallery_public;
