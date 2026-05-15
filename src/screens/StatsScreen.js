// src/screens/StatsScreen.js
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  FlatList, TouchableOpacity,
} from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { COLORS, SPACING, RADIUS, SHADOW } from '../utils/theme';
import { Storage, getTodayKey, getStreakCount, getCompletionRate } from '../utils/storage';

const { width } = Dimensions.get('window');
const DAY_SHORT  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const DAY_FULL   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CHART_W    = width - SPACING.md * 2;
const FROZEN_W   = 110; // width of frozen habit-name column
const CELL_W     = 44;  // width of each day cell

// ── Build last N days keys ────────────────────────────────────────────────────
function buildDayKeys(n = 14) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    keys.push({ key, label: DAY_SHORT[d.getDay()], date: d.getDate(), isToday: i === 0 });
  }
  return keys;
}

// ── Habit Matrix (frozen left col + horizontal scroll days) ───────────────────
function HabitMatrix({ habits, logs }) {
  const dayKeys = buildDayKeys(14);
  const scrollRef = useRef(null);

  // Auto-scroll to rightmost (today) on mount
  React.useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);

  if (habits.length === 0) return null;

  return (
    <View style={matrix.container}>
      <Text style={matrix.title}>📅 14-Day Habit Matrix</Text>
      <Text style={matrix.sub}>Habit name frozen left · Scroll days right</Text>

      <View style={matrix.tableWrap}>
        {/* Frozen left column — habit names */}
        <View style={matrix.frozenCol}>
          {/* header spacer */}
          <View style={matrix.frozenHeader}>
            <Text style={matrix.frozenHeaderText}>Habit</Text>
          </View>
          {habits.map(h => (
            <View key={h.id} style={matrix.frozenCell}>
              <Text style={matrix.frozenIcon}>{h.icon}</Text>
              <Text style={matrix.frozenName} numberOfLines={1}>{h.name}</Text>
            </View>
          ))}
        </View>

        {/* Scrollable days */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={matrix.scrollArea}
        >
          <View>
            {/* Day headers */}
            <View style={matrix.dayHeaderRow}>
              {dayKeys.map(dk => (
                <View key={dk.key} style={[matrix.dayHeader, dk.isToday && matrix.dayHeaderToday]}>
                  <Text style={[matrix.dayHeaderLabel, dk.isToday && { color: COLORS.primary }]}>{dk.label}</Text>
                  <Text style={[matrix.dayHeaderDate,  dk.isToday && { color: COLORS.primary, fontWeight:'900' }]}>{dk.date}</Text>
                </View>
              ))}
            </View>
            {/* Habit rows */}
            {habits.map(h => (
              <View key={h.id} style={matrix.habitRow}>
                {dayKeys.map(dk => {
                  const done = !!(logs[dk.key] && logs[dk.key][h.id]);
                  return (
                    <View key={dk.key} style={matrix.cell}>
                      <View style={[
                        matrix.cellDot,
                        { backgroundColor: done ? (h.color || COLORS.primary) : COLORS.bgSection },
                        dk.isToday && !done && { borderWidth:1.5, borderColor: COLORS.primary + '50' },
                      ]}>
                        {done && <Text style={matrix.cellCheck}>✓</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const matrix = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl,
    padding: SPACING.md, ...SHADOW.sm,
  },
  title:   { fontSize:15, fontWeight:'800', color: COLORS.text },
  sub:     { fontSize:11, color: COLORS.textMuted, marginTop:2, marginBottom: SPACING.sm },
  tableWrap:{ flexDirection:'row' },

  frozenCol:    { width: FROZEN_W, zIndex:2 },
  frozenHeader: { height:44, justifyContent:'flex-end', paddingBottom:6 },
  frozenHeaderText: { fontSize:11, fontWeight:'700', color: COLORS.textMuted, textTransform:'uppercase' },
  frozenCell:   {
    height:40, flexDirection:'row', alignItems:'center',
    gap:6, paddingRight:6, borderBottomWidth:1, borderBottomColor: COLORS.border,
  },
  frozenIcon:   { fontSize:16 },
  frozenName:   { flex:1, fontSize:12, fontWeight:'700', color: COLORS.text },

  scrollArea:   { flex:1 },
  dayHeaderRow: { flexDirection:'row', height:44, alignItems:'flex-end', paddingBottom:4 },
  dayHeader:    { width: CELL_W, alignItems:'center' },
  dayHeaderToday:{ backgroundColor: COLORS.primaryPale, borderRadius: RADIUS.sm },
  dayHeaderLabel:{ fontSize:9, color: COLORS.textMuted, fontWeight:'700' },
  dayHeaderDate: { fontSize:13, color: COLORS.textSub, fontWeight:'700' },

  habitRow:     { flexDirection:'row', height:40, alignItems:'center', borderBottomWidth:1, borderBottomColor: COLORS.border },
  cell:         { width: CELL_W, alignItems:'center' },
  cellDot:      { width:28, height:28, borderRadius:8, alignItems:'center', justifyContent:'center' },
  cellCheck:    { fontSize:14, color:'#fff', fontWeight:'900' },
});

// ── Charts config ─────────────────────────────────────────────────────────────
const chartCfg = {
  backgroundGradientFrom: COLORS.bgCard,
  backgroundGradientTo:   COLORS.bgCard,
  color: (o=1) => `rgba(108,60,225,${o})`,
  labelColor: () => COLORS.textSub,
  strokeWidth: 2.5,
  barPercentage: 0.55,
  decimalPlaces: 0,
  propsForDots: { r:'5', strokeWidth:'2', stroke: COLORS.primary },
  propsForBackgroundLines: { stroke: COLORS.border, strokeDasharray:'' },
};

export default function StatsScreen() {
  const [habits, setHabits] = useState([]);
  const [logs,   setLogs]   = useState({});
  const [moods,  setMoods]  = useState({});
  const [weekData, setWeekData] = useState({ labels:[], datasets:[{data:[]}] });
  const [moodData, setMoodData] = useState({ labels:[], datasets:[{data:[]}] });

  const load = useCallback(async () => {
    const [h,l,m] = await Promise.all([Storage.getHabits(), Storage.getLogs(), Storage.getMoods()]);
    setHabits(h); setLogs(l); setMoods(m);

    const labels=[], completions=[];
    for (let i=6;i>=0;i--) {
      const d=new Date(); d.setDate(d.getDate()-i);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      labels.push(DAY_FULL[d.getDay()]);
      completions.push(Object.values(l[key]||{}).filter(Boolean).length||0);
    }
    setWeekData({ labels, datasets:[{data:completions}] });

    const ml=[], mv=[];
    for (let i=6;i>=0;i--) {
      const d=new Date(); d.setDate(d.getDate()-i);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      ml.push(DAY_FULL[d.getDay()]); mv.push(m[key]||0);
    }
    setMoodData({ labels:ml, datasets:[{data:mv, color:(o=1)=>`rgba(6,214,160,${o})`}] });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalDone  = Object.values(logs).reduce((a,day) => a+Object.values(day).filter(Boolean).length, 0);
  const bestStreak = habits.reduce((b,h) => { const s=getStreakCount(logs,h.id); return s>b?s:b; }, 0);
  const moodVals   = Object.values(moods);
  const avgMood    = moodVals.length > 0 ? (moodVals.reduce((a,b)=>a+b,0)/moodVals.length).toFixed(1) : '—';

  return (
    <ScrollView style={{ flex:1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingBottom:60 }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={styles.header} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Text style={styles.headerTitle}>📊 Statistics</Text>
        <Text style={styles.headerSub}>Your habit insights & progress</Text>
      </LinearGradient>

      {/* Overview cards */}
      <View style={styles.overviewRow}>
        <View style={[styles.overviewCard, { backgroundColor:'#4F8EF7' }]}>
          <Text style={styles.overviewVal}>{totalDone}</Text>
          <Text style={styles.overviewLbl}>Total Done</Text>
        </View>
        <View style={[styles.overviewCard, { backgroundColor: COLORS.gold }]}>
          <Text style={styles.overviewVal}>🔥{bestStreak}</Text>
          <Text style={styles.overviewLbl}>Best Streak</Text>
        </View>
        <View style={[styles.overviewCard, { backgroundColor: COLORS.success }]}>
          <Text style={styles.overviewVal}>{avgMood}</Text>
          <Text style={styles.overviewLbl}>Avg Mood</Text>
        </View>
      </View>

      {/* ── HABIT MATRIX (frozen + scroll) ── */}
      <HabitMatrix habits={habits} logs={logs} />

      {/* Weekly chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Weekly Completions</Text>
        {weekData.datasets[0].data.length > 0
          ? <BarChart data={weekData} width={CHART_W-SPACING.md*2} height={180}
              chartConfig={chartCfg} fromZero showValuesOnTopOfBars
              style={{ borderRadius: RADIUS.md, marginTop: SPACING.sm }} />
          : <Text style={styles.noData}>Complete habits to see the chart</Text>}
      </View>

      {/* Mood chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Mood Trend</Text>
        {moodData.datasets[0].data.some(v=>v>0)
          ? <LineChart data={moodData} width={CHART_W-SPACING.md*2} height={160}
              chartConfig={{ ...chartCfg, color:(o=1)=>`rgba(6,214,160,${o})` }}
              bezier fromZero segments={5}
              style={{ borderRadius: RADIUS.md, marginTop: SPACING.sm }} />
          : <Text style={styles.noData}>Log your mood to see the trend</Text>}
      </View>

      {/* Per-habit breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Habit Breakdown</Text>
        {habits.length === 0 && <Text style={styles.noData}>No habits yet</Text>}
        {habits.map(h => {
          const streak = getStreakCount(logs, h.id);
          const r7  = getCompletionRate(logs, h.id, 7);
          const r30 = getCompletionRate(logs, h.id, 30);
          return (
            <View key={h.id} style={styles.habitStat}>
              <View style={[styles.habitStatDot, { backgroundColor: h.color || COLORS.primary }]}>
                <Text style={{ fontSize:18 }}>{h.icon}</Text>
              </View>
              <View style={{ flex:1 }}>
                <View style={styles.habitStatRow}>
                  <Text style={styles.habitStatName}>{h.name}</Text>
                  <Text style={styles.habitStatStreak}>🔥 {streak}</Text>
                </View>
                <View style={styles.habitStatBar}>
                  <View style={[styles.habitStatFill, { width:`${r7}%`, backgroundColor: h.color || COLORS.primary }]} />
                </View>
                <Text style={styles.habitStatSub}>7d: {r7}% · 30d: {r30}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: SPACING.md, paddingTop:56, paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADIUS.xxl, borderBottomRightRadius: RADIUS.xxl,
    marginBottom: SPACING.md,
  },
  headerTitle: { fontSize:28, fontWeight:'900', color:'#fff' },
  headerSub:   { fontSize:14, color:'rgba(255,255,255,0.75)', marginTop:4 },

  overviewRow: { flexDirection:'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  overviewCard:{
    flex:1, borderRadius: RADIUS.xl, padding: SPACING.md, alignItems:'center', ...SHADOW.sm,
  },
  overviewVal: { fontSize:22, fontWeight:'900', color:'#fff' },
  overviewLbl: { fontSize:10, color:'rgba(255,255,255,0.80)', marginTop:4, fontWeight:'700', textAlign:'center' },

  chartCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl,
    padding: SPACING.md, ...SHADOW.sm,
  },
  chartTitle: { fontSize:15, fontWeight:'800', color: COLORS.text },
  noData:     { fontSize:13, color: COLORS.textMuted, paddingVertical: SPACING.lg, textAlign:'center' },

  section:     { paddingHorizontal: SPACING.md },
  sectionTitle:{ fontSize:17, fontWeight:'800', color: COLORS.text, marginBottom: SPACING.sm },

  habitStat: {
    flexDirection:'row', alignItems:'center', gap: SPACING.sm,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOW.sm,
  },
  habitStatDot:{ width:44, height:44, borderRadius:14, alignItems:'center', justifyContent:'center', opacity:0.9 },
  habitStatRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  habitStatName:{ fontSize:14, fontWeight:'700', color: COLORS.text, flex:1 },
  habitStatStreak:{ fontSize:12, color: COLORS.gold, fontWeight:'700' },
  habitStatBar:{ height:7, backgroundColor: COLORS.bgSection, borderRadius: RADIUS.full, overflow:'hidden' },
  habitStatFill:{ height:'100%', borderRadius: RADIUS.full },
  habitStatSub:{ fontSize:11, color: COLORS.textSub, marginTop:4 },
});
