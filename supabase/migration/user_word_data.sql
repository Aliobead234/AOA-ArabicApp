-- ============================================================
-- user_word_data
-- Stores per-user favourites, loved words, and AI-added words.
-- Each user gets exactly one row. Data is stored as JSONB arrays.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_word_data (
                                              user_id       TEXT        PRIMARY KEY,
                                              favorites     JSONB       NOT NULL DEFAULT '[]'::jsonb,
                                              loved         JSONB       NOT NULL DEFAULT '[]'::jsonb,
                                              added_words   JSONB       NOT NULL DEFAULT '[]'::jsonb,
                                              data_size_b   INTEGER     NOT NULL DEFAULT 0,        -- cached byte-size for fast limit checks
                                              updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

-- Index so admin queries per user are instant
CREATE INDEX IF NOT EXISTS idx_user_word_data_updated
    ON user_word_data (updated_at DESC);

-- ── Row-Level Security ─────────────────────────────────────
-- Users may only read and write their own row.
ALTER TABLE user_word_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own word data"
  ON user_word_data FOR SELECT
                                   USING (auth.uid()::text = user_id);

CREATE POLICY "Users insert own word data"
  ON user_word_data FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users update own word data"
  ON user_word_data FOR UPDATE
                                          USING  (auth.uid()::text = user_id)
                        WITH CHECK (auth.uid()::text = user_id);

-- ── Helper function: auto-refresh updated_at ───────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_word_data_updated_at
    BEFORE UPDATE ON user_word_data
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();