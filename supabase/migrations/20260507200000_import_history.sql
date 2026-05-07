CREATE TABLE IF NOT EXISTS import_history (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source      text        NOT NULL CHECK (source IN ('manual', 'webhook', 'google_drive')),
  filename    text,
  created     integer     NOT NULL DEFAULT 0,
  updated     integer     NOT NULL DEFAULT 0,
  skipped     integer     NOT NULL DEFAULT 0,
  errors      integer     NOT NULL DEFAULT 0,
  import_id   text        NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own history"
  ON import_history FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS import_history_user_date
  ON import_history(user_id, created_at DESC);
