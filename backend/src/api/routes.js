/**
 * 백엔드 API 라우트
 * 앱에서 호출하는 엔드포인트
 */
const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const ai = require('../ai/recipeProcessor');
const logger = require('../db/logger');

// Express 설치 필요 시 package.json에 추가
// "express": "^4.21.0"

/**
 * POST /api/generate-post
 * 요리 기록 → SNS 게시글 생성
 */
router.post('/generate-post', async (req, res) => {
  const { sessionId, recipeId } = req.body;

  if (!sessionId || !recipeId) {
    return res.status(400).json({ error: 'sessionId, recipeId 필수' });
  }

  try {
    // 세션 + 레시피 + 사진 조회
    const [sessionRes, recipeRes, photosRes] = await Promise.all([
      supabase.from('cooking_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('recipes').select('*').eq('id', recipeId).single(),
      supabase.from('session_photos').select('*').eq('session_id', sessionId).order('sort_order'),
    ]);

    if (sessionRes.error || recipeRes.error) {
      logger.error('데이터 조회 실패', {
        sessionId,
        recipeId,
        sessionError: sessionRes.error?.message,
        recipeError: recipeRes.error?.message,
      });
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
    }

    const post = await ai.generateSnsPost(
      recipeRes.data,
      sessionRes.data,
      photosRes.data || []
    );

    if (!post) {
      return res.status(500).json({ error: '게시글 생성 실패' });
    }

    logger.info('SNS 게시글 생성 완료', { keys: Object.keys(post) });
    res.json(post);
  } catch (err) {
    logger.error('SNS 게시글 생성 API 오류', { error: err.message });
    res.status(500).json({ error: err.message });
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
 * GET /api/health
 * 서버 상태 확인
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
