-- Persistent throttling works across admin instances and restarts.
CREATE TABLE gallery.auth_throttle (
 key_hash bytea PRIMARY KEY CHECK (octet_length(key_hash) = 32),
 attempts integer NOT NULL CHECK (attempts > 0),
 reset_at timestamptz NOT NULL
);
CREATE INDEX auth_throttle_expiry_idx ON gallery.auth_throttle(reset_at);
REVOKE ALL ON gallery.auth_throttle FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery.auth_throttle TO gallery_admin;
