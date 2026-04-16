/**
 * 백엔드 API 라우트
 * 앱에서 호출하는 엔드포인트
 */
const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const ai = require('../ai/recipeProcessor');
const logger = require('../db/logger');
const { searchNaverBlog } = require('../scrapers/naverBlog');
const { searchYouTube } = require('../scrapers/youtube');

// Express 설치 필요 시 package.json에 추가
// "express": "^4.21.0"

/**
 * POST /api/generate-post
 * 요리 기록 → SNS 게시글 생성
 */
router.post('/generate-post', async (req, res) => {
  const { sessionId, recipeId } = req.body;
  logger.info('게시글 생성 요청 수신', { sessionId, recipeId });

  if (!sessionId || !recipeId) {
    return res.status(400).json({ error: 'sessionId, recipeId 필수' });
  }

  // 90초 타임아웃 (Claude API 응답 대기)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      logger.error('게시글 생성 타임아웃');
      res.status(504).json({ error: '요청 시간이 초과됐습니다. 다시 시도해주세요.' });
    }
  }, 90000);

  try {
    // 세션 + 레시피 + 재료 + 단계 조회
    logger.info('Supabase 조회 시작');
    const [sessionRes, recipeRes, ingredientsRes, stepsRes] = await Promise.all([
      supabase.from('cooking_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('recipes').select('*').eq('id', recipeId).single(),
      supabase.from('ingredients').select('*').eq('recipe_id', recipeId).order('sort_order'),
      supabase.from('timeline_steps').select('*').eq('recipe_id', recipeId).order('sort_order'),
    ]);
    logger.info('Supabase 조회 완료');

    if (sessionRes.error || recipeRes.error) {
      logger.error('데이터 조회 실패', {
        sessionId,
        recipeId,
        sessionError: sessionRes.error?.message,
        recipeError: recipeRes.error?.message,
      });
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
    }

    // 레시피에 재료 + 단계 포함
    const fullRecipe = {
      ...recipeRes.data,
      ingredients: ingredientsRes.data || [],
      timeline_steps: stepsRes.data || [],
    };

    logger.info('Claude AI 호출 시작');
    const post = await ai.generateSnsPost(
      fullRecipe,
      sessionRes.data,
      []
    );
    logger.info('Claude AI 호출 완료');

    if (!post) {
      return res.status(500).json({ error: '게시글 생성 실패' });
    }

    logger.info('SNS 게시글 생성 완료', { keys: Object.keys(post) });
    res.json(post);
  } catch (err) {
    logger.error('SNS 게시글 생성 API 오류', { error: err.message });
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    clearTimeout(timeout);
  }
});

/**
 * POST /api/substitutes
 * 없는 재료 → 대체 재료 추천
 */
router.post('/substitutes', async (req, res) => {
  const { missingIngredients, recipeName } = req.body;

  if (!missingIngredients?.length || !recipeName) {
    return res.status(400).json({ error: 'missingIngredients, recipeName 필수' });
  }

  try {
    const result = await ai.recommendSubstitutes(missingIngredients, recipeName);
    res.json(result);
  } catch (err) {
    logger.error('대체 재료 추천 API 오류', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/add-recipe
 * 사용자가 원하는 레시피를 직접 검색해서 추가
 */
router.post('/add-recipe', async (req, res) => {
  const { recipeName } = req.body;
  if (!recipeName?.trim()) {
    return res.status(400).json({ error: '레시피 이름을 입력해주세요.' });
  }

  const name = recipeName.trim();
  logger.info(`[AddRecipe] "${name}" 추가 요청`);

  const timeout = setTimeout(() => {
    if (!res.headersSent) res.status(504).json({ error: '처리 시간이 초과됐습니다. 다시 시도해주세요.' });
  }, 120000);

  try {
    // 1) 이미 있는 레시피인지 확인
    const { data: existing } = await supabase
      .from('recipes')
      .select('id')
      .ilike('name', name)
      .eq('is_active', true)
      .single();

    if (existing) {
      clearTimeout(timeout);
      return res.json({ id: existing.id, already_exists: true });
    }

    // 2) Naver + YouTube 검색
    logger.info(`[AddRecipe] "${name}" 검색 중...`);
    const [naverResults, youtubeResults] = await Promise.all([
      searchNaverBlog(`${name} 레시피`, 30).catch(() => []),
      searchYouTube(`${name} 만들기`, 10).catch(() => []),
    ]);
    const sources = [...naverResults, ...youtubeResults];
    logger.info(`[AddRecipe] 소스 ${sources.length}개 수집 완료`);

    // 3) Claude로 레시피 통합
    const aggregated = await ai.aggregateRecipe(name, sources);
    if (!aggregated) {
      clearTimeout(timeout);
      return res.status(500).json({ error: '레시피를 찾을 수 없습니다. 다른 이름으로 시도해보세요.' });
    }

    // 4) DB 저장
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .insert({
        name: aggregated.name,
        reason: aggregated.reason,
        trend_score: 0,
        source_count: sources.length,
        tags: aggregated.tags || [],
        sources: sources.slice(0, 10).map(s => ({ url: s.url, title: s.title, platform: s.platform })),
      })
      .select()
      .single();

    if (recipeErr) throw recipeErr;

    if (aggregated.ingredients?.length) {
      await supabase.from('ingredients').insert(
        aggregated.ingredients.map((ing, idx) => ({
          recipe_id: recipe.id,
          name: ing.name,
          amount: ing.amount || '',
          unit: ing.unit || '',
          is_optional: ing.is_optional || false,
          sort_order: idx,
          substitutes: ing.substitutes || [],
        }))
      );
    }

    if (aggregated.timeline_steps?.length) {
      await supabase.from('timeline_steps').insert(
        aggregated.timeline_steps.map((step, idx) => ({
          recipe_id: recipe.id,
          step_number: step.step_number || idx + 1,
          title: step.title,
          description: step.description,
          duration_minutes: step.duration_minutes || 0,
          timer_required: step.timer_required || false,
          is_photo_moment: step.is_photo_moment || false,
          tip: step.tip || null,
          sort_order: idx,
        }))
      );
    }

    logger.info(`[AddRecipe] "${aggregated.name}" 저장 완료 (id: ${recipe.id})`);
    clearTimeout(timeout);
    res.json({ id: recipe.id, name: aggregated.name, already_exists: false });

  } catch (err) {
    logger.error('[AddRecipe] 실패', { error: err.message });
    clearTimeout(timeout);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/collect
 * Vercel Cron이 매일 호출하는 레시피 수집 엔드포인트
 * Authorization: Bearer <CRON_SECRET> 헤더로 보호
 */
router.get('/collect', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  logger.info('[Cron] 레시피 수집 시작');
  try {
    const { runCollectionJob } = require('../scheduler/collectJob');
    await runCollectionJob();
    logger.info('[Cron] 수집 완료');
    res.json({ ok: true, message: '수집 완료' });
  } catch (err) {
    logger.error('[Cron] 수집 실패', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/health
 * 서버 상태 확인
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
