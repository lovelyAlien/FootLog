CREATE TABLE IF NOT EXISTS daily_reflections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_reflections_user_date_active
  ON daily_reflections(user_id, date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_reflections_user_date
  ON daily_reflections(user_id, date);
