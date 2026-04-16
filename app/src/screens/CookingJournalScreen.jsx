import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Share, Alert, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { sessionApi } from '../services/supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://recipecollecter-production.up.railway.app';
const MOVIEMAKER_URL = 'https://moviemaker-phi.vercel.app';

export default function CookingJournalScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sessionId, recipe } = route.params;

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [makingVideo, setMakingVideo] = useState(false);
  const [snsPost, setSnsPost] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activePostTab, setActivePostTab] = useState('instagram');
  // tabs: instagram | blog | youtube

  const scrollViewRef = useRef(null);
  const postSectionRef = useRef(null);

  useEffect(() => {
    sessionApi.getSession(sessionId)
      .then(session => {
        if (session?.sns_post) {
          setSnsPost(session.sns_post);
          setIsSaved(true);
        }
      })
      .finally(() => setLoading(false));
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
      setIsSaved(false);
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

  const savePost = async () => {
    setSaving(true);
    try {
      await sessionApi.saveSnsPost(sessionId, snsPost);
      setIsSaved(true);
    } catch (err) {
      Alert.alert('오류', '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deletePost = () => {
    Alert.alert('게시글 삭제', '저장된 게시글을 삭제하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          try {
            await sessionApi.deleteSnsPost(sessionId);
            setSnsPost(null);
            setIsSaved(false);
          } catch {
            Alert.alert('오류', '삭제에 실패했습니다.');
          }
        },
      },
    ]);
  };

  const makeVideo = async () => {
    if (!snsPost?.youtube_script) return;
    setMakingVideo(true);
    try {
      const res = await fetch(`${MOVIEMAKER_URL}/api/draft/from-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: snsPost.youtube_script,
          title: recipe.name,
        }),
      });
      const data = await res.json();
      if (data.error) { Alert.alert('오류', data.error); return; }
      await Linking.openURL(data.url);
    } catch (err) {
      Alert.alert('오류', '영상 만들기 준비에 실패했습니다.');
    } finally {
      setMakingVideo(false);
    }
  };

  const sharePost = async () => {
    if (!snsPost) return;

    const text = activePostTab === 'instagram'
      ? `${snsPost.instagram_caption}\n\n${snsPost.hashtags?.map(h => `#${h}`).join(' ')}`
      : activePostTab === 'blog'
        ? snsPost.blog_content
        : snsPost.youtube_script || '';

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

        {/* 사진 안내 */}
        <View style={styles.noPhotoBox}>
          <Text style={styles.noPhotoText}>사진은 기기 갤러리에 저장됩니다</Text>
          <Text style={styles.noPhotoSub}>요리 중 알림을 받으면 카메라 앱으로 찍어두세요</Text>
        </View>

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
                {['instagram', 'blog', 'youtube'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.postTab, activePostTab === t && styles.postTabActive]}
                    onPress={() => setActivePostTab(t)}
                  >
                    <Text style={[styles.postTabText, activePostTab === t && styles.postTabTextActive]}>
                      {t === 'instagram' ? 'Instagram' : t === 'blog' ? 'Blog' : 'YouTube'}
                    </Text>
                  </TouchableOpacity>
                ))}
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
                <View style={styles.postBox}>
                  <Text style={styles.blogTitle}>{snsPost.blog_title}</Text>
                  <Text style={styles.postContent}>{snsPost.blog_content}</Text>
                </View>
              )}

              {/* 유튜브 스크립트 */}
              {activePostTab === 'youtube' && (
                <View>
                  <View style={styles.postBox}>
                    <Text style={styles.scriptLabel}>SCRIPT</Text>
                    <Text style={styles.postContent}>{snsPost.youtube_script}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.makeVideoBtn}
                    onPress={makeVideo}
                    disabled={makingVideo}
                  >
                    {makingVideo ? (
                      <View style={styles.makeVideoBtnInner}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.makeVideoBtnText}>영상 준비 중...</Text>
                      </View>
                    ) : (
                      <Text style={styles.makeVideoBtnText}>MovieMaker로 영상 만들기</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.shareBtn} onPress={sharePost}>
                <Text style={styles.shareBtnText}>게시글 공유</Text>
              </TouchableOpacity>

              <View style={styles.postActions}>
                {isSaved ? (
                  <TouchableOpacity style={styles.savedIndicator} onPress={deletePost}>
                    <Text style={styles.savedText}>저장됨  삭제</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={savePost}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>{saving ? '저장 중...' : '저장'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.regenerateBtn}
                  onPress={generateSnsPost}
                  disabled={generating}
                >
                  <Text style={styles.regenerateBtnText}>다시 작성</Text>
                </TouchableOpacity>
              </View>
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
  scriptLabel: { fontSize: 9, fontWeight: '700', color: '#aaa', letterSpacing: 1.5, marginBottom: 10 },
  makeVideoBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  makeVideoBtnInner: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  makeVideoBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
  postActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#f0f0f0', borderRadius: 8 },
  saveBtnText: { fontSize: 13, color: '#1a1a1a', fontWeight: '600' },
  savedIndicator: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#e8f5e9', borderRadius: 8 },
  savedText: { fontSize: 13, color: '#2e7d32', fontWeight: '600' },
  regenerateBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  regenerateBtnText: { color: '#aaa', fontSize: 13 },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#efefef',
  },
  homeBtn: { paddingVertical: 14, alignItems: 'center' },
  homeBtnText: { color: '#888', fontSize: 15 },
});
