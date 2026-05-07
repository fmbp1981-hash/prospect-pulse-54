CREATE TABLE IF NOT EXISTS webhook_keys (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text        NOT NULL,
  key_hash    text        NOT NULL UNIQUE,
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE webhook_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own webhook keys"
  ON webhook_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX webhook_keys_hash_idx ON webhook_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX webhook_keys_user_idx ON webhook_keys(user_id);
