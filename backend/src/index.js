require('dotenv').config();
const cron = require('node-cron');
const express = require('express');
const logger = require('./db/logger');
const { runCollectionJob } = require('./scheduler/collectJob');
const apiRoutes = require('./api/routes');

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`[Server] API 서버 실행 중: http://localhost:${PORT}`));

// ── 환경변수 검증 ─────────────────────────────────────────────
const REQUIRED_ENV = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_KEY',
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET',
  'YOUTUBE_API_KEY',
  'ANTHROPIC_API_KEY',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    logger.error(`필수 환경변수 누락: ${key}`);
    process.exit(1);
  }
}

// ── 크론 스케줄: 매일 오전 09:00 ────────────────────────────
const CRON_SCHEDULE = process.env.COLLECT_CRON || '0 9 * * *';

logger.info(`[Scheduler] 레시피 수집 스케줄 등록: ${CRON_SCHEDULE}`);

cron.schedule(CRON_SCHEDULE, async () => {
  logger.info('[Scheduler] 스케줄 트리거 — 수집 시작');
  try {
    await runCollectionJob();
  } catch (err) {
    logger.error('[Scheduler] 수집 실패', { error: err.message });
  }
}, {
  timezone: 'Asia/Seoul',
});

// ── 즉시 실행 옵션 ────────────────────────────────────────────
if (process.argv.includes('--run-now')) {
  logger.info('[Manual] 즉시 수집 실행 요청');
  runCollectionJob().then(() => {
    logger.info('[Manual] 완료');
    process.exit(0);
  }).catch(err => {
    logger.error('[Manual] 실패', { error: err.message });
    process.exit(1);
  });
} else {
  logger.info('[Scheduler] 대기 중... (매일 09:00 KST 실행)');
  logger.info('  즉시 실행: node src/index.js --run-now');
}

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM 수신 — 종료');
  process.exit(0);
});
