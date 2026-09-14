-- Gallery articles are independent of albums and Immich. No upstream writes.
CREATE TABLE gallery.article (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','offline')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=1200000),
 current_release_id uuid, created_by uuid NOT NULL REFERENCES gallery."user"(id),
 updated_by uuid NOT NULL REFERENCES gallery."user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.article_release (
 id uuid PRIMARY KEY, article_id uuid NOT NULL REFERENCES gallery.article(id),
 source_version bigint NOT NULL, content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=1200000),
 published_by uuid NOT NULL REFERENCES gallery."user"(id), published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(article_id,id), UNIQUE(article_id,source_version)
);
ALTER TABLE gallery.article ADD FOREIGN KEY(id,current_release_id) REFERENCES gallery.article_release(article_id,id);
CREATE TABLE gallery.article_media (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name)<=200), storage_key uuid NOT NULL UNIQUE,
 mime_type text NOT NULL CHECK(mime_type='image/webp'), width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
 bytes bigint NOT NULL CHECK(bytes>0), checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 uploaded_by uuid NOT NULL REFERENCES gallery."user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.article_photo_ref (
 article_id uuid NOT NULL REFERENCES gallery.article(id), release_id uuid,
 node_key text NOT NULL, photo_id uuid NOT NULL REFERENCES gallery.photo(immich_asset_id), album_id uuid NOT NULL REFERENCES gallery.album(id),
 FOREIGN KEY(article_id,release_id) REFERENCES gallery.article_release(article_id,id)
);
CREATE UNIQUE INDEX article_photo_draft_unique ON gallery.article_photo_ref(article_id,node_key) WHERE release_id IS NULL;
CREATE UNIQUE INDEX article_photo_release_unique ON gallery.article_photo_ref(release_id,node_key) WHERE release_id IS NOT NULL;
CREATE TABLE gallery.article_media_ref (
 article_id uuid NOT NULL REFERENCES gallery.article(id), release_id uuid,
 node_key text NOT NULL, media_id uuid NOT NULL REFERENCES gallery.article_media(id),
 FOREIGN KEY(article_id,release_id) REFERENCES gallery.article_release(article_id,id)
);
CREATE UNIQUE INDEX article_media_draft_unique ON gallery.article_media_ref(article_id,node_key) WHERE release_id IS NULL;
CREATE UNIQUE INDEX article_media_release_unique ON gallery.article_media_ref(release_id,node_key) WHERE release_id IS NOT NULL;
CREATE INDEX article_media_usage ON gallery.article_media_ref(media_id);
CREATE TABLE gallery.article_album_ref (
 article_id uuid NOT NULL REFERENCES gallery.article(id), release_id uuid,
 album_id uuid NOT NULL REFERENCES gallery.album(id), position integer NOT NULL CHECK(position>=0),
 FOREIGN KEY(article_id,release_id) REFERENCES gallery.article_release(article_id,id)
);
CREATE UNIQUE INDEX article_album_draft_unique ON gallery.article_album_ref(article_id,album_id) WHERE release_id IS NULL;
CREATE UNIQUE INDEX article_album_release_unique ON gallery.article_album_ref(release_id,album_id) WHERE release_id IS NOT NULL;
ALTER TABLE gallery.site ADD COLUMN about_article_id uuid REFERENCES gallery.article(id), ADD COLUMN about_article_version bigint NOT NULL DEFAULT 1;
REVOKE ALL ON gallery.article,gallery.article_release,gallery.article_media,gallery.article_photo_ref,gallery.article_media_ref,gallery.article_album_ref FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON gallery.article TO gallery_admin;
GRANT SELECT,INSERT ON gallery.article_release TO gallery_admin;
GRANT SELECT,INSERT,DELETE ON gallery.article_media TO gallery_admin;
GRANT SELECT,INSERT,DELETE ON gallery.article_photo_ref,gallery.article_media_ref,gallery.article_album_ref TO gallery_admin;
GRANT SELECT ON gallery.article,gallery.article_release,gallery.article_media,gallery.article_photo_ref,gallery.article_media_ref,gallery.article_album_ref TO gallery_view_owner;
-- Reference rows of immutable releases may not be removed by runtime code.
CREATE FUNCTION gallery.guard_article_release_ref() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF OLD.release_id IS NOT NULL THEN RAISE EXCEPTION 'Article release references are immutable'; END IF; RETURN OLD; END $$;
REVOKE ALL ON FUNCTION gallery.guard_article_release_ref() FROM PUBLIC;
CREATE TRIGGER article_photo_ref_immutable BEFORE DELETE ON gallery.article_photo_ref FOR EACH ROW EXECUTE FUNCTION gallery.guard_article_release_ref();
CREATE TRIGGER article_media_ref_immutable BEFORE DELETE ON gallery.article_media_ref FOR EACH ROW EXECUTE FUNCTION gallery.guard_article_release_ref();
CREATE TRIGGER article_album_ref_immutable BEFORE DELETE ON gallery.article_album_ref FOR EACH ROW EXECUTE FUNCTION gallery.guard_article_release_ref();
SET LOCAL ROLE gallery_view_owner;
CREATE VIEW gallery.published_article WITH(security_barrier=true) AS
 SELECT a.id,a.slug,r.id AS release_id,r.content,r.published_at FROM gallery.article a
 JOIN gallery.article_release r ON r.id=a.current_release_id AND r.article_id=a.id WHERE a.status='published';
CREATE VIEW gallery.published_article_media WITH(security_barrier=true) AS
 SELECT DISTINCT a.id AS article_id,m.id,m.storage_key,m.mime_type,m.width,m.height
 FROM gallery.published_article a JOIN gallery.article_media_ref ref ON ref.release_id=a.release_id
 JOIN gallery.article_media m ON m.id=ref.media_id;
CREATE VIEW gallery.published_article_photo WITH(security_barrier=true) AS
 SELECT DISTINCT a.id AS article_id,p.album_id,p.photo_id,p.asset_id,p.title,p.alt_text,p.width,p.height
 FROM gallery.published_article a JOIN gallery.article_photo_ref ref ON ref.release_id=a.release_id
 JOIN gallery.published_photo p ON p.album_id=ref.album_id AND p.asset_id=ref.photo_id;
CREATE VIEW gallery.published_article_album WITH(security_barrier=true) AS
 SELECT a.id AS article_id,p.album_id,p.slug,p.title,ref.position
 FROM gallery.published_article a JOIN gallery.article_album_ref ref ON ref.release_id=a.release_id
 JOIN gallery.published_album p ON p.album_id=ref.album_id;
CREATE VIEW gallery.published_about_article WITH(security_barrier=true) AS
 SELECT a.* FROM gallery.site s JOIN gallery.published_article a ON a.id=s.about_article_id WHERE s.id=1;
GRANT SELECT ON gallery.published_article,gallery.published_article_media,gallery.published_article_photo,gallery.published_article_album,gallery.published_about_article TO gallery_public,gallery_admin;
RESET ROLE;
