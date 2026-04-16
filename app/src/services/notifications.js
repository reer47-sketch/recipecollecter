/**
 * 푸시 알림 서비스
 * - 타이머 기반 요리 단계 알림
 * - 사진 촬영 유도 알림
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
 * 타이머 완료 알림 예약
 * @param {number} durationMinutes - 타이머 분
 * @param {string} stepTitle - 단계 이름
 * @param {string} stepDescription - 단계 설명
 * @returns {Promise<string>} 알림 ID
 */
export async function scheduleTimerNotification(durationMinutes, stepTitle, stepDescription) {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ ${stepTitle} 완료!`,
      body: `다음 단계로 넘어갈 시간이에요.\n${stepDescription}`,
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
 * 사진 촬영 유도 알림
 * @param {string} stepTitle - 단계 이름
 * @param {number} stepNumber - 단계 번호
 * @returns {Promise<string>} 알림 ID
 */
export async function sendPhotoPromptNotification(stepTitle, stepNumber) {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `📸 지금 찍어두세요!`,
      body: `${stepTitle} 완성 모습을 기록해보세요.`,
      sound: 'default',
      data: { type: 'photo_prompt', stepNumber },
    },
    trigger: null, // 즉시 발송
  });
  return id;
}

/**
 * 다음 단계 시작 안내 알림
 * @param {number} stepNumber
 * @param {string} stepTitle
 */
export async function sendNextStepNotification(stepNumber, stepTitle) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `👨‍🍳 ${stepNumber}단계 시작`,
      body: stepTitle,
      sound: 'default',
      data: { type: 'next_step', stepNumber },
    },
    trigger: null,
  });
}

/**
 * 예약된 알림 취소
 * @param {string} notificationId
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
 * @param {Function} onReceive - 알림 수신 콜백
 * @param {Function} onResponse - 알림 탭 콜백
 * @returns {Function} 리스너 해제 함수
 */
export function addNotificationListeners(onReceive, onResponse) {
  const receiveListener = Notifications.addNotificationReceivedListener(onReceive);
  const responseListener = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    receiveListener.remove();
    responseListener.remove();
  };
}
