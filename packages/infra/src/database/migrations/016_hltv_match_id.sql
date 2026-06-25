-- Link Polymarket-driven matches to HLTV match pages for community votes
ALTER TABLE matches ADD COLUMN hltv_match_id TEXT;
