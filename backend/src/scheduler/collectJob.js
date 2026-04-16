/**
 * 레시피 수집 메인 오케스트레이션
 * 매일 09시 실행되는 핵심 작업
 */
const supabase = require('../db/supabase');
const logger = require('../db/logger');
const naverScraper = require('../scrapers/naverBlog');
const youtubeScraper = require('../scrapers/youtube');
const ai = require('../ai/recipeProcessor');

const MIN_SOURCES = parseInt(process.env.MIN_SOURCES_TO_AGGREGATE || '3');

/**
 * 메인 수집 작업 실행
 */
async function runCollectionJob() {
  logger.info('========== 레시피 수집 작업 시작 ==========');
  const startTime = Date.now();

  // 수집 로그 생성
  const { data: log, error: logErr } = await supabase
    .from('collection_logs')
    .insert({ status: 'running', run_date: new Date().toISOString().split('T')[0] })
    .select()
    .single();

  if (logErr) {
    logger.error('수집 로그 생성 실패', { error: logErr.message });
    return;
  }

  const logId = log.id;
  let stats = { total_sources: 0, new_recipes: 0, updated_recipes: 0 };

  try {
    // ── 1단계: 원본 수집 ──────────────────────────────────────
    logger.info('[Step 1] 네이버 블로그 + YouTube 수집 중...');
    const [naverResults, youtubeResults] = await Promise.all([
      naverScraper.collectTodayRecipes(),
      youtubeScraper.collectTodayRecipes(),
    ]);

    const allSources = [...naverResults, ...youtubeResults];
    stats.total_sources = allSources.length;
    logger.info(`[Step 1] 수집 완료: 총 ${allSources.length}개 (Naver: ${naverResults.length}, YouTube: ${youtubeResults.length})`);

    // ── 2단계: 원본 소스 DB 저장 ──────────────────────────────
    logger.info('[Step 2] 원본 소스 DB 저장 중...');
    const rawSourcesData = allSources.map(s => ({
      log_id: logId,
      platform: s.platform,
      title: s.title,
      url: s.url,
      content: s.content || s.description || '',
      author: s.blogName || s.channelTitle || null,
      published_at: s.publishedAt || null,
    }));

    // 배치 삽입 (100개씩)
    for (let i = 0; i < rawSourcesData.length; i += 100) {
      await supabase.from('raw_sources').insert(rawSourcesData.slice(i, i + 100));
    }

    // ── 3단계: 트렌드 레시피 이름 추출 (AI) ──────────────────
    logger.info('[Step 3] AI로 트렌드 레시피 이름 추출 중...');
    const trendingRecipes = await ai.extractTrendingRecipeNames(allSources);
    logger.info(`[Step 3] 트렌드 레시피 ${trendingRecipes.length}개 감지`);

    if (!trendingRecipes.length) {
      throw new Error('트렌드 레시피를 찾지 못했습니다.');
    }

    // ── 4단계: 임계값(10개 이상) 레시피만 통합 처리 ──────────
    logger.info(`[Step 4] ${MIN_SOURCES}개 이상 언급된 레시피 통합 처리 중...`);
    const hotRecipes = trendingRecipes.filter(r => r.count >= MIN_SOURCES);
    logger.info(`[Step 4] 처리 대상: ${hotRecipes.length}개`);

    const changes = []; // 주요 변경 사항 기록

    for (const trend of hotRecipes) {
      try {
        await processOneRecipe(trend, allSources, logId, stats, changes);
        await sleep(2000); // AI API rate limit
      } catch (err) {
        logger.error(`[Step 4] "${trend.name}" 처리 실패`, { error: err.message });
      }
    }

    // ── 5단계: 완료 처리 ──────────────────────────────────────
    const duration = Math.round((Date.now() - startTime) / 1000);
    logger.info(`========== 수집 완료: ${duration}초 소요 ==========`);
    logger.info(`신규: ${stats.new_recipes}개, 업데이트: ${stats.updated_recipes}개`);

    await supabase
      .from('collection_logs')
      .update({
        status: 'completed',
        total_sources: stats.total_sources,
        new_recipes: stats.new_recipes,
        updated_recipes: stats.updated_recipes,
        finished_at: new Date().toISOString(),
        details: { duration_seconds: duration, changes },
      })
      .eq('id', logId);

  } catch (err) {
    logger.error('수집 작업 실패', { error: err.message });
    await supabase
      .from('collection_logs')
      .update({
        status: 'failed',
        error_message: err.message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId);
  }
}

/**
 * 개별 레시피 처리 (통합 → DB 저장)
 */
async function processOneRecipe(trend, allSources, logId, stats, changes) {
  const { name } = trend;

  // 관련 소스 필터링
  const relatedSources = allSources.filter(s =>
    s.title.toLowerCase().includes(name.toLowerCase()) ||
    (trend.variations || []).some(v => s.title.toLowerCase().includes(v.toLowerCase()))
  );

  logger.info(`[Recipe] "${name}" 처리 (관련 소스: ${relatedSources.length}개)`);

  // AI 레시피 통합
  const aggregated = await ai.aggregateRecipe(name, relatedSources);
  if (!aggregated) return;

  // 주요 변경 사항 기록
  if (aggregated.major_variations) {
    changes.push({ recipe: name, note: aggregated.major_variations });
  }

  // 기존 레시피 확인
  const { data: existing } = await supabase
    .from('recipes')
    .select('id, trend_score')
    .ilike('name', name)
    .single();

  if (existing) {
    // 업데이트
    await updateRecipe(existing.id, aggregated, relatedSources, logId, trend.count);
    stats.updated_recipes++;
  } else {
    // 신규 삽입
    await insertRecipe(aggregated, relatedSources, logId, trend.count);
    stats.new_recipes++;
  }
}

async function insertRecipe(aggregated, sources, logId, sourceCount) {
  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({
      name: aggregated.name,
      reason: aggregated.reason,
      trend_score: sourceCount,
      source_count: sourceCount,
      tags: aggregated.tags || [],
      sources: sources.slice(0, 20).map(s => ({ url: s.url, title: s.title, platform: s.platform })),
    })
    .select()
    .single();

  if (error) {
    logger.error(`[DB] 레시피 삽입 실패: ${aggregated.name}`, { error: error.message });
    return;
  }

  const recipeId = recipe.id;

  // 재료 삽입
  if (aggregated.ingredients?.length) {
    const ingredientsData = aggregated.ingredients.map((ing, idx) => ({
      recipe_id: recipeId,
      name: ing.name,
      amount: ing.amount || '',
      unit: ing.unit || '',
      is_optional: ing.is_optional || false,
      sort_order: idx,
      substitutes: ing.substitutes || [],
    }));
    await supabase.from('ingredients').insert(ingredientsData);
  }

  // 타임라인 단계 삽입
  if (aggregated.timeline_steps?.length) {
    const stepsData = aggregated.timeline_steps.map((step, idx) => ({
      recipe_id: recipeId,
      step_number: step.step_number || idx + 1,
      title: step.title,
      description: step.description,
      duration_minutes: step.duration_minutes || 0,
      timer_required: step.timer_required || false,
      is_photo_moment: step.is_photo_moment || false,
      tip: step.tip || null,
      sort_order: idx,
    }));
    await supabase.from('timeline_steps').insert(stepsData);
  }

  // 원본 소스 연결
  await supabase
    .from('raw_sources')
    .update({ recipe_id: recipeId, is_processed: true })
    .in('url', sources.slice(0, 20).map(s => s.url));

  logger.info(`[DB] 신규 레시피 저장 완료: ${aggregated.name}`);
}

async function updateRecipe(recipeId, aggregated, sources, logId, sourceCount) {
  await supabase
    .from('recipes')
    .update({
      reason: aggregated.reason,
      trend_score: sourceCount,
      source_count: sourceCount,
      tags: aggregated.tags || [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', recipeId);

  logger.info(`[DB] 레시피 업데이트 완료: ${aggregated.name}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runCollectionJob };
