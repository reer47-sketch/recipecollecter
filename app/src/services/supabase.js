import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── 레시피 API ──────────────────────────────────────────────

export const recipeApi = {
  /** 레시피 목록 (트렌드 순) */
  async getList({ page = 0, limit = 20, tag = null } = {}) {
    let query = supabase
      .from('recipes')
      .select('id, name, reason, thumbnail_url, trend_score, tags, collected_at')
      .eq('is_active', true)
      .order('trend_score', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    // tags 배열 안에 해당 태그가 포함되거나, 유사 태그도 매칭 (예: "홈카페" → "카페" 필터)
    if (tag) query = query.filter('tags', 'cs', `{"${tag}"}`);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /** 레시피 상세 (재료 + 타임라인 포함) */
  async getDetail(recipeId) {
    const [recipeRes, ingredientsRes, stepsRes] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', recipeId).single(),
      supabase
        .from('ingredients')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('sort_order'),
      supabase
        .from('timeline_steps')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('sort_order'),
    ]);

    if (recipeRes.error) throw recipeRes.error;
    return {
      ...recipeRes.data,
      ingredients: ingredientsRes.data || [],
      timeline_steps: stepsRes.data || [],
    };
  },

  /** 레시피 삭제 (soft delete) */
  async delete(recipeId) {
    const { error } = await supabase
      .from('recipes')
      .update({ is_active: false })
      .eq('id', recipeId);
    if (error) throw error;
  },

  /** 키워드 검색 */
  async search(query) {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, name, reason, thumbnail_url, trend_score, tags')
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .limit(20);
    if (error) throw error;
    return data;
  },
};

// ─── 요리 세션 API ───────────────────────────────────────────

export const sessionApi = {
  /** 세션 생성 (따라하기 시작) */
  async create(recipeId, deviceId) {
    const { data, error } = await supabase
      .from('cooking_sessions')
      .insert({ recipe_id: recipeId, user_device: deviceId, status: 'in_progress' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** 세션 업데이트 (단계 진행) */
  async updateStep(sessionId, currentStep) {
    const { error } = await supabase
      .from('cooking_sessions')
      .update({ current_step: currentStep })
      .eq('id', sessionId);
    if (error) throw error;
  },

  /** 세션 완료 */
  async complete(sessionId, notes = '') {
    const { error } = await supabase
      .from('cooking_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), notes })
      .eq('id', sessionId);
    if (error) throw error;
  },

  /** 사진 업로드 및 기록 */
  async uploadPhoto(sessionId, stepId, stepNumber, localUri) {
    // React Native에서 Supabase Storage 업로드 — fetch → blob 방식
    const fileName = `sessions/${sessionId}/step_${stepNumber}_${Date.now()}.jpg`;

    const response = await fetch(localUri);
    const blob = await response.blob();

    const { error: storageErr } = await supabase.storage
      .from('cooking-photos')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

    if (storageErr) throw storageErr;

    const { data: { publicUrl } } = supabase.storage
      .from('cooking-photos')
      .getPublicUrl(fileName);

    // DB 기록
    const { data, error } = await supabase
      .from('session_photos')
      .insert({
        session_id: sessionId,
        step_id: stepId,
        step_number: stepNumber,
        photo_url: publicUrl,
        sort_order: stepNumber,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** 세션 조회 (저장된 sns_post 포함) */
  async getSession(sessionId) {
    const { data, error } = await supabase
      .from('cooking_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (error) throw error;
    return data;
  },

  /** 세션의 전체 사진 조회 */
  async getPhotos(sessionId) {
    const { data, error } = await supabase
      .from('session_photos')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order');
    if (error) throw error;
    return data;
  },
};

// ─── 재료 체크리스트 API ──────────────────────────────────────

export const ingredientApi = {
  /** 체크 상태 초기화 */
  async initChecks(sessionId, ingredientIds) {
    const inserts = ingredientIds.map(id => ({
      session_id: sessionId,
      ingredient_id: id,
      is_checked: false,
    }));
    const { error } = await supabase.from('ingredient_checks').insert(inserts);
    if (error && error.code !== '23505') throw error; // 이미 있으면 무시
  },

  /** 체크 상태 토글 */
  async toggleCheck(sessionId, ingredientId, isChecked) {
    const { error } = await supabase
      .from('ingredient_checks')
      .upsert({
        session_id: sessionId,
        ingredient_id: ingredientId,
        is_checked: isChecked,
      });
    if (error) throw error;
  },

  /** 체크 상태 조회 */
  async getChecks(sessionId) {
    const { data, error } = await supabase
      .from('ingredient_checks')
      .select('ingredient_id, is_checked, substitute_used')
      .eq('session_id', sessionId);
    if (error) throw error;
    return data || [];
  },
};
