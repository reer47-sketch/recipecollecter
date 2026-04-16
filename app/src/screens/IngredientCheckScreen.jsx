/**
 * 재료 체크리스트 화면
 * - 보유 재료 체크
 * - 없는 재료 → 대체 재료 추천 (AI)
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ingredientApi } from '../services/supabase';

export default function IngredientCheckScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { recipe, sessionId } = route.params;

  const ingredients = recipe.ingredients || [];
  const [checks, setChecks] = useState({}); // ingredientId -> boolean
  const [selectedIngredient, setSelectedIngredient] = useState(null); // 대체재 모달용
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 초기 체크 상태 로드
    ingredientApi.getChecks(sessionId)
      .then(data => {
        const map = {};
        data.forEach(c => { map[c.ingredient_id] = c.is_checked; });
        setChecks(map);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const toggleCheck = async (ingredientId) => {
    const newVal = !checks[ingredientId];
    setChecks(prev => ({ ...prev, [ingredientId]: newVal }));
    try {
      await ingredientApi.toggleCheck(sessionId, ingredientId, newVal);
    } catch (err) {
      // 롤백
      setChecks(prev => ({ ...prev, [ingredientId]: !newVal }));
    }
  };

  const checkedCount = Object.values(checks).filter(Boolean).length;
  const missingIngredients = ingredients.filter(ing => !checks[ing.id]);
  const allChecked = checkedCount === ingredients.length;

  const handleStartCooking = () => {
    if (!allChecked) {
      Alert.alert(
        '재료 확인',
        `${missingIngredients.length}개 재료가 체크되지 않았어요. 대체 재료로 진행하시겠어요?`,
        [
          { text: '계속 확인', style: 'cancel' },
          {
            text: '진행하기',
            onPress: () => navigation.navigate('CookingMode', { recipe, sessionId }),
          },
        ]
      );
    } else {
      navigation.navigate('CookingMode', { recipe, sessionId });
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#FF6B35" style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      {/* 진행 상태 */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {checkedCount} / {ingredients.length} 재료 준비 완료
        </Text>
        <View style={styles.statusProgress}>
          <View
            style={[styles.statusFill, { width: `${(checkedCount / ingredients.length) * 100}%` }]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 필수 재료 */}
        <Text style={styles.sectionTitle}>필수 재료</Text>
        {ingredients.filter(ing => !ing.is_optional).map(ing => (
          <IngredientRow
            key={ing.id}
            ingredient={ing}
            checked={!!checks[ing.id]}
            onToggle={() => toggleCheck(ing.id)}
            onSubstitute={() => setSelectedIngredient(ing)}
          />
        ))}

        {/* 선택 재료 */}
        {ingredients.filter(ing => ing.is_optional).length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>선택 재료</Text>
            {ingredients.filter(ing => ing.is_optional).map(ing => (
              <IngredientRow
                key={ing.id}
                ingredient={ing}
                checked={!!checks[ing.id]}
                onToggle={() => toggleCheck(ing.id)}
                onSubstitute={() => setSelectedIngredient(ing)}
                optional
              />
            ))}
          </>
        )}

        {/* 없는 재료 요약 */}
        {missingIngredients.length > 0 && (
          <View style={styles.missingBox}>
            <Text style={styles.missingTitle}>
              체크 안 된 재료 ({missingIngredients.length}개)
            </Text>
            <Text style={styles.missingList}>
              {missingIngredients.map(i => i.name).join(', ')}
            </Text>
            <Text style={styles.missingTip}>
              재료를 탭하면 대체 재료를 확인할 수 있어요.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 요리 시작 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.startBtn, allChecked && styles.startBtnReady]}
          onPress={handleStartCooking}
        >
          <Text style={styles.startBtnText}>
            {allChecked ? '✅ 재료 준비 완료 — 요리 시작' : '👨‍🍳 그래도 요리 시작'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 대체 재료 모달 */}
      {selectedIngredient && (
        <SubstituteModal
          ingredient={selectedIngredient}
          onClose={() => setSelectedIngredient(null)}
        />
      )}
    </View>
  );
}

function IngredientRow({ ingredient, checked, onToggle, onSubstitute, optional }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.checkArea} onPress={onToggle}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.ingredientInfo}>
          <Text style={[styles.ingredientName, checked && styles.ingredientNameChecked]}>
            {ingredient.name}
            {optional && <Text style={styles.optionalLabel}> (선택)</Text>}
          </Text>
          <Text style={styles.ingredientAmount}>
            {ingredient.amount}{ingredient.unit ? ` ${ingredient.unit}` : ''}
          </Text>
        </View>
      </TouchableOpacity>

      {/* 대체 재료가 있는 경우 버튼 노출 */}
      {!checked && (ingredient.substitutes || []).length > 0 && (
        <TouchableOpacity style={styles.subBtn} onPress={onSubstitute}>
          <Text style={styles.subBtnText}>대체</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SubstituteModal({ ingredient, onClose }) {
  const substitutes = ingredient.substitutes || [];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>"{ingredient.name}" 대체 재료</Text>
          <Text style={styles.modalSubtitle}>
            {ingredient.amount}{ingredient.unit} 대신 사용 가능한 재료
          </Text>

          {substitutes.length > 0 ? (
            substitutes.map((sub, idx) => (
              <View key={idx} style={styles.substituteCard}>
                <Text style={styles.substituteName}>
                  {typeof sub === 'string' ? sub : sub.name || sub}
                </Text>
                {sub.ratio && (
                  <Text style={styles.substituteRatio}>사용량: {sub.ratio}</Text>
                )}
                {sub.note && (
                  <Text style={styles.substituteNote}>💡 {sub.note}</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.noSubstitute}>대체 재료 정보가 없습니다.</Text>
          )}

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8' },
  statusBar: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  statusText: { fontSize: 14, color: '#666', marginBottom: 8 },
  statusProgress: { height: 6, backgroundColor: '#F0F0F0', borderRadius: 3 },
  statusFill: { height: 6, backgroundColor: '#FF6B35', borderRadius: 3 },
  content: { padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#999', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, padding: 12, gap: 10 },
  checkArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ingredientInfo: { flex: 1 },
  ingredientName: { fontSize: 15, color: '#1a1a1a' },
  ingredientNameChecked: { color: '#bbb', textDecorationLine: 'line-through' },
  optionalLabel: { fontSize: 12, color: '#bbb', fontWeight: '400' },
  ingredientAmount: { fontSize: 13, color: '#FF6B35', marginTop: 2 },
  subBtn: { backgroundColor: '#FFF0EA', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  subBtnText: { fontSize: 12, color: '#FF6B35', fontWeight: '600' },
  missingBox: { backgroundColor: '#FFF8F5', borderRadius: 10, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#FFD9C9' },
  missingTitle: { fontSize: 13, fontWeight: '700', color: '#FF6B35', marginBottom: 6 },
  missingList: { fontSize: 14, color: '#444', marginBottom: 6, lineHeight: 20 },
  missingTip: { fontSize: 12, color: '#999' },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  startBtn: { backgroundColor: '#999', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  startBtnReady: { backgroundColor: '#FF6B35' },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#999', marginBottom: 16 },
  substituteCard: { backgroundColor: '#F8F8F8', borderRadius: 10, padding: 14, marginBottom: 10 },
  substituteName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  substituteRatio: { fontSize: 13, color: '#FF6B35', marginBottom: 4 },
  substituteNote: { fontSize: 13, color: '#666', lineHeight: 18 },
  noSubstitute: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 20 },
  modalCloseBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  modalCloseBtnText: { color: '#666', fontSize: 15 },
});
