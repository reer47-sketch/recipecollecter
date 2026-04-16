import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Share, RefreshControl,
} from 'react-native';
import { sessionApi } from '../services/supabase';

const TABS = ['Instagram', 'Blog', 'YouTube'];

export default function SavedPostsScreen() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState({});

  const load = useCallback(async () => {
    try {
      const data = await sessionApi.getSavedPosts();
      setPosts(data);
    } catch (err) {
      Alert.alert('오류', '게시글을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const handleDelete = (sessionId) => {
    Alert.alert('게시글 삭제', '저장된 게시글을 삭제하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          try {
            await sessionApi.deleteSnsPost(sessionId);
            setPosts(prev => prev.filter(p => p.id !== sessionId));
            if (expandedId === sessionId) setExpandedId(null);
          } catch {
            Alert.alert('오류', '삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const handleShare = async (post, tab) => {
    const sns = post.sns_post;
    let text = '';
    if (tab === 'Instagram') {
      text = `${sns.instagram_caption}\n\n${(sns.hashtags || []).map(h => `#${h}`).join(' ')}`;
    } else if (tab === 'Blog') {
      text = `${sns.blog_title}\n\n${sns.blog_content}`;
    } else {
      text = sns.youtube_script || '';
    }
    try {
      await Share.share({ message: text, title: sns.blog_title });
    } catch {}
  };

  const getTabForId = (id) => activeTab[id] || 'Instagram';

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const renderItem = ({ item }) => {
    const isExpanded = expandedId === item.id;
    const tab = getTabForId(item.id);
    const sns = item.sns_post;
    const recipeName = item.recipes?.name || '레시피';

    return (
      <View style={styles.card}>
        {/* 헤더 */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.recipeName}>{recipeName}</Text>
            <Text style={styles.dateText}>{formatDate(item.completed_at)}</Text>
            {!isExpanded && (
              <Text style={styles.previewText} numberOfLines={1}>{sns.blog_title}</Text>
            )}
          </View>
          <View style={styles.cardHeaderRight}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteBtnText}>삭제</Text>
            </TouchableOpacity>
            <Text style={styles.chevron}>{isExpanded ? '∧' : '∨'}</Text>
          </View>
        </TouchableOpacity>

        {/* 펼친 내용 */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* 탭 */}
            <View style={styles.tabs}>
              {TABS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tab, tab === t && styles.tabActive]}
                  onPress={() => setActiveTab(prev => ({ ...prev, [item.id]: t }))}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 내용 */}
            {tab === 'Instagram' && (
              <View style={styles.contentBox}>
                <Text style={styles.contentText}>{sns.instagram_caption}</Text>
                {sns.hashtags && (
                  <Text style={styles.hashtags}>{sns.hashtags.map(h => `#${h}`).join(' ')}</Text>
                )}
              </View>
            )}
            {tab === 'Blog' && (
              <View style={styles.contentBox}>
                <Text style={styles.blogTitle}>{sns.blog_title}</Text>
                <Text style={styles.contentText}>{sns.blog_content}</Text>
              </View>
            )}
            {tab === 'YouTube' && (
              <View style={styles.contentBox}>
                <Text style={styles.youtubeLabel}>SCRIPT</Text>
                <Text style={styles.contentText}>{sns.youtube_script || '이 게시글은 유튜브 스크립트가 없습니다. 다시 생성해주세요.'}</Text>
              </View>
            )}

            {/* 공유 버튼 */}
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => handleShare(item, tab)}
            >
              <Text style={styles.shareBtnText}>공유</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#1a1a1a" style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#1a1a1a" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>저장된 게시글이 없습니다</Text>
            <Text style={styles.emptySub}>요리 기록에서 AI 게시글을 작성하고 저장해보세요</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },

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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
  },
  cardHeaderLeft: { flex: 1, marginRight: 12 },
  recipeName: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 3 },
  dateText: { fontSize: 11, color: '#aaa', marginBottom: 5 },
  previewText: { fontSize: 13, color: '#888' },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#fef2f2', borderRadius: 6 },
  deleteBtnText: { fontSize: 12, color: '#e53935', fontWeight: '600' },
  chevron: { fontSize: 14, color: '#aaa', fontWeight: '600' },

  expandedContent: { borderTopWidth: 1, borderTopColor: '#f0f0f0', padding: 16 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ebebeb',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 12, color: '#999', fontWeight: '500' },
  tabTextActive: { color: '#1a1a1a', fontWeight: '700' },

  contentBox: { marginBottom: 14 },
  blogTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  youtubeLabel: { fontSize: 9, fontWeight: '700', color: '#aaa', letterSpacing: 1.5, marginBottom: 8 },
  contentText: { fontSize: 14, color: '#444', lineHeight: 22 },
  hashtags: { fontSize: 13, color: '#555', marginTop: 8, lineHeight: 20 },

  shareBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 16, color: '#888', marginBottom: 6, fontWeight: '500' },
  emptySub: { fontSize: 13, color: '#bbb', textAlign: 'center' },
});
