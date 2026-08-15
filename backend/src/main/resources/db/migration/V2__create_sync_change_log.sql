CREATE TABLE IF NOT EXISTS sync_change_log (
  seq BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('check_in','check_in_note','daily_reflection','photo_attachment')),
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_user_seq
  ON sync_change_log(user_id, seq);
