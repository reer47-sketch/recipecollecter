-- ============================================================
-- Recipe Collector - Supabase Schema
-- ============================================================

-- 확장 기능
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- 텍스트 유사도 검색용

-- ============================================================
-- 1. 레시피 테이블
-- ============================================================
CREATE TABLE recipes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  reason        TEXT,                        -- 왜 유명한지 이유
  thumbnail_url TEXT,                        -- 완성된 모습 사진 URL
  trend_score   INTEGER DEFAULT 0,           -- 수집된 문서 수 (트렌드 점수)
  source_count  INTEGER DEFAULT 0,           -- 동일 레시피 원본 문서 수
  sources       JSONB DEFAULT '[]',          -- 원본 URL 목록
  tags          TEXT[] DEFAULT '{}',         -- 태그 (한식, 양식 등)
  collected_at  TIMESTAMPTZ DEFAULT NOW(),   -- 최초 수집 일자
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  is_active     BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_recipes_collected_at ON recipes(collected_at DESC);
CREATE INDEX idx_recipes_trend_score ON recipes(trend_score DESC);
CREATE INDEX idx_recipes_name_trgm ON recipes USING GIN(name gin_trgm_ops);

-- ============================================================
-- 2. 재료 테이블
-- ============================================================
CREATE TABLE ingredients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id     UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        TEXT,                        -- 분량 (예: "200g", "1개", "적당량")
  unit          TEXT,                        -- 단위
  is_optional   BOOLEAN DEFAULT FALSE,       -- 선택 재료 여부
  sort_order    INTEGER DEFAULT 0,
  substitutes   JSONB DEFAULT '[]'           -- 대체 가능 재료 목록
);

CREATE INDEX idx_ingredients_recipe_id ON ingredients(recipe_id);

-- ============================================================
-- 3. 타임라인 단계 테이블
-- ============================================================
CREATE TABLE timeline_steps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number     INTEGER NOT NULL,
  title           TEXT NOT NULL,             -- 단계 제목 (예: "재료 손질")
  description     TEXT NOT NULL,             -- 상세 설명
  duration_minutes INTEGER DEFAULT 0,        -- 소요 시간 (분)
  timer_required  BOOLEAN DEFAULT FALSE,     -- 타이머 필요 여부
  is_photo_moment BOOLEAN DEFAULT FALSE,     -- 사진 촬영 권장 시점
  tip             TEXT,                      -- 팁/주의사항
  sort_order      INTEGER DEFAULT 0
);

CREATE INDEX idx_timeline_steps_recipe_id ON timeline_steps(recipe_id);

-- ============================================================
-- 4. 수집 로그 테이블 (매일 실행 기록)
-- ============================================================
CREATE TABLE collection_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT DEFAULT 'pending',    -- pending | running | completed | failed
  total_sources   INTEGER DEFAULT 0,
  new_recipes     INTEGER DEFAULT 0,
  updated_recipes INTEGER DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  details         JSONB DEFAULT '{}'
);

CREATE INDEX idx_collection_logs_run_date ON collection_logs(run_date DESC);

-- ============================================================
-- 5. 수집된 원본 문서 테이블
-- ============================================================
CREATE TABLE raw_sources (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id     UUID REFERENCES recipes(id) ON DELETE SET NULL,
  log_id        UUID REFERENCES collection_logs(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,              -- naver_blog | youtube
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  content       TEXT,                       -- 원문 내용 (블로그)
  author        TEXT,
  published_at  TIMESTAMPTZ,
  collected_at  TIMESTAMPTZ DEFAULT NOW(),
  is_processed  BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_raw_sources_recipe_id ON raw_sources(recipe_id);
CREATE INDEX idx_raw_sources_collected_at ON raw_sources(collected_at DESC);
CREATE INDEX idx_raw_sources_platform ON raw_sources(platform);

-- ============================================================
-- 6. 요리 세션 테이블 (사용자가 따라하기 시작)
-- ============================================================
CREATE TABLE cooking_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id     UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_device   TEXT,                        -- 디바이스 식별자 (인증 없는 경우)
  status        TEXT DEFAULT 'in_progress', -- in_progress | completed | paused
  current_step  INTEGER DEFAULT 1,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  notes         TEXT                         -- 개인 메모
);

CREATE INDEX idx_cooking_sessions_recipe_id ON cooking_sessions(recipe_id);
CREATE INDEX idx_cooking_sessions_started_at ON cooking_sessions(started_at DESC);

-- ============================================================
-- 7. 요리 기록 사진 테이블
-- ============================================================
CREATE TABLE session_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    UUID NOT NULL REFERENCES cooking_sessions(id) ON DELETE CASCADE,
  step_id       UUID REFERENCES timeline_steps(id) ON DELETE SET NULL,
  step_number   INTEGER,
  photo_url     TEXT NOT NULL,               -- Supabase Storage URL
  caption       TEXT,
  taken_at      TIMESTAMPTZ DEFAULT NOW(),
  sort_order    INTEGER DEFAULT 0
);

CREATE INDEX idx_session_photos_session_id ON session_photos(session_id);

-- ============================================================
-- 8. 재료 체크리스트 상태 (세션별)
-- ============================================================
CREATE TABLE ingredient_checks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES cooking_sessions(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  is_checked      BOOLEAN DEFAULT FALSE,
  substitute_used TEXT,                      -- 사용한 대체 재료
  UNIQUE(session_id, ingredient_id)
);

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (Supabase 보안)
-- ============================================================
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_checks ENABLE ROW LEVEL SECURITY;

-- 읽기는 모두 허용 (공개 레시피)
CREATE POLICY "recipes_public_read" ON recipes FOR SELECT USING (true);
CREATE POLICY "ingredients_public_read" ON ingredients FOR SELECT USING (true);
CREATE POLICY "timeline_steps_public_read" ON timeline_steps FOR SELECT USING (true);

-- 쓰기는 service_role (백엔드 서버)만 허용
CREATE POLICY "recipes_service_insert" ON recipes FOR INSERT WITH CHECK (true);
CREATE POLICY "recipes_service_update" ON recipes FOR UPDATE USING (true);
CREATE POLICY "ingredients_service_write" ON ingredients FOR ALL USING (true);
CREATE POLICY "timeline_steps_service_write" ON timeline_steps FOR ALL USING (true);
CREATE POLICY "collection_logs_service_write" ON collection_logs FOR ALL USING (true);
CREATE POLICY "raw_sources_service_write" ON raw_sources FOR ALL USING (true);

-- 요리 세션은 본인 디바이스만 (간단 구현)
CREATE POLICY "cooking_sessions_all" ON cooking_sessions FOR ALL USING (true);
CREATE POLICY "session_photos_all" ON session_photos FOR ALL USING (true);
CREATE POLICY "ingredient_checks_all" ON ingredient_checks FOR ALL USING (true);
