-- ── Add custom_folders to existing user_word_data table ──────────────────────
-- Run this in Supabase SQL editor AFTER the first migration.
-- Safe to run multiple times (IF NOT EXISTS / idempotent).

ALTER TABLE user_word_data
    ADD COLUMN IF NOT EXISTS custom_folders JSONB NOT NULL DEFAULT '[]'::jsonb;