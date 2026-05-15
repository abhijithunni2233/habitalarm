// src/screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Dimensions, RefreshControl,
} from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS, SPACING, RADIUS, SHADOW, MOTIVATIONAL_QUOTES, getLevelInfo, XP_PER_HABIT } from '../utils/theme';
import { Storage, getTodayKey, getStreakCount } from '../utils/storage';

const { width } = Dimensions.get('window');

const MOOD_DATA = [
  { value:1, emoji:'😞', color: COLORS.mood1 },
  { value:2, emoji:'😕', color: COLORS.mood2 },
  { value:3, emoji:'😐', color: COLORS.mood3 },
  { value:4, emoji:'🙂', color: COLORS.mood4 },
  { value:5, emoji:'😄', color: COLORS.mood5 },
];

// ─── Auto-swipe Quotes Card ───────────────────────────────────────────────────
function QuotesCard() {
  const [idx, setIdx] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      // slide out left + fade
      Animated.parallel([
        Animated.timing(translateX, { toValue: -30, duration: 350, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 350, useNativeDriver: true }),
      ]).start(() => {
        translateX.setValue(30);
        setIdx(i => (i + 1) % MOTIVATIONAL_QUOTES.length);
        // slide in from right + fade in
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }),
          Animated.timing(opacity,    { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const q = MOTIVATIONAL_QUOTES[idx];
  return (
    <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={styles.quoteCard} start={{x:0,y:0}} end={{x:1,y:1}}>
      <Text style={styles.quoteDecor}>"</Text>
      <Animated.View style={{ flex:1, transform:[{translateX}], opacity }}>
        <Text style={styles.quoteText}>{q.text}</Text>
        <Text style={styles.quoteAuthor}>— {q.author}</Text>
      </Animated.View>
      {/* Dots */}
      <View style={styles.quoteDots}>
        {MOTIVATIONAL_QUOTES.map((_,i) => (
          <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
        ))}
      </View>
    </LinearGradient>
  );
}

// ─── XP Level Strip ───────────────────────────────────────────────────────────
function LevelStrip({ xp }) {
  const info = getLevelInfo(xp);
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue: info.progress, duration: 900, useNativeDriver: false }).start();
  }, [xp]);

  return (
    <View style={styles.levelStrip}>
      <View style={styles.levelLeft}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelNum}>{info.current.level}</Text>
        </View>
        <View>
          <Text style={styles.levelTitle}>{info.current.title}</Text>
          <Text style={styles.levelXP}>{xp} XP</Text>
        </View>
      </View>
      <View style={styles.levelRight}>
        <View style={styles.levelBarBg}>
          <Animated.View style={[styles.levelBarFill, {
            width: barAnim.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] }),
          }]} />
        </View>
        {info.next && <Text style={styles.levelNext}>{info.next.xp - xp} XP to {info.next.title}</Text>}
      </View>
    </View>
  );
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function ProgressRing({ done, total }) {
  const pct = total > 0 ? done / total : 0;
  const color = pct === 1 ? COLORS.success : COLORS.primary;
  return (
    <View style={styles.ringWrap}>
      <View style={[styles.ring, { borderColor: COLORS.border }]}>
        <View style={[styles.ringArc, {
          borderColor: color,
          transform: [{ rotate: `${pct * 360}deg` }],
        }]} />
        <View style={styles.ringInner}>
          <Text style={[styles.ringPct, { color }]}>{Math.round(pct * 100)}%</Text>
          <Text style={styles.ringLabel}>done</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Habit Card (Image 1 style — solid color background) ─────────────────────
function HabitCard({ item, drag, isActive, isCompleted, isRestDay, streak, onToggle, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleCheck = () => {
    if (isRestDay) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension:120 }),
    ]).start();
    onToggle(item.id);
  };

  const bg = item.color || COLORS.habitPalette[0];

  return (
    <Animated.View style={[
      styles.habitCard,
      { backgroundColor: bg },
      isActive && styles.habitCardActive,
      { transform: [{ scale: scaleAnim }] },
    ]}>
      {/* left: icon + info */}
      <TouchableOpacity onLongPress={drag} style={styles.dragZone} activeOpacity={0.9}>
        <View style={styles.habitIconBg}>
          <Text style={styles.habitIcon}>{item.icon}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.habitBody} onPress={() => onPress(item)} activeOpacity={0.8}>
        <Text style={styles.habitName}>{item.name}</Text>
        <View style={styles.habitMeta}>
          {streak > 0 && <Text style={styles.habitStreak}>🔥 {streak} day{streak>1?'s':''}</Text>}
          {item.alarms?.length > 0 && (
            <Text style={styles.habitAlarm}>⏰ {fmtAlarm(item.alarms[0])}</Text>
          )}
          {isRestDay && <Text style={styles.habitRest}>😴 Rest day</Text>}
        </View>
      </TouchableOpacity>

      {/* right: check */}
      <TouchableOpacity onPress={handleCheck} style={styles.checkBtn} disabled={isRestDay}>
        <View style={[styles.checkCircle, isCompleted && styles.checkCircleDone]}>
          {isCompleted && <Text style={styles.checkMark}>✓</Text>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function fmtAlarm(a) {
  const h = a.hour, m = String(a.minute).padStart(2,'0');
  const p = h >= 12 ? 'PM' : 'AM';
  const dh = h === 0 ? 12 : h > 12 ? h-12 : h;
  return `${dh}:${m} ${p}`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const [habits, setHabits] = useState([]);
  const [logs,   setLogs]   = useState({});
  const [moods,  setMoods]  = useState({});
  const [user,   setUser]   = useState({ xp:0, name:'Champion' });
  const today = getTodayKey();
  const todayDayIdx = new Date().getDay();

  const load = useCallback(async () => {
    const [h,l,m,u] = await Promise.all([
      Storage.getHabits(), Storage.getLogs(), Storage.getMoods(), Storage.getUser(),
    ]);
    setHabits(h); setLogs(l); setMoods(m); setUser(u);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleToggle = async (id) => {
    const newLogs = { ...logs };
    if (!newLogs[today]) newLogs[today] = {};
    const was = newLogs[today][id];
    newLogs[today][id] = !was;
    const xpDelta = was ? -XP_PER_HABIT : XP_PER_HABIT;
    const newUser = { ...user, xp: Math.max(0, user.xp + xpDelta) };
    setLogs(newLogs); setUser(newUser);
    await Storage.saveLogs(newLogs); await Storage.saveUser(newUser);
  };

  const handleMood = async (v) => {
    Haptics.selectionAsync();
    const nm = { ...moods, [today]: v };
    setMoods(nm); await Storage.saveMoods(nm);
  };

  const handleReorder = async ({ data }) => {
    setHabits(data); await Storage.saveHabits(data);
  };

  const activeHabits   = habits.filter(h => !h.restDays?.includes(todayDayIdx));
  const completedCount = activeHabits.filter(h => logs[today]?.[h.id]).length;
  const todayMood      = moods[today] || null;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday:'long', month:'long', day:'numeric',
  });

  return (
    <View style={{ flex:1, backgroundColor: COLORS.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Good <Text style={{ color: COLORS.primary }}>{getGreeting()}</Text>
            </Text>
            <Text style={styles.greeting2}>{user.name} 👋</Text>
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
          <TouchableOpacity
            style={styles.addFab}
            onPress={() => navigation.navigate('AddHabit', { onSave: load })}
          >
            <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={styles.addFabGrad}>
              <Text style={styles.addFabText}>＋</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Quotes Card ── */}
        <View style={{ paddingHorizontal: SPACING.md, marginBottom: SPACING.md }}>
          <QuotesCard />
        </View>

        {/* ── Level + Progress row ── */}
        <View style={styles.levelProgressRow}>
          <LevelStrip xp={user.xp} />
        </View>

        {/* ── Today progress summary ── */}
        <View style={styles.progressCard}>
          <ProgressRing done={completedCount} total={activeHabits.length} />
          <View style={styles.progressInfo}>
            <Text style={styles.progressTitle}>Today's Progress</Text>
            <Text style={styles.progressSub}>{completedCount} of {activeHabits.length} habits done</Text>
            {completedCount === activeHabits.length && activeHabits.length > 0 && (
              <View style={styles.allDone}>
                <Text style={styles.allDoneText}>🎉 All habits done!</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Mood tracker ── */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>How are you feeling today?</Text>
          <View style={styles.moodRow}>
            {MOOD_DATA.map(m => (
              <TouchableOpacity
                key={m.value} onPress={() => handleMood(m.value)}
                style={[styles.moodBtn, todayMood === m.value && { backgroundColor: m.color + '22', borderColor: m.color }]}
              >
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Habits list header ── */}
        <View style={[styles.sectionWrap, { marginBottom: SPACING.xs }]}>
          <Text style={styles.sectionTitle}>Upcoming Habits</Text>
          <Text style={styles.sectionHint}>Long-press to reorder</Text>
        </View>
      </ScrollView>

      {/* ── Draggable habit list (outside ScrollView) ── */}
      <DraggableFlatList
        data={habits}
        keyExtractor={item => item.id}
        onDragEnd={handleReorder}
        renderItem={({ item, drag, isActive }) => (
          <HabitCard
            item={item} drag={drag} isActive={isActive}
            isCompleted={!!logs[today]?.[item.id]}
            isRestDay={!!item.restDays?.includes(todayDayIdx)}
            streak={getStreakCount(logs, item.id)}
            onToggle={handleToggle}
            onPress={(h) => navigation.navigate('HabitDetail', { habitId: h.id })}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingBottom: 100 }}
        ListEmptyComponent={
          <TouchableOpacity
            style={styles.empty}
            onPress={() => navigation.navigate('AddHabit', { onSave: load })}
          >
            <Text style={{ fontSize: 52, marginBottom: SPACING.sm }}>🌱</Text>
            <Text style={styles.emptyTitle}>No habits yet!</Text>
            <Text style={styles.emptySub}>Tap here to create your first habit</Text>
          </TouchableOpacity>
        }
        style={{ flex: 1 }}
      />
    </View>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning,';
  if (h < 17) return 'Afternoon,';
  return 'Evening,';
}

const styles = StyleSheet.create({
  header: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start',
    paddingHorizontal: SPACING.md, paddingTop: 56, paddingBottom: SPACING.md,
  },
  greeting:  { fontSize:22, fontWeight:'900', color: COLORS.text },
  greeting2: { fontSize:22, fontWeight:'900', color: COLORS.text, marginTop:-2 },
  dateText:  { fontSize:13, color: COLORS.textSub, marginTop:4 },
  addFab:    { borderRadius: RADIUS.full, overflow:'hidden', ...SHADOW.md },
  addFabGrad:{ width:48, height:48, borderRadius:24, alignItems:'center', justifyContent:'center' },
  addFabText:{ color:'#fff', fontSize:26, fontWeight:'700', marginTop:-2 },

  // Quotes
  quoteCard: {
    borderRadius: RADIUS.xl, padding: SPACING.md, paddingBottom: SPACING.md + 4,
    minHeight: 110, justifyContent:'space-between', ...SHADOW.md,
  },
  quoteDecor:  { fontSize:40, color:'rgba(255,255,255,0.25)', position:'absolute', top:4, left:12 },
  quoteText:   { fontSize:14, color:'#fff', fontWeight:'600', lineHeight:21, paddingTop: 8 },
  quoteAuthor: { fontSize:12, color:'rgba(255,255,255,0.70)', marginTop:6, fontWeight:'700' },
  quoteDots:   { flexDirection:'row', gap:4, marginTop:8 },
  dot:         { width:5, height:5, borderRadius:3, backgroundColor:'rgba(255,255,255,0.35)' },
  dotActive:   { width:14, backgroundColor:'#fff' },

  // Level
  levelProgressRow: { paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  levelStrip: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: SPACING.md,
    flexDirection:'row', alignItems:'center', gap: SPACING.md, ...SHADOW.sm,
  },
  levelLeft:  { flexDirection:'row', alignItems:'center', gap: SPACING.sm },
  levelBadge: {
    width:40, height:40, borderRadius:20, backgroundColor: COLORS.primary,
    alignItems:'center', justifyContent:'center',
  },
  levelNum:   { color:'#fff', fontSize:18, fontWeight:'900' },
  levelTitle: { fontSize:13, fontWeight:'800', color: COLORS.text },
  levelXP:    { fontSize:11, color: COLORS.textSub, marginTop:1 },
  levelRight: { flex:1 },
  levelBarBg: { height:8, backgroundColor: COLORS.bgSection, borderRadius: RADIUS.full, overflow:'hidden', marginBottom:4 },
  levelBarFill:{ height:'100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  levelNext:  { fontSize:10, color: COLORS.textMuted },

  // Progress card
  progressCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.md,
    flexDirection:'row', alignItems:'center', gap: SPACING.md, ...SHADOW.sm,
  },
  ringWrap:    { width:80, height:80, alignItems:'center', justifyContent:'center' },
  ring:        { width:80, height:80, borderRadius:40, borderWidth:7, alignItems:'center', justifyContent:'center', position:'relative' },
  ringArc:     { position:'absolute', width:80, height:80, borderRadius:40, borderWidth:7, borderRightColor:'transparent', borderBottomColor:'transparent' },
  ringInner:   { alignItems:'center' },
  ringPct:     { fontSize:18, fontWeight:'900' },
  ringLabel:   { fontSize:9, color: COLORS.textSub, fontWeight:'600' },
  progressInfo: { flex:1 },
  progressTitle:{ fontSize:16, fontWeight:'800', color: COLORS.text },
  progressSub:  { fontSize:13, color: COLORS.textSub, marginTop:2 },
  allDone:      { backgroundColor: COLORS.successPale, borderRadius: RADIUS.full, paddingHorizontal:10, paddingVertical:4, marginTop:6, alignSelf:'flex-start' },
  allDoneText:  { fontSize:12, color: COLORS.success, fontWeight:'700' },

  // Mood
  sectionWrap: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionTitle:{ fontSize:16, fontWeight:'800', color: COLORS.text, marginBottom: SPACING.sm },
  sectionHint: { fontSize:11, color: COLORS.textMuted, marginTop: -SPACING.xs },
  moodRow:     { flexDirection:'row', gap: SPACING.sm },
  moodBtn:     {
    flex:1, alignItems:'center', paddingVertical:10,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    borderWidth:1.5, borderColor: COLORS.border, ...SHADOW.sm,
  },
  moodEmoji:   { fontSize:24 },

  // Habit cards
  habitCard: {
    flexDirection:'row', alignItems:'center',
    borderRadius: RADIUS.xl, marginBottom: SPACING.sm,
    padding: SPACING.md, paddingRight: SPACING.md, ...SHADOW.card,
  },
  habitCardActive: { opacity: 0.85, transform:[{scale:1.03}] },
  dragZone:    { marginRight: SPACING.sm },
  habitIconBg: {
    width:46, height:46, borderRadius:14,
    backgroundColor:'rgba(255,255,255,0.25)',
    alignItems:'center', justifyContent:'center',
  },
  habitIcon:   { fontSize:24 },
  habitBody:   { flex:1, marginLeft: SPACING.sm },
  habitName:   { fontSize:15, fontWeight:'800', color:'#fff' },
  habitMeta:   { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:4 },
  habitStreak: { fontSize:11, color:'rgba(255,255,255,0.85)', fontWeight:'700' },
  habitAlarm:  { fontSize:11, color:'rgba(255,255,255,0.80)', fontWeight:'600' },
  habitRest:   { fontSize:11, color:'rgba(255,255,255,0.70)' },
  checkBtn:    { marginLeft: SPACING.sm },
  checkCircle: {
    width:32, height:32, borderRadius:16,
    borderWidth:2.5, borderColor:'rgba(255,255,255,0.6)',
    alignItems:'center', justifyContent:'center',
  },
  checkCircleDone: { backgroundColor:'rgba(255,255,255,0.9)', borderColor:'transparent' },
  checkMark:   { fontSize:16, fontWeight:'900', color: COLORS.primary },

  empty:       { alignItems:'center', paddingVertical:60 },
  emptyTitle:  { fontSize:20, fontWeight:'800', color: COLORS.text, marginBottom:4 },
  emptySub:    { fontSize:14, color: COLORS.textSub },
});
