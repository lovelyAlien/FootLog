ALTER TABLE check_in_notes DROP CONSTRAINT check_in_notes_check_in_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_check_in_notes_check_in_id_active
  ON check_in_notes(check_in_id) WHERE deleted_at IS NULL;
