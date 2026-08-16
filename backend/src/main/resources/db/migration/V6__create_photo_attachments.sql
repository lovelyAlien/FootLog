CREATE TABLE IF NOT EXISTS photo_attachments (
  id UUID PRIMARY KEY,
  check_in_id UUID NOT NULL REFERENCES check_ins(id),
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready','deleted')),
  created_at TIMESTAMPTZ NOT NULL,
  ready_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- 교체 흐름 중에는 기존 ready 사진과 신규 uploading 사진이 일시적으로 공존해야 하므로
-- check_in_id 자체는 UNIQUE로 강제하지 않고, "활성 ready는 1장"만 부분 인덱스로 강제한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_attachments_ready_per_check_in
  ON photo_attachments(check_in_id) WHERE status = 'ready' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_photo_attachments_uploading
  ON photo_attachments(status, created_at) WHERE status = 'uploading';
