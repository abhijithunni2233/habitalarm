import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [habits, setHabits] = useState([]);
  const [screen, setScreen] = useState('home');

  useEffect(() => {
    AsyncStorage.getItem('habits').then(d => {
      if(d) setHabits(JSON.parse(d));
    });
  }, []);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>🏠 HabitAlarm</Text>
      </View>
      <ScrollView contentContainerStyle={{padding:16}}>
        <Text style={s.sub}>App is working! Habits: {habits.length}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F0EEFF'},
  header:{backgroundColor:'#6C3CE1',padding:20,paddingTop:50},
  title:{fontSize:24,fontWeight:'900',color:'#fff'},
  sub:{fontSize:16,color:'#6B6490',marginTop:8},
});
