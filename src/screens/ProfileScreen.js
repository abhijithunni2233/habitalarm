// src/screens/ProfileScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS, SPACING, RADIUS, SHADOW, LEVELS, getLevelInfo } from '../utils/theme';
import { Storage, getTodayKey, getStreakCount } from '../utils/storage';

const BADGES = [
  { id:'first',    e:'🌱', l:'First Habit',    d:'Create your first habit',        ok:(h)=>h.length>=1 },
  { id:'streak7',  e:'🔥', l:'Week Warrior',   d:'7-day streak on any habit',      ok:(h,l)=>h.some(x=>getStreakCount(l,x.id)>=7) },
  { id:'streak30', e:'⚡', l:'Monthly Master', d:'30-day streak on any habit',     ok:(h,l)=>h.some(x=>getStreakCount(l,x.id)>=30) },
  { id:'five',     e:'💪', l:'Full Stack',     d:'5 or more habits active',        ok:(h)=>h.length>=5 },
  { id:'perfect',  e:'⭐', l:'Perfect Day',    d:'Complete all habits in one day',  ok:(h,l)=>{
    const k=getTodayKey(),dl=l[k]||{}; return h.length>0&&h.every(x=>dl[x.id]);
  }},
  { id:'lv5',      e:'🏆', l:'Level 5',        d:'Reach Level 5',                  ok:(_,__,u)=>getLevelInfo(u.xp).current.level>=5 },
  { id:'mood7',    e:'😄', l:'Mood Tracker',   d:'Log mood 7 days running',        ok:(_,__,___,m)=>{
    for(let i=0;i<7;i++){
      const d=new Date();d.setDate(d.getDate()-i);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if(!m[k]) return false;
    } return true;
  }},
  { id:'xp500',    e:'💎', l:'Diamond',        d:'Earn 500 XP',                   ok:(_,__,u)=>u.xp>=500 },
];

export default function ProfileScreen() {
  const [user,   setUser]   = useState({ xp:0, name:'Champion' });
  const [habits, setHabits] = useState([]);
  const [logs,   setLogs]   = useState({});
  const [moods,  setMoods]  = useState({});
  const [editName, setEditName] = useState(false);
  const [tmpName,  setTmpName]  = useState('');

  const load = useCallback(async () => {
    const [u,h,l,m]=await Promise.all([Storage.getUser(),Storage.getHabits(),Storage.getLogs(),Storage.getMoods()]);
    setUser(u);setHabits(h);setLogs(l);setMoods(m);
  },[]);
  useFocusEffect(useCallback(()=>{load();},[load]));

  const info    = getLevelInfo(user.xp);
  const earned  = BADGES.filter(b=>b.ok(habits,logs,user,moods));
  const bestStreak = habits.reduce((b,h)=>{const s=getStreakCount(logs,h.id);return s>b?s:b;},0);
  const totalDone  = Object.values(logs).reduce((a,d)=>a+Object.values(d).filter(Boolean).length,0);

  const saveName = async () => {
    if(!tmpName.trim()) return;
    const u={...user,name:tmpName.trim()};setUser(u);await Storage.saveUser(u);setEditName(false);
  };

  const reset = () => Alert.alert('Reset All','Delete all habits and progress?',[
    {text:'Cancel',style:'cancel'},
    {text:'Reset',style:'destructive',onPress:async()=>{
      await Promise.all([
        Storage.saveHabits([]), Storage.saveLogs({}),
        Storage.saveMoods({}), Storage.saveUser({xp:0,name:user.name}),
      ]); load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }},
  ]);

  return (
    <ScrollView style={{flex:1,backgroundColor:COLORS.bg}} contentContainerStyle={{paddingBottom:60}} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <LinearGradient colors={[COLORS.primary,'#4CC9F0']} style={s.hero} start={{x:0,y:0}} end={{x:1,y:1}}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(user.name||'C')[0].toUpperCase()}</Text>
          </View>
        </View>
        {editName
          ? <TextInput style={s.nameInput} value={tmpName} onChangeText={setTmpName}
              autoFocus onBlur={saveName} onSubmitEditing={saveName} maxLength={20} />
          : <TouchableOpacity onPress={()=>{setTmpName(user.name);setEditName(true);}}>
              <Text style={s.userName}>{user.name} ✏️</Text>
            </TouchableOpacity>
        }
        <View style={s.levelChip}>
          <Text style={s.levelChipText}>⚡ Level {info.current.level} · {info.current.title}</Text>
        </View>
      </LinearGradient>

      {/* XP card */}
      <View style={s.xpCard}>
        <View style={s.xpRow}>
          <Text style={s.xpVal}>{user.xp} XP</Text>
          {info.next && <Text style={s.xpNext}>→ {info.next.title} ({info.next.xp} XP)</Text>}
        </View>
        <View style={s.xpBarBg}>
          <View style={[s.xpBarFill,{width:`${info.progress*100}%`}]} />
        </View>
        <View style={s.levelDots}>
          {LEVELS.map(l=>(
            <View key={l.level} style={[s.ldot, user.xp>=l.xp && s.ldotOn]}>
              <Text style={s.ldotTxt}>{l.level}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { val:habits.length,     lbl:'Habits',     color:'#4F8EF7' },
          { val:`🔥${bestStreak}`, lbl:'Best Streak',color: COLORS.gold },
          { val:totalDone,         lbl:'Total Done',  color: COLORS.success },
          { val:earned.length,     lbl:'Badges',      color:'#FF6B9D' },
        ].map((s2,i)=>(
          <View key={i} style={[s.statCard,{borderTopColor:s2.color, borderTopWidth:4}]}>
            <Text style={[s.statVal,{color:s2.color}]}>{s2.val}</Text>
            <Text style={s.statLbl}>{s2.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Badges */}
      <View style={s.sec}>
        <Text style={s.secTitle}>🏅 Badges</Text>
        <View style={s.badgeGrid}>
          {BADGES.map(b=>{
            const ok=earned.includes(b);
            return (
              <View key={b.id} style={[s.badge, !ok && s.badgeLocked]}>
                <Text style={[s.badgeE, !ok && {opacity:0.2}]}>{b.e}</Text>
                <Text style={[s.badgeL, !ok && {color:COLORS.textMuted}]}>{b.l}</Text>
                <Text style={s.badgeD}>{b.d}</Text>
                {ok && <Text style={s.badgeDone}>✓ Earned</Text>}
              </View>
            );
          })}
        </View>
      </View>

      {/* Reset */}
      <View style={s.sec}>
        <TouchableOpacity onPress={reset} style={s.resetBtn}>
          <Text style={s.resetText}>🗑️ Reset All Data</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: {
    alignItems:'center', paddingTop:60, paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.xxl, borderBottomRightRadius: RADIUS.xxl, marginBottom: SPACING.md,
  },
  avatarWrap: { width:96, height:96, borderRadius:48, borderWidth:4, borderColor:'rgba(255,255,255,0.5)', padding:3, marginBottom: SPACING.md },
  avatar:    { flex:1, borderRadius:44, backgroundColor:'rgba(255,255,255,0.25)', alignItems:'center', justifyContent:'center' },
  avatarText:{ fontSize:38, fontWeight:'900', color:'#fff' },
  userName:  { fontSize:24, fontWeight:'900', color:'#fff', marginBottom: SPACING.sm },
  nameInput: { backgroundColor:'rgba(255,255,255,0.25)', borderRadius: RADIUS.md, padding: SPACING.sm, color:'#fff', fontSize:20, fontWeight:'700', textAlign:'center', minWidth:160, marginBottom: SPACING.sm },
  levelChip: { backgroundColor:'rgba(255,255,255,0.20)', borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  levelChipText:{ color:'#fff', fontWeight:'700', fontSize:13 },

  xpCard: { marginHorizontal: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.md, ...SHADOW.sm },
  xpRow:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: SPACING.sm },
  xpVal:  { fontSize:20, fontWeight:'900', color: COLORS.primary },
  xpNext: { fontSize:11, color: COLORS.textSub },
  xpBarBg:  { height:10, backgroundColor: COLORS.bgSection, borderRadius: RADIUS.full, overflow:'hidden', marginBottom: SPACING.sm },
  xpBarFill:{ height:'100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  levelDots:{ flexDirection:'row', justifyContent:'space-between' },
  ldot:  { width:26, height:26, borderRadius:13, backgroundColor: COLORS.bgSection, alignItems:'center', justifyContent:'center' },
  ldotOn:{ backgroundColor: COLORS.primary },
  ldotTxt:{ fontSize:9, fontWeight:'800', color: COLORS.text },

  statsRow:{ flexDirection:'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  statCard:{ flex:1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.sm, alignItems:'center', ...SHADOW.sm },
  statVal: { fontSize:18, fontWeight:'900', color: COLORS.primary },
  statLbl: { fontSize:9, color: COLORS.textSub, marginTop:2, fontWeight:'700', textAlign:'center' },

  sec:     { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  secTitle:{ fontSize:17, fontWeight:'800', color: COLORS.text, marginBottom: SPACING.sm },

  badgeGrid:{ flexDirection:'row', flexWrap:'wrap', gap: SPACING.sm },
  badge:    { width:'47%', backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.md, alignItems:'center', ...SHADOW.sm, borderWidth:1.5, borderColor: COLORS.primaryPale },
  badgeLocked:{ borderColor: COLORS.border },
  badgeE:   { fontSize:32, marginBottom: SPACING.xs },
  badgeL:   { fontSize:12, fontWeight:'800', color: COLORS.text, textAlign:'center' },
  badgeD:   { fontSize:10, color: COLORS.textMuted, textAlign:'center', marginTop:2 },
  badgeDone:{ fontSize:11, color: COLORS.success, fontWeight:'700', marginTop: SPACING.xs },

  resetBtn: { backgroundColor: COLORS.dangerPale, borderRadius: RADIUS.md, padding: SPACING.md, alignItems:'center', borderWidth:1.5, borderColor: COLORS.danger+'40' },
  resetText:{ color: COLORS.danger, fontWeight:'700', fontSize:14 },
});
