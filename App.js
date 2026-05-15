import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [habits, setHabits] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('habits').then(d => {
      if(d) setHabits(JSON.parse(d));
    });
  }, []);

  const addHabit = async () => {
    if(!name.trim()) return;
    const newHabits = [...habits, {id: Date.now().toString(), name: name.trim(), icon: '💪'}];
    setHabits(newHabits);
    await AsyncStorage.setItem('habits', JSON.stringify(newHabits));
    setName('');
    setScreen('home');
  };

  if(screen === 'add') {
    return (
      <View style={s.container}>
        <LinearGradient colors={['#6C3CE1','#8B5CF6']} style={s.header}>
          <TouchableOpacity onPress={() => setScreen('home')}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Habit</Text>
        </LinearGradient>
        <View style={{padding:16}}>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Habit name" placeholderTextColor="#999"/>
          <TouchableOpacity onPress={addHabit} style={s.btn}>
            <Text style={s.btnText}>Save Habit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={['#6C3CE1','#8B5CF6']} style={s.header}>
        <Text style={s.headerTitle}>🏠 HabitAlarm</Text>
        <TouchableOpacity onPress={() => setScreen('add')} style={s.addBtn}>
          <Text style={s.addBtnText}>＋</Text>
        </TouchableOpacity>
      </LinearGradient>
      <ScrollView contentContainerStyle={{padding:16}}>
        {habits.length === 0 && (
          <View style={s.empty}>
            <Text style={{fontSize:48}}>🌱</Text>
            <Text style={s.emptyText}>No habits yet! Tap + to add one.</Text>
          </View>
        )}
        {habits.map(h => (
          <View key={h.id} style={s.habitCard}>
            <Text style={s.habitIcon}>{h.icon}</Text>
            <Text style={s.habitName}>{h.name}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {flex:1, backgroundColor:'#F0EEFF'},
  header: {flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, paddingTop:50},
  headerTitle: {fontSize:20, fontWeight:'900', color:'#fff'},
  back: {fontSize:16, color:'#fff', fontWeight:'700'},
  addBtn: {width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.3)', alignItems:'center', justifyContent:'center'},
  addBtnText: {fontSize:22, color:'#fff', fontWeight:'700'},
  input: {backgroundColor:'#fff', borderRadius:12, padding:16, fontSize:16, marginBottom:12, borderWidth:1.5, borderColor:'#E2DCF8'},
  btn: {backgroundColor:'#6C3CE1', borderRadius:12, padding:16, alignItems:'center'},
  btnText: {color:'#fff', fontWeight:'800', fontSize:16},
  empty: {alignItems:'center', paddingVertical:60},
  emptyText: {fontSize:16, color:'#6B6490', marginTop:12, textAlign:'center'},
  habitCard: {flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:16, padding:16, marginBottom:12, gap:12},
  habitIcon: {fontSize:28},
  habitName: {fontSize:16, fontWeight:'700', color:'#1A1040'},
});
