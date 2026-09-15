-- Gallery presentation settings; additive migration, no Immich objects changed.
ALTER TABLE gallery.site ADD COLUMN copyright_name text NOT NULL DEFAULT '' CHECK(length(copyright_name)<=100);
ALTER TABLE gallery.site ADD COLUMN footer_text text NOT NULL DEFAULT '' CHECK(length(footer_text)<=300);
SET ROLE gallery_view_owner;
CREATE OR REPLACE VIEW gallery.published_site WITH (security_barrier = true) AS
SELECT s.id,s.name,s.tagline,s.intro,s.about_document,s.contact_links,s.seo_description,
 c.album_id AS hero_album_id,s.copyright_name,s.footer_text
FROM gallery.site s LEFT JOIN gallery.published_cover c ON c.album_id=s.hero_album_id;
RESET ROLE;
