// src/screens/GoalsScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS, SPACING, RADIUS, SHADOW } from '../utils/theme';
import { Storage } from '../utils/storage';

const REWARD_CHIPS = [
  { e:'🎬', l:'Movie night' }, { e:'🍕', l:'Cheat meal'   },
  { e:'🛍️', l:'Shopping'   }, { e:'☕', l:'Coffee treat' },
  { e:'🎮', l:'Gaming hour' }, { e:'💆', l:'Spa/Rest day' },
];

const GOAL_EMOJIS = ['🎯','💪','📚','🏃','💧','🧘','💰','❤️','🏆','🌟'];

export default function GoalsScreen() {
  const [goals,   setGoals]   = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title,   setTitle]   = useState('');
  const [target,  setTarget]  = useState('30');
  const [reward,  setReward]  = useState('');
  const [emoji,   setEmoji]   = useState('🎯');

  useFocusEffect(useCallback(() => { Storage.getGoals().then(setGoals); }, []));

  const addGoal = async () => {
    if (!title.trim()) { Alert.alert('Required','Enter a goal name.'); return; }
    const g = {
      id:`goal_${Date.now()}`, title:title.trim(),
      target:parseInt(target)||30, current:0,
      reward:reward.trim(), emoji,
      createdAt: new Date().toISOString(),
    };
    const u=[...goals,g]; setGoals(u); await Storage.saveGoals(u);
    setTitle(''); setTarget('30'); setReward(''); setEmoji('🎯'); setShowAdd(false);
  };

  const increment = async (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const u=goals.map(g=>g.id===id?{...g,current:Math.min(g.current+1,g.target)}:g);
    setGoals(u); await Storage.saveGoals(u);
  };

  const del = async (id) => {
    Alert.alert('Delete','Remove this goal?',[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{
        const u=goals.filter(g=>g.id!==id); setGoals(u); await Storage.saveGoals(u);
      }},
    ]);
  };

  return (
    <ScrollView style={{ flex:1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingBottom:60 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient colors={['#FF6B9D','#FF8C42']} style={s.header} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Text style={s.headerTitle}>🎯 Goals & Rewards</Text>
        <Text style={s.headerSub}>Set goals, attach rewards, stay motivated</Text>
        <TouchableOpacity onPress={()=>setShowAdd(v=>!v)} style={s.addBtn}>
          <Text style={s.addBtnText}>{showAdd?'✕ Cancel':'＋ New Goal'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      {showAdd && (
        <View style={s.addCard}>
          <Text style={s.addTitle}>Create New Goal</Text>
          <View style={s.emojiRow}>
            {GOAL_EMOJIS.map(e=>(
              <TouchableOpacity key={e} onPress={()=>setEmoji(e)}
                style={[s.emojiBtn, emoji===e && { backgroundColor: COLORS.primaryPale, borderColor: COLORS.primary, borderWidth:2 }]}>
                <Text style={{fontSize:22}}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.input} value={title} onChangeText={setTitle}
            placeholder="Goal name (e.g. Read 30 books)" placeholderTextColor={COLORS.textMuted} />
          <TextInput style={s.input} value={target} onChangeText={setTarget}
            placeholder="Target count" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
          <Text style={s.rewardLabel}>🏆 Choose reward</Text>
          <View style={s.rewardRow}>
            {REWARD_CHIPS.map(r=>(
              <TouchableOpacity key={r.l} onPress={()=>setReward(r.l)}
                style={[s.rewardChip, reward===r.l && { backgroundColor: COLORS.goldPale, borderColor: COLORS.gold, borderWidth:2 }]}>
                <Text style={s.rewardChipText}>{r.e} {r.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.input} value={reward} onChangeText={setReward}
            placeholder="Or type custom reward…" placeholderTextColor={COLORS.textMuted} />
          <TouchableOpacity onPress={addGoal}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={s.createBtn}>
              <Text style={s.createBtnText}>Create Goal 🚀</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ paddingHorizontal: SPACING.md }}>
        {goals.length===0 && !showAdd && (
          <View style={s.empty}>
            <Text style={{fontSize:52,marginBottom:SPACING.md}}>🏆</Text>
            <Text style={s.emptyTitle}>No goals yet</Text>
            <Text style={s.emptySub}>Set a goal and reward yourself when you achieve it</Text>
          </View>
        )}
        {goals.map(g=>{
          const pct=Math.min(g.current/g.target,1);
          const done=g.current>=g.target;
          return (
            <View key={g.id} style={[s.goalCard, done && s.goalCardDone]}>
              <View style={s.goalTop}>
                <View style={[s.goalEmojiBox, done && { backgroundColor: COLORS.successPale }]}>
                  <Text style={{fontSize:28}}>{g.emoji}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={s.goalTitle}>{g.title}</Text>
                  {g.reward && <Text style={s.goalReward}>🏆 {g.reward}</Text>}
                </View>
                {!done && (
                  <TouchableOpacity onPress={()=>increment(g.id)} style={s.plusBtn}>
                    <Text style={s.plusText}>+1</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={()=>del(g.id)} style={s.delBtn}>
                  <Text style={s.delText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={s.goalBarBg}>
                <View style={[s.goalBarFill, { width:`${pct*100}%`, backgroundColor: done?COLORS.success:COLORS.primary }]} />
              </View>
              <View style={s.goalBottom}>
                <Text style={s.goalCount}>{g.current} / {g.target}</Text>
                <Text style={s.goalPct}>{Math.round(pct*100)}%</Text>
              </View>
              {done && (
                <View style={s.doneBanner}>
                  <Text style={s.doneBannerText}>🎉 Goal achieved! Enjoy: {g.reward||'your reward'}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: SPACING.md, paddingTop:56, paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.xxl, borderBottomRightRadius: RADIUS.xxl, marginBottom: SPACING.md,
  },
  headerTitle:{ fontSize:28, fontWeight:'900', color:'#fff' },
  headerSub:  { fontSize:14, color:'rgba(255,255,255,0.80)', marginTop:4 },
  addBtn:     { alignSelf:'flex-start', marginTop: SPACING.md, backgroundColor:'rgba(255,255,255,0.25)', borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  addBtnText: { color:'#fff', fontWeight:'800', fontSize:14 },

  addCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.md, ...SHADOW.md,
  },
  addTitle:    { fontSize:17, fontWeight:'800', color: COLORS.text, marginBottom: SPACING.md },
  emojiRow:    { flexDirection:'row', flexWrap:'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  emojiBtn:    { width:44, height:44, borderRadius: RADIUS.md, backgroundColor: COLORS.bgSection, alignItems:'center', justifyContent:'center' },
  input: {
    backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md,
    borderWidth:1.5, borderColor: COLORS.border, padding: SPACING.md,
    color: COLORS.text, fontSize:15, marginBottom: SPACING.sm, fontWeight:'500',
  },
  rewardLabel: { fontSize:13, fontWeight:'700', color: COLORS.textSub, marginBottom: SPACING.sm },
  rewardRow:   { flexDirection:'row', flexWrap:'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  rewardChip:  { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, backgroundColor: COLORS.bgSection, borderRadius: RADIUS.full },
  rewardChipText:{ fontSize:12, color: COLORS.textSub, fontWeight:'600' },
  createBtn:   { borderRadius: RADIUS.md, padding: SPACING.md, alignItems:'center', marginTop: SPACING.sm },
  createBtnText:{ color:'#fff', fontWeight:'800', fontSize:15 },

  goalCard: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOW.sm,
    borderWidth:1.5, borderColor: COLORS.border,
  },
  goalCardDone:  { borderColor: COLORS.success+'60' },
  goalTop:       { flexDirection:'row', alignItems:'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  goalEmojiBox:  { width:52, height:52, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryPale, alignItems:'center', justifyContent:'center' },
  goalTitle:     { fontSize:15, fontWeight:'800', color: COLORS.text, flex:1 },
  goalReward:    { fontSize:12, color: COLORS.gold, marginTop:2, fontWeight:'600' },
  plusBtn:       { backgroundColor: COLORS.primaryPale, paddingHorizontal: SPACING.sm, paddingVertical:6, borderRadius: RADIUS.sm },
  plusText:      { color: COLORS.primary, fontWeight:'900', fontSize:14 },
  delBtn:        { backgroundColor: COLORS.dangerPale, paddingHorizontal: SPACING.sm, paddingVertical:6, borderRadius: RADIUS.sm },
  delText:       { color: COLORS.danger, fontWeight:'700', fontSize:14 },
  goalBarBg:     { height:8, backgroundColor: COLORS.bgSection, borderRadius: RADIUS.full, overflow:'hidden' },
  goalBarFill:   { height:'100%', borderRadius: RADIUS.full },
  goalBottom:    { flexDirection:'row', justifyContent:'space-between', marginTop:6 },
  goalCount:     { fontSize:12, color: COLORS.textSub, fontWeight:'700' },
  goalPct:       { fontSize:12, color: COLORS.primary, fontWeight:'800' },
  doneBanner:    { backgroundColor: COLORS.successPale, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm, alignItems:'center' },
  doneBannerText:{ fontSize:13, color: COLORS.success, fontWeight:'700' },

  empty:      { alignItems:'center', paddingVertical:60 },
  emptyTitle: { fontSize:20, fontWeight:'800', color: COLORS.text, marginBottom:4 },
  emptySub:   { fontSize:14, color: COLORS.textSub, textAlign:'center', maxWidth:240 },
});
