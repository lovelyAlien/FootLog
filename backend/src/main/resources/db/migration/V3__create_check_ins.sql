-- user_id에는 FK를 걸지 않는다: users 테이블은 별도 인증 설계 문서에서 도입한다.
CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION NOT NULL CHECK (accuracy_m >= 0),
  captured_at TIMESTAMPTZ NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_checked_in_at
  ON check_ins(user_id, checked_in_at);

CREATE INDEX IF NOT EXISTS idx_check_ins_user_active
  ON check_ins(user_id) WHERE deleted_at IS NULL;
