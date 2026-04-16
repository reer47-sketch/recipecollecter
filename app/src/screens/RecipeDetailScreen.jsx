import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { recipeApi } from '../services/supabase';

export default function RecipeDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { recipeId } = route.params;

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ingredients');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    recipeApi.getDetail(recipeId)
      .then(setRecipe)
      .catch(err => {
        console.error('레시피 상세 로드 실패:', err.message);
        Alert.alert('오류', '레시피를 불러오지 못했습니다.');
        navigation.goBack();
      })
      .finally(() => setLoading(false));
  }, [recipeId]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      '레시피 삭제',
      `"${recipe?.name}"을(를) 삭제하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await recipeApi.delete(recipeId);
              navigation.goBack();
            } catch (err) {
              console.error('삭제 실패:', err.message);
              Alert.alert('오류', '삭제에 실패했습니다.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [recipe, recipeId, navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleDelete} disabled={deleting} style={{ paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 13, color: '#e53935', fontWeight: '600' }}>
            {deleting ? '삭제 중...' : '삭제'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [handleDelete, deleting]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!recipe) return null;

  const totalTime = recipe.timeline_steps?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;

  return (
    <View style={styles.container}>
      <ScrollView>
        {/* 썸네일 */}
        {recipe.thumbnail_url ? (
          <Image source={{ uri: recipe.thumbnail_url }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <View style={styles.heroIcon} />
          </View>
        )}

        <View style={styles.content}>
          {/* 기본 정보 */}
          <View style={styles.metaRow}>
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>{totalTime}분</Text>
            </View>
            {recipe.difficulty && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>{recipe.difficulty}</Text>
              </View>
            )}
            {recipe.servings && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>{recipe.servings}</Text>
              </View>
            )}
            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>TREND {recipe.trend_score}</Text>
            </View>
          </View>

          <Text style={styles.title}>{recipe.name}</Text>

          {/* 유행 이유 */}
          {recipe.reason && (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>WHY TRENDING</Text>
              <Text style={styles.reasonText}>{recipe.reason}</Text>
            </View>
          )}

          {/* 탭 */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'ingredients' && styles.tabActive]}
              onPress={() => setActiveTab('ingredients')}
            >
              <Text style={[styles.tabText, activeTab === 'ingredients' && styles.tabTextActive]}>
                재료 ({recipe.ingredients?.length || 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'timeline' && styles.tabActive]}
              onPress={() => setActiveTab('timeline')}
            >
              <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>
                조리 순서 ({recipe.timeline_steps?.length || 0})
              </Text>
            </TouchableOpacity>
          </View>

          {/* 재료 탭 */}
          {activeTab === 'ingredients' && (
            <View style={styles.section}>
              {recipe.ingredients?.map(ing => (
                <View key={ing.id} style={styles.ingredientRow}>
                  <View style={styles.ingredientLeft}>
                    <Text style={styles.ingredientName}>{ing.name}</Text>
                    {ing.is_optional && <Text style={styles.optionalBadge}>선택</Text>}
                  </View>
                  <Text style={styles.ingredientAmount}>
                    {ing.amount}{ing.unit ? ` ${ing.unit}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 타임라인 탭 */}
          {activeTab === 'timeline' && (
            <View style={styles.section}>
              {recipe.timeline_steps?.map((step, idx) => (
                <View key={step.id} style={styles.stepCard}>
                  <View style={styles.stepHeader}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{step.step_number}</Text>
                    </View>
                    <View style={styles.stepMeta}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <View style={styles.stepBadges}>
                        {step.duration_minutes > 0 && (
                          <Text style={styles.stepBadge}>{step.duration_minutes}분</Text>
                        )}
                        {step.timer_required && (
                          <Text style={styles.stepBadge}>타이머</Text>
                        )}
                        {step.is_photo_moment && (
                          <Text style={[styles.stepBadge, styles.photoBadge]}>촬영 포인트</Text>
                        )}
                      </View>
                    </View>
                  </View>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                  {step.tip && (
                    <View style={styles.tipBox}>
                      <Text style={styles.tipLabel}>TIP</Text>
                      <Text style={styles.tipText}>{step.tip}</Text>
                    </View>
                  )}
                  {idx < recipe.timeline_steps.length - 1 && <View style={styles.stepConnector} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 따라하기 시작 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => navigation.navigate('CookingMode', { recipe })}
        >
          <Text style={styles.startBtnText}>따라하기 시작</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { width: '100%', height: 260 },
  heroPlaceholder: { backgroundColor: '#e8e8e8', justifyContent: 'center', alignItems: 'center' },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#d0d0d0' },
  content: { padding: 16 },
  metaRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  metaBadge: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  metaText: { fontSize: 12, color: '#666', fontWeight: '500' },
  trendBadge: {
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trendText: { fontSize: 11, color: '#1a1a1a', fontWeight: '700', letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 14, letterSpacing: -0.5 },
  reasonBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    borderLeftWidth: 3,
    borderLeftColor: '#1a1a1a',
  },
  reasonLabel: { fontSize: 10, color: '#999', fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  reasonText: { fontSize: 14, color: '#444', lineHeight: 21 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ebebeb',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: { fontSize: 13, color: '#999', fontWeight: '500' },
  tabTextActive: { color: '#1a1a1a', fontWeight: '700' },
  section: { paddingBottom: 24 },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  ingredientLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ingredientName: { fontSize: 15, color: '#1a1a1a' },
  optionalBadge: {
    fontSize: 10,
    color: '#999',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ingredientAmount: { fontSize: 14, color: '#555', fontWeight: '600' },
  stepCard: { marginBottom: 4 },
  stepHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  stepNumberText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepMeta: { flex: 1 },
  stepTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  stepBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  stepBadge: {
    fontSize: 11,
    color: '#888',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  photoBadge: { color: '#555', backgroundColor: '#e8e8e8' },
  stepDescription: { fontSize: 14, color: '#555', lineHeight: 22, paddingLeft: 44, marginBottom: 8 },
  tipBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 10,
    marginLeft: 44,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#ccc',
  },
  tipLabel: { fontSize: 9, color: '#999', fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  tipText: { fontSize: 13, color: '#666', lineHeight: 18 },
  stepConnector: { width: 2, height: 16, backgroundColor: '#e0e0e0', marginLeft: 15, marginBottom: 4 },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  startBtn: { backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
