import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';

import Today from './screens/Today';
import Shopping from './screens/Shopping';
import Inventory from './screens/Inventory';
import Meals from './screens/Meals';
import UploadPDF from './screens/UploadPDF';
import MealDetail from './screens/MealDetail';

// ─── Stack navigators per tab ────────────────────────────────

const TodayStack = createStackNavigator();
function TodayStackScreen() {
  return (
    <TodayStack.Navigator screenOptions={{ headerShown: false }}>
      <TodayStack.Screen name="TodayMain" component={Today} />
    </TodayStack.Navigator>
  );
}

const ShoppingStack = createStackNavigator();
function ShoppingStackScreen() {
  return (
    <ShoppingStack.Navigator screenOptions={{ headerShown: false }}>
      <ShoppingStack.Screen name="ShoppingMain" component={Shopping} />
    </ShoppingStack.Navigator>
  );
}

const InventoryStack = createStackNavigator();
function InventoryStackScreen() {
  return (
    <InventoryStack.Navigator screenOptions={{ headerShown: false }}>
      <InventoryStack.Screen name="InventoryMain" component={Inventory} />
    </InventoryStack.Navigator>
  );
}

const MealsStack = createStackNavigator();
function MealsStackScreen() {
  return (
    <MealsStack.Navigator screenOptions={{ headerShown: false }}>
      <MealsStack.Screen name="MealsMain" component={Meals} />
      <MealsStack.Screen name="MealDetail" component={MealDetail} />
    </MealsStack.Navigator>
  );
}

const UploadStack = createStackNavigator();
function UploadStackScreen() {
  return (
    <UploadStack.Navigator screenOptions={{ headerShown: false }}>
      <UploadStack.Screen name="UploadMain" component={UploadPDF} />
    </UploadStack.Navigator>
  );
}

// ─── Bottom Tab Navigator ────────────────────────────────────

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: '#2D6A4F',
            tabBarInactiveTintColor: '#9E9E9E',
            tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#E0E0E0',
              borderTopWidth: 1,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
            },
            tabBarIcon: ({ color, size }) => {
              const icons: Record<string, string> = {
                Today: '🏠',
                Shopping: '🛒',
                Inventory: '📦',
                Meals: '📅',
                Upload: '📤',
              };
              return (
                <Text style={{ fontSize: size - 2, color }}>
                  {icons[route.name] ?? '•'}
                </Text>
              );
            },
          })}
        >
          <Tab.Screen name="Today" component={TodayStackScreen} />
          <Tab.Screen name="Shopping" component={ShoppingStackScreen} />
          <Tab.Screen name="Inventory" component={InventoryStackScreen} />
          <Tab.Screen name="Meals" component={MealsStackScreen} />
          <Tab.Screen name="Upload" component={UploadStackScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
