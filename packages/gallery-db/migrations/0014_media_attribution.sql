-- Additive Gallery-only settings. No source media or content relationships change.
CREATE TABLE gallery.media_attribution (
 id integer PRIMARY KEY CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 creator text NOT NULL DEFAULT '' CHECK (length(creator)<=200),
 homepage text NOT NULL DEFAULT '' CHECK (length(homepage)<=1000),
 copyright text NOT NULL DEFAULT '' CHECK (length(copyright)<=500),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gallery.media_attribution(id) VALUES(1);
REVOKE ALL ON gallery.media_attribution FROM PUBLIC;
GRANT SELECT ON gallery.media_attribution TO gallery_public,gallery_admin;
GRANT UPDATE ON gallery.media_attribution TO gallery_admin;
