import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@recipe_device_id';

/**
 * 디바이스 고유 ID 생성/조회
 * 로그인 없이 세션을 연결하기 위해 사용
 */
export async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
