CREATE TABLE IF NOT EXISTS check_in_notes (
  id UUID PRIMARY KEY,
  check_in_id UUID NOT NULL UNIQUE REFERENCES check_ins(id),
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
