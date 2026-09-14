-- Derive actual publication time from immutable releases; do not rewrite article content.
SET ROLE gallery_view_owner;
CREATE OR REPLACE VIEW gallery.published_article WITH(security_barrier=true) AS
 SELECT a.id,a.slug,r.id AS release_id,r.content,r.published_at,
   (SELECT min(first_release.published_at) FROM gallery.article_release first_release WHERE first_release.article_id=a.id) AS first_published_at
 FROM gallery.article a JOIN gallery.article_release r ON r.id=a.current_release_id AND r.article_id=a.id
 WHERE a.status='published';
CREATE OR REPLACE VIEW gallery.published_about_article WITH(security_barrier=true) AS
 SELECT a.* FROM gallery.site s JOIN gallery.published_article a ON a.id=s.about_article_id WHERE s.id=1;
RESET ROLE;
