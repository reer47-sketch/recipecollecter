/**
 * 푸시 알림 서비스
 * - 타이머 기반 요리 단계 알림
 * - 사진 촬영 유도 알림 (서버 저장 없이 알림만)
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// 알림 표시 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 알림 권한 요청
 */
export async function requestPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('cooking-timer', {
      name: '요리 타이머',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });

    await Notifications.setNotificationChannelAsync('photo-prompt', {
      name: '사진 촬영 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  return true;
}

/**
 * 재료 준비 완료 알림 (요리 시작 시)
 * 재료를 펼쳐두고 사진 찍으라고 유도
 */
export async function sendIngredientsReadyNotification(recipeName) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '재료 준비 완료!',
      body: `${recipeName} 재료를 예쁘게 펼쳐두고 사진 찍어두세요 📸`,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'photo-prompt' }),
      data: { type: 'ingredients_ready' },
    },
    trigger: null,
  });
}

/**
 * 타이머 완료 알림 예약
 */
export async function scheduleTimerNotification(durationMinutes, stepTitle, nextStepTitle) {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ ${stepTitle} 완료!`,
      body: `다음: ${nextStepTitle} — 지금 모습 사진 찍어두세요 📸`,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'cooking-timer' }),
      data: { type: 'timer_complete' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: durationMinutes * 60,
    },
  });
  return id;
}

/**
 * 다음 단계 시작 알림 (매 단계마다 사진 유도 포함)
 * @param {number} stepNumber
 * @param {string} stepTitle
 * @param {boolean} isPhotoMoment - 촬영 포인트 여부
 */
export async function sendNextStepNotification(stepNumber, stepTitle, isPhotoMoment = false) {
  const body = isPhotoMoment
    ? `${stepTitle} — 사진 찍기 좋은 순간이에요! 📸`
    : `${stepTitle} — 중간 과정 사진 남겨두세요 📸`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `STEP ${stepNumber}`,
      body,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'photo-prompt' }),
      data: { type: 'next_step', stepNumber },
    },
    trigger: null,
  });
}

/**
 * 예약된 알림 취소
 */
export async function cancelNotification(notificationId) {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * 모든 예약 알림 취소 (세션 종료 시)
 */
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * 알림 수신 리스너 등록
 */
export function addNotificationListeners(onReceive, onResponse) {
  const receiveListener = Notifications.addNotificationReceivedListener(onReceive);
  const responseListener = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    receiveListener.remove();
    responseListener.remove();
  };
}
