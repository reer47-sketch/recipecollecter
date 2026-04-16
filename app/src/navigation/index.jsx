import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import IngredientCheckScreen from '../screens/IngredientCheckScreen';
import CookingModeScreen from '../screens/CookingModeScreen';
import CookingJournalScreen from '../screens/CookingJournalScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#FF6B35',
          headerTitleStyle: { fontWeight: '700', color: '#1a1a1a' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#F8F8F8' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: '트렌드 레시피 🍽️' }}
        />
        <Stack.Screen
          name="RecipeDetail"
          component={RecipeDetailScreen}
          options={({ route }) => ({
            title: route.params?.recipeName || '레시피',
            headerBackTitle: '뒤로',
          })}
        />
        <Stack.Screen
          name="IngredientCheck"
          component={IngredientCheckScreen}
          options={{ title: '재료 준비', headerBackTitle: '뒤로' }}
        />
        <Stack.Screen
          name="CookingMode"
          component={CookingModeScreen}
          options={{
            title: '따라하기',
            headerShown: false, // 전체 화면 사용
            gestureEnabled: false, // 실수로 뒤로가기 방지
          }}
        />
        <Stack.Screen
          name="CookingJournal"
          component={CookingJournalScreen}
          options={{ title: '요리 기록', headerBackTitle: '뒤로' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
