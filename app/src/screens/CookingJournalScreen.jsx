import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Share, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { sessionApi } from '../services/supabase';

// 블로그 본문을 N개 청크로 균등 분할
function splitIntoParts(text, n) {
  if (!text || n <= 1) return [text];
  const sentences = text.split(/(?<=[.!?。\n])\s+/);
  const chunkSize = Math.ceil(sentences.length / n);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(sentences.slice(i * chunkSize, (i + 1) * chunkSize).join(' '));
  }
  return parts.filter(Boolean);
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://recipecollecter-production.up.railway.app';

export default function CookingJournalScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId, recipe } = route.params;

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [snsPost, setSnsPost] = useState(null);
  const [activePostTab, setActivePostTab] = useState('instagram');

  const scrollViewRef = useRef(null);
  const postSectionRef = useRef(null);

  useEffect(() => {
    Promise.all([
      sessionApi.getPhotos(sessionId),
      sessionApi.getSession(sessionId),
    ]).then(([photos, session]) => {
      setPhotos(photos);
      if (session?.sns_post) setSnsPost(session.sns_post);
    }).finally(() => setLoading(false));
  }, [sessionId]);

  const generateSnsPost = async () => {
    setGenerating(true);
    setSnsPost(null);
    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 55000);

      const response = await fetch(`${BACKEND_URL}/api/generate-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, recipeId: recipe.id }),
        signal: controller.signal,
      });
      clearTimeout(fetchTimeout);
      const data = await response.json();
      if (data.error) {
        Alert.alert('오류', data.error);
        return;
      }
      setSnsPost(data);
      setTimeout(() => {
        postSectionRef.current?.measureLayout(
          scrollViewRef.current,
          (x, y) => scrollViewRef.current?.scrollTo({ y, animated: true }),
          () => {}
        );
      }, 100);
    } catch (err) {
      if (err.name === 'AbortError') {
        Alert.alert('시간 초과', 'AI 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.');
      } else {
        Alert.alert('오류', err.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const sharePost = async () => {
    if (!snsPost) return;

    const text = activePostTab === 'instagram'
      ? `${snsPost.instagram_caption}\n\n${snsPost.hashtags?.map(h => `#${h}`).join(' ')}`
      : snsPost.blog_content;

    try {
      await Share.share({ message: text, title: snsPost.blog_title || recipe.name });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#1a1a1a" style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>COOKING JOURNAL</Text>
          <Text style={styles.headerTitle}>{recipe.name}</Text>
        </View>

        {/* 사진 타임라인 */}
        {photos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>촬영 기록</Text>
            {photos.map(photo => (
              <View key={photo.id} style={styles.photoCard}>
                <View style={styles.photoStepBadge}>
                  <Text style={styles.photoStepText}>STEP {photo.step_number}</Text>
                </View>
                <Image source={{ uri: photo.photo_url }} style={styles.photo} />
                {photo.caption && (
                  <Text style={styles.photoCaption}>{photo.caption}</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.noPhotoBox}>
            <Text style={styles.noPhotoText}>촬영된 사진이 없습니다</Text>
            <Text style={styles.noPhotoSub}>다음엔 요리 과정을 사진으로 남겨보세요</Text>
          </View>
        )}

        {/* SNS 게시글 생성 */}
        <View ref={postSectionRef} style={styles.section}>
          <Text style={styles.sectionTitle}>SNS 게시글</Text>

          {!snsPost ? (
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={generateSnsPost}
              disabled={generating}
            >
              {generating ? (
                <View style={styles.generateBtnInner}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.generateBtnText}>AI가 작성 중...</Text>
                </View>
              ) : (
                <Text style={styles.generateBtnText}>AI로 게시글 자동 작성</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View>
              {/* 탭 */}
              <View style={styles.postTabs}>
                <TouchableOpacity
                  style={[styles.postTab, activePostTab === 'instagram' && styles.postTabActive]}
                  onPress={() => setActivePostTab('instagram')}
                >
                  <Text style={[styles.postTabText, activePostTab === 'instagram' && styles.postTabTextActive]}>
                    Instagram
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.postTab, activePostTab === 'blog' && styles.postTabActive]}
                  onPress={() => setActivePostTab('blog')}
                >
                  <Text style={[styles.postTabText, activePostTab === 'blog' && styles.postTabTextActive]}>
                    Blog
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 인스타 캡션 */}
              {activePostTab === 'instagram' && (
                <View style={styles.postBox}>
                  <Text style={styles.postContent}>{snsPost.instagram_caption}</Text>
                  {snsPost.hashtags && (
                    <Text style={styles.hashtags}>
                      {snsPost.hashtags.map(h => `#${h}`).join(' ')}
                    </Text>
                  )}
                </View>
              )}

              {/* 블로그 */}
              {activePostTab === 'blog' && (
                <View>
                  <View style={styles.postBox}>
                    <Text style={styles.blogTitle}>{snsPost.blog_title}</Text>
                  </View>
                  {/* 본문 단락 사이에 사진 끼워넣기 */}
                  {(() => {
                    const parts = splitIntoParts(snsPost.blog_content, photos.length + 1);
                    return parts.map((part, idx) => (
                      <View key={idx}>
                        <View style={styles.postBox}>
                          <Text style={styles.postContent}>{part}</Text>
                        </View>
                        {photos[idx] && (
                          <View style={styles.inlinePhotoCard}>
                            <View style={styles.photoStepBadge}>
                              <Text style={styles.photoStepText}>STEP {photos[idx].step_number}</Text>
                            </View>
                            <Image source={{ uri: photos[idx].photo_url }} style={styles.inlinePhoto} />
                            {photos[idx].caption && (
                              <Text style={styles.photoCaption}>{photos[idx].caption}</Text>
                            )}
                          </View>
                        )}
                      </View>
                    ));
                  })()}
                </View>
              )}

              <TouchableOpacity style={styles.shareBtn} onPress={sharePost}>
                <Text style={styles.shareBtnText}>게시글 공유</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.regenerateBtn}
                onPress={generateSnsPost}
                disabled={generating}
              >
                <Text style={styles.regenerateBtnText}>다시 작성</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.homeBtnText}>홈으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, paddingBottom: 120 },
  header: { paddingVertical: 24, paddingHorizontal: 4 },
  headerLabel: {
    fontSize: 10,
    color: '#aaa',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#111', letterSpacing: -0.5 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#aaa',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  photoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  photoStepBadge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  photoStepText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  photo: { width: '100%', height: 220 },
  photoCaption: { padding: 12, fontSize: 13, color: '#666' },
  noPhotoBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  noPhotoText: { fontSize: 15, color: '#999', marginBottom: 6, fontWeight: '500' },
  noPhotoSub: { fontSize: 13, color: '#bbb' },
  generateBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  generateBtnInner: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  postTabs: {
    flexDirection: 'row',
    backgroundColor: '#ebebeb',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  postTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  postTabActive: { backgroundColor: '#fff' },
  postTabText: { fontSize: 13, color: '#999', fontWeight: '500' },
  postTabTextActive: { color: '#1a1a1a', fontWeight: '700' },
  postBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  blogTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  postContent: { fontSize: 14, color: '#444', lineHeight: 22 },
  hashtags: { fontSize: 13, color: '#555', marginTop: 10, lineHeight: 20, fontWeight: '500' },
  shareBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  regenerateBtn: { paddingVertical: 10, alignItems: 'center' },
  regenerateBtnText: { color: '#aaa', fontSize: 13 },
  inlinePhotoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inlinePhoto: { width: '100%', height: 200 },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#efefef',
  },
  homeBtn: { paddingVertical: 14, alignItems: 'center' },
  homeBtnText: { color: '#888', fontSize: 15 },
});
