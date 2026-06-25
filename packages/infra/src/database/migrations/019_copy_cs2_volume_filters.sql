-- CS2 focus + relative market volume filters for copy trading
ALTER TABLE wallet_copy_config ADD COLUMN min_market_volume_share REAL DEFAULT 0.02;
ALTER TABLE wallet_copy_config ADD COLUMN min_market_volume_usd REAL DEFAULT 5000;
ALTER TABLE wallet_copy_signals ADD COLUMN leader_volume_share REAL;
