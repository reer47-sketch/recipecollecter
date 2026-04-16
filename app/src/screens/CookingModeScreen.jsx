import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Animated, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { sessionApi, ingredientApi } from '../services/supabase';
import {
  requestPermissions,
  scheduleTimerNotification,
  sendNextStepNotification,
  sendIngredientsReadyNotification,
  cancelNotification,
  cancelAllNotifications,
} from '../services/notifications';
import { getDeviceId } from '../utils/device';

export default function CookingModeScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { recipe } = route.params;

  const steps = recipe.timeline_steps || [];
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerNotifId, setTimerNotifId] = useState(null);
  const [completed, setCompleted] = useState(false);

  const timerRef = useRef(null);
  const timerSecondsRef = useRef(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const currentStep = steps[currentStepIdx];
  const isLastStep = currentStepIdx === steps.length - 1;

  // ── 세션 초기화 ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await requestPermissions();
      const deviceId = await getDeviceId();
      const session = await sessionApi.create(recipe.id, deviceId);
      setSessionId(session.id);

      const ingredientIds = (recipe.ingredients || []).map(i => i.id);
      await ingredientApi.initChecks(session.id, ingredientIds);

      // 재료 준비 완료 — 시작 전 사진 찍으라고 알림
      await sendIngredientsReadyNotification(recipe.name);
    })();

    return () => {
      clearInterval(timerRef.current);
      cancelAllNotifications();
    };
  }, []);

  // ── 타이머 업데이트 ──────────────────────────────────────────
  useEffect(() => {
    if (!timerRunning) {
      clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      timerSecondsRef.current -= 1;
      setTimerSeconds(timerSecondsRef.current);

      if (timerSecondsRef.current <= 0) {
        clearInterval(timerRef.current);
        setTimerRunning(false);
        handleTimerComplete();
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  // ── 진행률 애니메이션 ────────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (currentStepIdx + 1) / steps.length,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [currentStepIdx]);

  const handleTimerComplete = useCallback(async () => {
    // 타이머 완료 시 — 알림은 scheduleTimerNotification에서 이미 처리됨
  }, [currentStep]);

  const startTimer = useCallback(async () => {
    if (!currentStep?.duration_minutes) return;
    const seconds = currentStep.duration_minutes * 60;
    timerSecondsRef.current = seconds;
    setTimerSeconds(seconds);
    setTimerRunning(true);

    const notifId = await scheduleTimerNotification(
      currentStep.duration_minutes,
      currentStep.title,
      steps[currentStepIdx + 1]?.title || '요리 완성!'
    );
    setTimerNotifId(notifId);
  }, [currentStep, currentStepIdx, steps]);

  const stopTimer = useCallback(async () => {
    timerSecondsRef.current = 0;
    setTimerRunning(false);
    setTimerSeconds(0);
    if (timerNotifId) {
      await cancelNotification(timerNotifId);
      setTimerNotifId(null);
    }
  }, [timerNotifId]);

  const goNextStep = useCallback(async () => {
    await stopTimer();

    if (isLastStep) {
      if (sessionId) await sessionApi.complete(sessionId);
      setCompleted(true);
      return;
    }

    const nextIdx = currentStepIdx + 1;
    const nextStep = steps[nextIdx];
    setCurrentStepIdx(nextIdx);

    // 매 단계마다 사진 유도 알림 (is_photo_moment 여부 전달)
    await sendNextStepNotification(nextStep.step_number, nextStep.title, nextStep.is_photo_moment);

    if (sessionId) await sessionApi.updateStep(sessionId, nextStep.step_number);

    const nextSeconds = (nextStep.duration_minutes || 0) * 60;
    timerSecondsRef.current = nextSeconds;
    setTimerSeconds(nextSeconds);

    if (nextStep.timer_required && nextSeconds > 0) {
      setTimeout(() => setTimerRunning(true), 1000);
    }
  }, [currentStepIdx, isLastStep, sessionId, steps]);

  const handleExit = () => {
    Alert.alert(
      '따라하기 종료',
      '진행 중인 요리를 종료하시겠어요?',
      [
        { text: '계속하기', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: async () => {
            await cancelAllNotifications();
            navigation.goBack();
          },
        },
      ]
    );
  };

  // ── 완료 화면 ────────────────────────────────────────────────
  if (completed) {
    return (
      <View style={styles.completedContainer}>
        <View style={styles.completedIcon} />
        <Text style={styles.completedTitle}>완성!</Text>
        <Text style={styles.completedSubtitle}>{recipe.name}</Text>
        <TouchableOpacity
          style={styles.journalBtn}
          onPress={() => navigation.replace('CookingJournal', { sessionId, recipe })}
        >
          <Text style={styles.journalBtnText}>요리 기록 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.homeBtnText}>홈으로</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!currentStep) return null;

  const displaySeconds = timerRunning || timerSeconds > 0
    ? timerSeconds
    : (currentStep.duration_minutes || 0) * 60;
  const timerMin = Math.floor(displaySeconds / 60);
  const timerSec = displaySeconds % 60;
  const hasTimer = currentStep.duration_minutes > 0;

  return (
    <View style={styles.container}>
      {/* 상단 진행바 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.exitBtn}>
          <Text style={styles.exitText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{currentStepIdx + 1} / {steps.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 단계 배지 */}
        <View style={styles.stepBadgeRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP {currentStep.step_number}</Text>
          </View>
          {currentStep.is_photo_moment && (
            <View style={styles.photoBadge}>
              <Text style={styles.photoBadgeText}>촬영 포인트</Text>
            </View>
          )}
        </View>

        <Text style={styles.stepTitle}>{currentStep.title}</Text>
        <Text style={styles.stepDescription}>{currentStep.description}</Text>

        {currentStep.tip && (
          <View style={styles.tipBox}>
            <Text style={styles.tipLabel}>TIP</Text>
            <Text style={styles.tipText}>{currentStep.tip}</Text>
          </View>
        )}

        {/* 타이머 */}
        {hasTimer && (
          <View style={styles.timerSection}>
            <View style={styles.timerDisplay}>
              <Text style={styles.timerText}>
                {String(timerMin).padStart(2, '0')}:{String(timerSec).padStart(2, '0')}
              </Text>
              <Text style={styles.timerLabel}>
                {timerRunning ? '타이머 실행 중' : `${currentStep.duration_minutes}분 타이머`}
              </Text>
            </View>
            <View style={styles.timerBtns}>
              {!timerRunning ? (
                <TouchableOpacity style={styles.timerStartBtn} onPress={startTimer}>
                  <Text style={styles.timerStartBtnText}>타이머 시작</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.timerStopBtn} onPress={stopTimer}>
                  <Text style={styles.timerStopBtnText}>정지</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* 다음 단계 버튼 */}
      <View style={styles.footer}>
        {!isLastStep && (
          <Text style={styles.nextPreview}>
            다음: {steps[currentStepIdx + 1]?.title}
          </Text>
        )}
        <TouchableOpacity style={styles.nextBtn} onPress={goNextStep}>
          <Text style={styles.nextBtnText}>
            {isLastStep ? '완성!' : '다음 단계'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  exitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitText: { fontSize: 14, color: '#555', fontWeight: '600' },
  progressContainer: { flex: 1, gap: 4 },
  progressBg: { height: 4, backgroundColor: '#efefef', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#1a1a1a', borderRadius: 2 },
  progressText: { fontSize: 11, color: '#aaa', textAlign: 'right' },
  content: { padding: 24, paddingBottom: 40 },
  stepBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stepBadge: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  photoBadge: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoBadgeText: { color: '#555', fontSize: 11, fontWeight: '600' },
  stepTitle: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 14, letterSpacing: -0.5 },
  stepDescription: { fontSize: 16, color: '#444', lineHeight: 26, marginBottom: 16 },
  tipBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 2,
    borderLeftColor: '#ccc',
  },
  tipLabel: { fontSize: 9, color: '#999', fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  tipText: { fontSize: 14, color: '#555', lineHeight: 20 },
  timerSection: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  timerDisplay: { alignItems: 'center', marginBottom: 20 },
  timerText: { fontSize: 56, fontWeight: '200', color: '#1a1a1a', letterSpacing: 4 },
  timerLabel: { fontSize: 12, color: '#aaa', marginTop: 6, letterSpacing: 0.5 },
  timerBtns: { flexDirection: 'row', gap: 12 },
  timerStartBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    paddingHorizontal: 36,
    paddingVertical: 12,
  },
  timerStartBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  timerStopBtn: {
    backgroundColor: '#888',
    borderRadius: 24,
    paddingHorizontal: 36,
    paddingVertical: 12,
  },
  timerStopBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#efefef' },
  nextPreview: { fontSize: 11, color: '#aaa', marginBottom: 8, textAlign: 'center', letterSpacing: 0.3 },
  nextBtn: { backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  completedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    marginBottom: 24,
  },
  completedTitle: { fontSize: 36, fontWeight: '700', color: '#111', marginBottom: 8, letterSpacing: -1 },
  completedSubtitle: { fontSize: 17, color: '#888', marginBottom: 48, textAlign: 'center' },
  journalBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  journalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  homeBtn: { paddingVertical: 12 },
  homeBtnText: { color: '#aaa', fontSize: 14 },
});
