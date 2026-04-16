# Recipe Collector — 시작 가이드

## 필요한 API 키 목록

| 서비스 | 발급 URL | 용도 |
|--------|----------|------|
| Supabase | https://supabase.com | DB + 파일 저장 |
| Naver Developers | https://developers.naver.com | 블로그 검색 API |
| Google Cloud Console | https://console.cloud.google.com | YouTube Data API v3 |
| Anthropic | https://console.anthropic.com | Claude API (레시피 AI 처리) |

---

## 1단계: Supabase 설정

1. https://supabase.com 에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. Storage → New Bucket → 이름: `cooking-photos`, Public: ON
4. Settings → API에서 `URL`, `anon key`, `service_role key` 복사

---

## 2단계: 백엔드 서버 실행

```bash
cd backend
cp .env.example .env
# .env 파일에 API 키 입력

npm install
node src/index.js          # 스케줄러 시작 (매일 09:00 KST 자동 실행)
node src/index.js --run-now  # 즉시 수집 테스트
```

### Railway 배포 (선택)
```bash
# Railway CLI 설치 후
railway login
railway init
railway up
# 환경변수는 Railway 대시보드에서 설정
```

---

## 3단계: React Native 앱 실행

```bash
cd app
cp .env.example .env
# .env 파일에 Supabase URL/Key, 백엔드 URL 입력

npm install
npx expo start          # Expo Go 앱으로 미리보기
npx expo start --android  # Android 에뮬레이터
npx expo start --ios      # iOS 시뮬레이터 (Mac 필요)
```

---

## 수집 흐름

```
매일 09:00 KST
  → 네이버 블로그 검색 (트렌드 키워드 8개)
  → YouTube Shorts 검색 (트렌드 키워드 8개)
  → 원본 소스 DB 저장
  → AI (Claude): 동일 레시피 10개 이상 → 통합 처리
  → 표준 포맷으로 변환 (이름/이유/재료/타임라인)
  → Supabase 저장
  → 앱에서 즉시 조회 가능
```

---

## 프로젝트 구조

```
recipe-collector/
├── supabase/
│   └── schema.sql              # DB 테이블 정의
├── backend/
│   ├── src/
│   │   ├── index.js            # 서버 진입점 + 크론 스케줄러
│   │   ├── scheduler/
│   │   │   └── collectJob.js   # 수집 오케스트레이션
│   │   ├── scrapers/
│   │   │   ├── naverBlog.js    # 네이버 블로그 수집
│   │   │   └── youtube.js      # YouTube 수집
│   │   ├── ai/
│   │   │   └── recipeProcessor.js  # Claude API 처리
│   │   ├── api/
│   │   │   └── routes.js       # REST API 엔드포인트
│   │   └── db/
│   │       ├── supabase.js     # Supabase 클라이언트
│   │       └── logger.js       # 로깅
│   └── .env.example
└── app/
    ├── App.js                  # 앱 진입점
    ├── src/
    │   ├── navigation/         # 화면 네비게이션
    │   ├── screens/
    │   │   ├── HomeScreen.jsx            # 트렌드 레시피 목록
    │   │   ├── RecipeDetailScreen.jsx    # 레시피 상세
    │   │   ├── IngredientCheckScreen.jsx # 재료 체크리스트
    │   │   ├── CookingModeScreen.jsx     # 따라하기 모드
    │   │   └── CookingJournalScreen.jsx  # 요리 기록 + SNS
    │   ├── services/
    │   │   ├── supabase.js     # DB API
    │   │   └── notifications.js  # 푸시 알림
    │   └── utils/
    │       └── device.js       # 디바이스 ID
    └── .env.example
```
