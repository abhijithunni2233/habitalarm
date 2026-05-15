import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

import HomeScreen from './src/screens/HomeScreen';
import StatsScreen from './src/screens/StatsScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AddHabitScreen from './src/screens/AddHabitScreen';
import HabitDetailScreen from './src/screens/HabitDetailScreen';

import { COLORS, SHADOW } from './src/utils/theme';

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      {focused && <Text style={styles.tabLabel}>{label}</Text>}
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown:false, tabBarStyle:styles.tabBar, tabBarShowLabel:false }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon:({focused})=><TabIcon emoji="🏠" label="Today" focused={focused}/> }}/>
      <Tab.Screen name="Stats" component={StatsScreen} options={{ tabBarIcon:({focused})=><TabIcon emoji="📊" label="Stats" focused={focused}/> }}/>
      <Tab.Screen name="Goals" component={GoalsScreen} options={{ tabBarIcon:({focused})=><TabIcon emoji="🎯" label="Goals" focused={focused}/> }}/>
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon:({focused})=><TabIcon emoji="⚡" label="Profile" focused={focused}/> }}/>
    </Tab.Navigator>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:20, backgroundColor:'#F0EEFF' }}>
          <Text style={{ fontSize:24, fontWeight:'900', color:'#6C3CE1', marginBottom:10 }}>⚠️ App Error</Text>
          <Text style={{ fontSize:12, color:'#666', textAlign:'center' }}>{this.state.error?.toString()}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex:1, backgroundColor:COLORS.bg }}>
        <StatusBar style="dark" />
        <NavigationContainer theme={{ dark:false, colors:{ primary:COLORS.primary, background:COLORS.bg, card:COLORS.bgCard, text:COLORS.text, border:COLORS.border, notification:COLORS.primary } }}>
          <Stack.Navigator screenOptions={{ headerShown:false }}>
            <Stack.Screen name="MainTabs" component={MainTabs}/>
            <Stack.Screen name="AddHabit" component={AddHabitScreen} options={{ presentation:'modal' }}/>
            <Stack.Screen name="HabitDetail" component={HabitDetailScreen} options={{ presentation:'card' }}/>
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  tabBar:{ backgroundColor:COLORS.bgCard, borderTopColor:COLORS.border, borderTopWidth:1, height:Platform.OS==='ios'?84:68, paddingBottom:Platform.OS==='ios'?24:8, paddingTop:8, ...SHADOW.sm },
  tabIcon:{ alignItems:'center', justifyContent:'center', paddingHorizontal:12, paddingVertical:6, borderRadius:20 },
  tabIconFocused:{ backgroundColor:COLORS.primaryPale, flexDirection:'row', gap:6 },
  tabEmoji:{ fontSize:20 },
  tabLabel:{ fontSize:12, color:COLORS.primary, fontWeight:'700' },
});
