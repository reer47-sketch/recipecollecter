import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation';
import { useEffect } from 'react';
import { requestPermissions } from './src/services/notifications';

function App() {
  useEffect(() => {
    requestPermissions();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#fff" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
