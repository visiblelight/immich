-- Gallery owns these objects. No foreign key, trigger or DDL on Immich tables.
CREATE TABLE gallery."user" (
 id uuid PRIMARY KEY, email text NOT NULL, email_normalized text NOT NULL UNIQUE,
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.user_credential (
 user_id uuid PRIMARY KEY REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE CASCADE,
 password_hash text NOT NULL, password_changed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.session (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE CASCADE,
 token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
 audience text NOT NULL CHECK (audience IN ('admin','public')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, CHECK (expires_at > created_at)
);
CREATE INDEX session_user_idx ON gallery.session(user_id);
CREATE INDEX session_expires_idx ON gallery.session(expires_at);
CREATE TABLE gallery.site (
 id smallint PRIMARY KEY CHECK (id = 1), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 tagline text NOT NULL DEFAULT '', intro text NOT NULL DEFAULT '', about_document jsonb NOT NULL DEFAULT '{"schemaVersion":1,"blocks":[]}'::jsonb,
 contact_links jsonb NOT NULL DEFAULT '[]'::jsonb,
 hero_album_id uuid, seo_description text NOT NULL DEFAULT '',
 version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
 tree_version bigint NOT NULL DEFAULT 1 CHECK (tree_version > 0),
 updated_by uuid REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(about_document) = 'object' AND about_document @> '{"schemaVersion":1}'::jsonb
   AND about_document ? 'blocks' AND jsonb_typeof(about_document->'blocks') = 'array'
   AND jsonb_array_length(about_document->'blocks') <= 1000 AND octet_length(about_document::text) <= 1048576),
 CHECK (jsonb_typeof(contact_links) = 'array' AND jsonb_array_length(contact_links) <= 10)
);
CREATE TABLE gallery.immich_source_owner (
 immich_owner_id uuid PRIMARY KEY, label text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.album (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 120 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','offline')),
 current_release_id uuid, version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
 created_by uuid NOT NULL REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 first_published_at timestamptz, last_published_at timestamptz, offline_at timestamptz,
 CHECK ((status = 'draft' AND current_release_id IS NULL AND first_published_at IS NULL AND last_published_at IS NULL AND offline_at IS NULL)
 OR (status IN ('published','offline') AND current_release_id IS NOT NULL AND first_published_at IS NOT NULL AND last_published_at IS NOT NULL
 AND ((status = 'published' AND offline_at IS NULL) OR (status = 'offline' AND offline_at IS NOT NULL))))
);
CREATE INDEX album_status_published_idx ON gallery.album(status, first_published_at, id);
CREATE TABLE gallery.album_draft (
 album_id uuid PRIMARY KEY REFERENCES gallery.album(id) ON UPDATE RESTRICT ON DELETE CASCADE,
 version bigint NOT NULL DEFAULT 1 CHECK (version > 0), updated_by uuid NOT NULL REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(), parent_album_id uuid REFERENCES gallery.album(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 position bigint NOT NULL DEFAULT 0 CHECK (position >= 0),
 title text NOT NULL DEFAULT '' CHECK (length(title) BETWEEN 0 AND 200),
 summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
 description_document jsonb NOT NULL DEFAULT '{"schemaVersion":1,"blocks":[]}'::jsonb,
 cover_asset_id uuid,
 cover_focal_point jsonb,
 location_mode text NOT NULL DEFAULT 'hidden' CHECK (location_mode IN ('hidden','approximate','exact')),
 show_exif boolean NOT NULL DEFAULT false,
 seo_title text, seo_description text,
 CHECK (parent_album_id <> album_id),
 CHECK (jsonb_typeof(description_document) = 'object' AND description_document @> '{"schemaVersion":1}'::jsonb
   AND jsonb_typeof(description_document->'blocks') = 'array'
   AND jsonb_array_length(description_document->'blocks') <= 1000
   AND octet_length(description_document::text) <= 1048576),
 CHECK (description_document ? 'blocks'),
 CHECK (cover_focal_point IS NULL OR (jsonb_typeof(cover_focal_point) = 'object'
   AND cover_focal_point ?& ARRAY['x','y'] AND cover_focal_point - ARRAY['x','y'] = '{}'::jsonb
   AND jsonb_typeof(cover_focal_point->'x') = 'number' AND jsonb_typeof(cover_focal_point->'y') = 'number'
   AND (cover_focal_point->>'x')::numeric BETWEEN 0 AND 1
   AND (cover_focal_point->>'y')::numeric BETWEEN 0 AND 1))
);
CREATE INDEX album_draft_parent_idx ON gallery.album_draft(parent_album_id, position, album_id);
CREATE TABLE gallery.album_photo (
 id uuid PRIMARY KEY,
 album_id uuid NOT NULL REFERENCES gallery.album_draft(album_id) ON UPDATE RESTRICT ON DELETE CASCADE,
 immich_asset_id uuid NOT NULL,
 position integer NOT NULL CHECK (position >= 0),
 title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
 alt_text text NOT NULL DEFAULT '' CHECK (length(alt_text) <= 500),
 location_mode text NOT NULL DEFAULT 'inherit' CHECK (location_mode IN ('inherit','hidden','approximate','exact')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (album_id, immich_asset_id), UNIQUE (album_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX album_photo_asset_idx ON gallery.album_photo(immich_asset_id, album_id);
CREATE TABLE gallery.album_release (
 id uuid PRIMARY KEY, album_id uuid NOT NULL REFERENCES gallery.album(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 release_number integer NOT NULL CHECK (release_number > 0),
 source_draft_version bigint NOT NULL CHECK (source_draft_version > 0),
 content_schema_version integer NOT NULL DEFAULT 1 CHECK (content_schema_version > 0),
 published_by uuid NOT NULL REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE RESTRICT, published_at timestamptz NOT NULL DEFAULT now(),
 parent_album_id uuid REFERENCES gallery.album(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 position bigint NOT NULL DEFAULT 0 CHECK (position >= 0),
 title text NOT NULL DEFAULT '' CHECK (length(title) BETWEEN 1 AND 200),
 summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
 description_document jsonb NOT NULL DEFAULT '{"schemaVersion":1,"blocks":[]}'::jsonb,
 cover_asset_id uuid,
 cover_focal_point jsonb,
 location_mode text NOT NULL DEFAULT 'hidden' CHECK (location_mode IN ('hidden','approximate','exact')),
 show_exif boolean NOT NULL DEFAULT false,
 seo_title text, seo_description text,
 CHECK (parent_album_id <> album_id),
 CHECK (jsonb_typeof(description_document) = 'object' AND description_document @> '{"schemaVersion":1}'::jsonb
   AND jsonb_typeof(description_document->'blocks') = 'array'
   AND jsonb_array_length(description_document->'blocks') <= 1000
   AND octet_length(description_document::text) <= 1048576),
 CHECK (description_document ? 'blocks'),
 CHECK (cover_focal_point IS NULL OR (jsonb_typeof(cover_focal_point) = 'object'
   AND cover_focal_point ?& ARRAY['x','y'] AND cover_focal_point - ARRAY['x','y'] = '{}'::jsonb
   AND jsonb_typeof(cover_focal_point->'x') = 'number' AND jsonb_typeof(cover_focal_point->'y') = 'number'
   AND (cover_focal_point->>'x')::numeric BETWEEN 0 AND 1
   AND (cover_focal_point->>'y')::numeric BETWEEN 0 AND 1)), UNIQUE (album_id, id), UNIQUE (album_id, release_number)
);
CREATE INDEX album_release_parent_idx ON gallery.album_release(parent_album_id, position, album_id);
CREATE TABLE gallery.album_release_photo (
 release_id uuid NOT NULL REFERENCES gallery.album_release(id) ON UPDATE RESTRICT ON DELETE CASCADE,
 photo_id uuid NOT NULL, immich_asset_id uuid NOT NULL,
 position integer NOT NULL CHECK (position >= 0),
 title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
 description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
 alt_text text NOT NULL DEFAULT '' CHECK (length(alt_text) <= 500),
 location_mode text NOT NULL DEFAULT 'inherit' CHECK (location_mode IN ('inherit','hidden','approximate','exact')), public_exif jsonb,
 PRIMARY KEY (release_id, photo_id), UNIQUE (release_id, immich_asset_id), UNIQUE (release_id, position),
 CHECK (public_exif IS NULL OR (jsonb_typeof(public_exif) = 'object' AND
 public_exif - ARRAY['make','model','lensModel','fNumber','focalLength','iso','exposureTime'] = '{}'::jsonb))
);
CREATE INDEX album_release_photo_asset_idx ON gallery.album_release_photo(immich_asset_id, release_id);
ALTER TABLE gallery.album ADD CONSTRAINT album_current_release_fk FOREIGN KEY (id, current_release_id)
 REFERENCES gallery.album_release(album_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE gallery.site ADD CONSTRAINT site_hero_fk FOREIGN KEY (hero_album_id)
 REFERENCES gallery.album(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE TABLE gallery.homepage_item (
 album_id uuid PRIMARY KEY REFERENCES gallery.album(id) ON UPDATE RESTRICT ON DELETE RESTRICT, position integer NOT NULL CHECK (position >= 0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE TABLE gallery.audit_event (
 id uuid PRIMARY KEY, actor_user_id uuid REFERENCES gallery."user"(id) ON UPDATE RESTRICT ON DELETE SET NULL,
 action text NOT NULL, target_type text NOT NULL, target_id text, details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX audit_event_target_idx ON gallery.audit_event(target_type, target_id, created_at);
CREATE INDEX audit_event_created_idx ON gallery.audit_event(created_at);
-- Runtime permissions are explicit, never default privileges for future tables.
REVOKE ALL ON ALL TABLES IN SCHEMA gallery FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery."user", gallery.user_credential, gallery.session,
 gallery.site, gallery.album, gallery.album_draft, gallery.album_photo, gallery.homepage_item TO gallery_admin;
GRANT SELECT, INSERT ON gallery.album_release, gallery.album_release_photo TO gallery_admin;
GRANT INSERT ON gallery.audit_event TO gallery_admin;
GRANT SELECT ON gallery.immich_source_owner, gallery.album, gallery.album_release,
 gallery.album_release_photo, gallery.site, gallery.homepage_item TO gallery_view_owner;
