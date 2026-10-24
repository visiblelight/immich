-- Gallery visitor accounts are separate from administrator credentials and Immich.
CREATE TABLE gallery.community_settings (
 id smallint PRIMARY KEY CHECK(id=1),
 registration boolean NOT NULL DEFAULT false, comments boolean NOT NULL DEFAULT false,
 likes boolean NOT NULL DEFAULT false, show_comments boolean NOT NULL DEFAULT false,
 show_likes boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gallery.community_settings(id) VALUES(1);
CREATE TABLE gallery.member (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND length(email)<=254),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 40),
 avatar text NOT NULL UNIQUE, avatar_fingerprint text NOT NULL UNIQUE,
 disabled boolean NOT NULL DEFAULT false, trusted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gallery.member_session (
 token_hash bytea PRIMARY KEY CHECK(octet_length(token_hash)=32),
 member_id uuid NOT NULL REFERENCES gallery.member(id),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX member_session_member ON gallery.member_session(member_id);
CREATE INDEX member_session_expiry ON gallery.member_session(expires_at);
CREATE TABLE gallery.member_challenge (
 id uuid PRIMARY KEY, email text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('register','login','email-old','email-new')),
 member_id uuid REFERENCES gallery.member(id), name text,
 session_hash bytea, proof_hash bytea, code_hash bytea NOT NULL CHECK(octet_length(code_hash)=32),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 delivered boolean NOT NULL DEFAULT false, consumed_at timestamptz
);
CREATE INDEX member_challenge_email ON gallery.member_challenge(email,purpose,created_at DESC);
CREATE INDEX member_challenge_expiry ON gallery.member_challenge(expires_at);
CREATE TABLE gallery.community_comment (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES gallery.member(id),
 kind text NOT NULL CHECK(kind IN ('album','photo','article')), target_id uuid NOT NULL,
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 1000),
 status text NOT NULL CHECK(status IN ('pending','published','hidden','deleted')),
 reply text NOT NULL DEFAULT '' CHECK(length(reply)<=1000),
 moderated_by uuid REFERENCES gallery."user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_comment_target ON gallery.community_comment(kind,target_id,created_at DESC,id DESC);
CREATE INDEX community_comment_status ON gallery.community_comment(status,created_at DESC);
CREATE INDEX community_comment_member ON gallery.community_comment(member_id);
CREATE TABLE gallery.community_like (
 member_id uuid NOT NULL REFERENCES gallery.member(id),
 kind text NOT NULL CHECK(kind IN ('album','photo','article')), target_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(member_id,kind,target_id)
);
CREATE INDEX community_like_target ON gallery.community_like(kind,target_id);
REVOKE ALL ON gallery.community_settings,gallery.member,gallery.member_session,
 gallery.member_challenge,gallery.community_comment,gallery.community_like FROM PUBLIC;
GRANT SELECT,UPDATE ON gallery.community_settings TO gallery_admin;
GRANT SELECT,UPDATE ON gallery.member,gallery.member_session,gallery.community_comment TO gallery_admin;
GRANT SELECT ON gallery.community_like TO gallery_admin;
-- Existing installs can migrate with the feature disabled before provisioning its runtime role.
-- community-role.sql grants only these new objects when the feature is enabled.
