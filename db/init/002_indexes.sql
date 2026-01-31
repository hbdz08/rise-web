-- Performance indexes (safe to run multiple times)
-- Notes:
-- - These are mainly used for rankings and campaign lists.

CREATE INDEX IF NOT EXISTS raise_items_campaign_raise_amount_idx
  ON raise_items (campaign_id, raise_amount);

CREATE INDEX IF NOT EXISTS raise_campaigns_status_effective_date_idx
  ON raise_campaigns (status, effective_date DESC);

