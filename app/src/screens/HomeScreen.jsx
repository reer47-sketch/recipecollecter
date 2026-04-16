import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Image,
  SafeAreaView, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { recipeApi } from '../services/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://recipecollecter.vercel.app';

const TAGS = ['전체', '한식', '양식', '중식', '일식', '디저트', '음료', '간식', '홈카페', '다이어트'];

export default function HomeScreen() {
  const navigation = useNavigation();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('전체');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addRecipeName, setAddRecipeName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadRecipes = useCallback(async (reset = false) => {
    try {
      const currentPage = reset ? 0 : page;
      const tag = selectedTag === '전체' ? null : selectedTag;
      const data = await recipeApi.getList({ page: currentPage, limit: 20, tag });
      if (reset) { setRecipes(data); setPage(1); }
      else { setRecipes(prev => [...prev, ...data]); setPage(p => p + 1); }
      setHasMore(data.length === 20);
    } catch (err) {
      console.error('레시피 로드 실패:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, selectedTag]);

  useEffect(() => { setLoading(true); loadRecipes(true); }, [selectedTag]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return loadRecipes(true);
    setLoading(true);
    try {
      const data = await recipeApi.search(searchQuery.trim());
      setRecipes(data);
      setHasMore(false);
    } catch (err) {
      console.error('검색 실패:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipe = async () => {
    const name = addRecipeName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 115000);
      const res = await fetch(`${BACKEND_URL}/api/add-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeName: name }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const data = await res.json();
      if (data.error) { Alert.alert('오류', data.error); return; }
      setAddModalVisible(false);
      setAddRecipeName('');
      if (data.already_exists) {
        Alert.alert('이미 있어요', `"${name}" 레시피가 이미 추가되어 있어요.`);
      } else {
        Alert.alert('추가 완료!', `"${data.name}" 레시피가 추가됐어요.`, [
          { text: '확인', onPress: () => loadRecipes(true) },
        ]);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        Alert.alert('시간 초과', '처리가 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.');
      } else {
        Alert.alert('오류', err.message);
      }
    } finally {
      setAdding(false);
    }
  };

  const renderRecipeCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id, recipeName: item.name })}
      activeOpacity={0.9}
    >
      {item.thumbnail_url ? (
        <Image source={{ uri: item.thumbnail_url }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <View style={styles.placeholderIcon} />
        </View>
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <View style={styles.trendBadge}>
            <Text style={styles.trendText}>TREND {item.trend_score}</Text>
          </View>
        </View>
        <Text style={styles.cardReason} numberOfLines={2}>{item.reason}</Text>
        <View style={styles.tagRow}>
          {(item.tags || []).slice(0, 3).map(tag => (
            <Text key={tag} style={styles.tagText}>#{tag}</Text>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* 레시피 직접 추가 모달 */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !adding && setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>레시피 직접 추가</Text>
            <Text style={styles.modalSub}>원하는 요리 이름을 입력하면{'\n'}AI가 레시피를 찾아서 추가해드려요</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="예: 된장찌개, 파스타, 마라탕..."
              placeholderTextColor="#bbb"
              value={addRecipeName}
              onChangeText={setAddRecipeName}
              editable={!adding}
              returnKeyType="done"
              onSubmitEditing={handleAddRecipe}
              autoFocus
            />
            {adding ? (
              <View style={styles.addingBox}>
                <ActivityIndicator color="#1a1a1a" size="small" />
                <Text style={styles.addingText}>레시피 검색 및 생성 중... (1분 정도 소요)</Text>
              </View>
            ) : (
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setAddModalVisible(false); setAddRecipeName(''); }}>
                  <Text style={styles.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddRecipe}>
                  <Text style={styles.modalAddText}>추가</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* 검색 바 */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="레시피 검색"
            placeholderTextColor="#aaa"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); loadRecipes(true); }}>
              <Text style={styles.clearBtn}>×</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>검색</Text>
        </TouchableOpacity>
      </View>

      {/* 카테고리 필터 */}
      <View style={styles.filterWrap}>
        <FlatList
          data={TAGS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={t => t}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: tag }) => (
            <TouchableOpacity
              style={[styles.filterTag, selectedTag === tag && styles.filterTagActive]}
              onPress={() => setSelectedTag(tag)}
            >
              <Text style={[styles.filterTagText, selectedTag === tag && styles.filterTagTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* 레시피 목록 */}
      {loading && page === 0 ? (
        <ActivityIndicator size="large" color="#1a1a1a" style={styles.loader} />
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={item => item.id}
          renderItem={renderRecipeCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); setSearchQuery(''); loadRecipes(true); }}
              tintColor="#1a1a1a"
            />
          }
          onEndReached={() => hasMore && !loading && loadRecipes()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>레시피가 없습니다</Text>
              <Text style={styles.emptySubText}>매일 오전 9시에 새 레시피가 수집됩니다</Text>
            </View>
          }
          ListFooterComponent={
            loading && page > 0 ? <ActivityIndicator color="#1a1a1a" style={{ marginVertical: 20 }} /> : null
          }
        />
      )}
      {/* 직접 추가 FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+ 레시피 추가</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // 검색
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
  },
  clearBtn: { fontSize: 18, color: '#aaa', paddingHorizontal: 4 },
  searchBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 42,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // 카테고리 필터
  filterWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  filterList: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  filterTag: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  filterTagActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  filterTagText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterTagTextActive: { color: '#fff', fontWeight: '600' },

  // 리스트
  listContent: { padding: 16, gap: 12 },

  // 카드
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardImage: { width: '100%', height: 190 },
  cardImagePlaceholder: { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  placeholderIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ddd' },
  cardContent: { padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1, marginRight: 8, letterSpacing: -0.3 },
  trendBadge: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  trendText: { fontSize: 10, color: '#888', fontWeight: '700', letterSpacing: 0.5 },
  cardReason: { fontSize: 13, color: '#777', lineHeight: 19, marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagText: { fontSize: 11, color: '#aaa' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#888', lineHeight: 20, marginBottom: 20 },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 20,
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, color: '#666', fontWeight: '600' },
  modalAddBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  modalAddText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  addingBox: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  addingText: { fontSize: 13, color: '#666', flex: 1 },

  // 기타
  loader: { marginTop: 80 },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, color: '#888', marginBottom: 6, fontWeight: '500' },
  emptySubText: { fontSize: 13, color: '#bbb' },
});
