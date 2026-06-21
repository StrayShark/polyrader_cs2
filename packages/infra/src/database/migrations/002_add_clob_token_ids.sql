-- Add clob_token_ids column to markets table
-- This is needed for order book fetching (Polymarket CLOB API requires token IDs)
ALTER TABLE markets ADD COLUMN clob_token_ids TEXT DEFAULT '[]';

-- Create index for faster CS2 market filtering by question text
CREATE INDEX IF NOT EXISTS idx_markets_question ON markets(question);
