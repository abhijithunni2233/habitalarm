import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOW } from '../utils/theme';
import { Storage, getStreakCount, getCompletionRate } from '../utils/storage';

const { width } = Dimensions.get('window');
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const FROZEN_W = 110;
const CELL_W = 44;

function buildDayKeys(n=14) {
  const keys=[];
  for(let i=n-1;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    keys.push({key,label:DAY_SHORT[d.getDay()],date:d.getDate(),isToday:i===0});
  }
  return keys;
}

import { ScrollView as RNScrollView } from 'react-native';

function HabitMatrix({habits,logs}) {
  const dayKeys = buildDayKeys(14);
  const scrollRef = useRef(null);
  React.useEffect(()=>{setTimeout(()=>scrollRef.current?.scrollToEnd({animated:false}),100);},[]);
  if(habits.length===0) return null;
  return (
    <View style={m.container}>
      <Text style={m.title}>📅 14-Day Habit Matrix</Text>
      <Text style={m.sub}>Habit frozen left · Scroll days →</Text>
      <View style={m.tableWrap}>
        <View style={m.frozenCol}>
          <View style={m.frozenHeader}><Text style={m.frozenHeaderText}>Habit</Text></View>
          {habits.map(h=>(
            <View key={h.id} style={m.frozenCell}>
              <Text style={m.frozenIcon}>{h.icon}</Text>
              <Text style={m.frozenName} numberOfLines={1}>{h.name}</Text>
            </View>
          ))}
        </View>
        <RNScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={m.scrollArea}>
          <View>
            <View style={m.dayHeaderRow}>
              {dayKeys.map(dk=>(
                <View key={dk.key} style={[m.dayHeader,dk.isToday&&m.dayHeaderToday]}>
                  <Text style={[m.dayHeaderLabel,dk.isToday&&{color:COLORS.primary}]}>{dk.label}</Text>
                  <Text style={[m.dayHeaderDate,dk.isToday&&{color:COLORS.primary,fontWeight:'900'}]}>{dk.date}</Text>
                </View>
              ))}
            </View>
            {habits.map(h=>(
              <View key={h.id} style={m.habitRow}>
                {dayKeys.map(dk=>{
                  const done=!!(logs[dk.key]&&logs[dk.key][h.id]);
                  return (
                    <View key={dk.key} style={m.cell}>
                      <View style={[m.cellDot,{backgroundColor:done?(h.color||COLORS.primary):COLORS.bgSection},dk.isToday&&!done&&{borderWidth:1.5,borderColor:COLORS.primary+'50'}]}>
                        {done&&<Text style={m.cellCheck}>✓</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </RNScrollView>
      </View>
    </View>
  );
}

const m = StyleSheet.create({
  container:{marginHorizontal:SPACING.md,marginBottom:SPACING.md,backgroundColor:COLORS.bgCard,borderRadius:RADIUS.xl,padding:SPACING.md,...SHADOW.sm},
  title:{fontSize:15,fontWeight:'800',color:COLORS.text},
  sub:{fontSize:11,color:COLORS.textMuted,marginTop:2,marginBottom:SPACING.sm},
  tableWrap:{flexDirection:'row'},
  frozenCol:{width:FROZEN_W,zIndex:2},
  frozenHeader:{height:44,justifyContent:'flex-end',paddingBottom:6},
  frozenHeaderText:{fontSize:11,fontWeight:'700',color:COLORS.textMuted,textTransform:'uppercase'},
  frozenCell:{height:40,flexDirection:'row',alignItems:'center',gap:6,paddingRight:6,borderBottomWidth:1,borderBottomColor:COLORS.border},
  frozenIcon:{fontSize:16},
  frozenName:{flex:1,fontSize:12,fontWeight:'700',color:COLORS.text},
  scrollArea:{flex:1},
  dayHeaderRow:{flexDirection:'row',height:44,alignItems:'flex-end',paddingBottom:4},
  dayHeader:{width:CELL_W,alignItems:'center'},
  dayHeaderToday:{backgroundColor:COLORS.primaryPale,borderRadius:RADIUS.sm},
  dayHeaderLabel:{fontSize:9,color:COLORS.textMuted,fontWeight:'700'},
  dayHeaderDate:{fontSize:13,color:COLORS.textSub,fontWeight:'700'},
  habitRow:{flexDirection:'row',height:40,alignItems:'center',borderBottomWidth:1,borderBottomColor:COLORS.border},
  cell:{width:CELL_W,alignItems:'center'},
  cellDot:{width:28,height:28,borderRadius:8,alignItems:'center',justifyContent:'center'},
  cellCheck:{fontSize:14,color:'#fff',fontWeight:'900'},
});

export default function StatsScreen() {
  const [habits,setHabits] = useState([]);
  const [logs,setLogs] = useState({});
  const [moods,setMoods] = useState({});

  const load = useCallback(async()=>{
    const [h,l,m]=await Promise.all([Storage.getHabits(),Storage.getLogs(),Storage.getMoods()]);
    setHabits(h);setLogs(l);setMoods(m);
  },[]);

  useFocusEffect(useCallback(()=>{load();},[load]));

  const totalDone = Object.values(logs).reduce((a,day)=>a+Object.values(day).filter(Boolean).length,0);
  const bestStreak = habits.reduce((b,h)=>{const s=getStreakCount(logs,h.id);return s>b?s:b;},0);
  const moodVals = Object.values(moods);
  const avgMood = moodVals.length>0?(moodVals.reduce((a,b)=>a+b,0)/moodVals.length).toFixed(1):'—';

  return (
    <ScrollView style={{flex:1,backgroundColor:COLORS.bg}} contentContainerStyle={{paddingBottom:60}} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[COLORS.primary,COLORS.primaryLight]} style={s.header} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Text style={s.headerTitle}>📊 Statistics</Text>
        <Text style={s.headerSub}>Your habit insights</Text>
      </LinearGradient>
      <View style={s.overviewRow}>
        <View style={[s.overviewCard,{backgroundColor:'#4F8EF7'}]}>
          <Text style={s.overviewVal}>{totalDone}</Text>
          <Text style={s.overviewLbl}>Total Done</Text>
        </View>
        <View style={[s.overviewCard,{backgroundColor:COLORS.gold}]}>
          <Text style={s.overviewVal}>🔥{bestStreak}</Text>
          <Text style={s.overviewLbl}>Best Streak</Text>
        </View>
        <View style={[s.overviewCard,{backgroundColor:COLORS.success}]}>
          <Text style={s.overviewVal}>{avgMood}</Text>
          <Text style={s.overviewLbl}>Avg Mood</Text>
        </View>
      </View>
      <HabitMatrix habits={habits} logs={logs}/>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Habit Breakdown</Text>
        {habits.length===0&&<Text style={s.noData}>No habits yet</Text>}
        {habits.map(h=>{
          const streak=getStreakCount(logs,h.id);
          const r7=getCompletionRate(logs,h.id,7);
          const r30=getCompletionRate(logs,h.id,30);
          return (
            <View key={h.id} style={s.habitStat}>
              <View style={[s.habitStatDot,{backgroundColor:h.color||COLORS.primary}]}>
                <Text style={{fontSize:18}}>{h.icon}</Text>
              </View>
              <View style={{flex:1}}>
                <View style={s.habitStatRow}>
                  <Text style={s.habitStatName}>{h.name}</Text>
                  <Text style={s.habitStatStreak}>🔥 {streak}</Text>
                </View>
                <View style={s.habitStatBar}>
                  <View style={[s.habitStatFill,{width:`${r7}%`,backgroundColor:h.color||COLORS.primary}]}/>
                </View>
                <Text style={s.habitStatSub}>7d: {r7}% · 30d: {r30}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header:{paddingHorizontal:SPACING.md,paddingTop:56,paddingBottom:SPACING.xl,borderBottomLeftRadius:RADIUS.xxl,borderBottomRightRadius:RADIUS.xxl,marginBottom:SPACING.md},
  headerTitle:{fontSize:28,fontWeight:'900',color:'#fff'},
  headerSub:{fontSize:14,color:'rgba(255,255,255,0.75)',marginTop:4},
  overviewRow:{flexDirection:'row',gap:SPACING.sm,paddingHorizontal:SPACING.md,marginBottom:SPACING.md},
  overviewCard:{flex:1,borderRadius:RADIUS.xl,padding:SPACING.md,alignItems:'center',...SHADOW.sm},
  overviewVal:{fontSize:22,fontWeight:'900',color:'#fff'},
  overviewLbl:{fontSize:10,color:'rgba(255,255,255,0.80)',marginTop:4,fontWeight:'700',textAlign:'center'},
  section:{paddingHorizontal:SPACING.md},
  sectionTitle:{fontSize:17,fontWeight:'800',color:COLORS.text,marginBottom:SPACING.sm},
  noData:{fontSize:13,color:COLORS.textMuted,paddingVertical:SPACING.lg,textAlign:'center'},
  habitStat:{flexDirection:'row',alignItems:'center',gap:SPACING.sm,backgroundColor:COLORS.bgCard,borderRadius:RADIUS.xl,padding:SPACING.md,marginBottom:SPACING.sm,...SHADOW.sm},
  habitStatDot:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',opacity:0.9},
  habitStatRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6},
  habitStatName:{fontSize:14,fontWeight:'700',color:COLORS.text,flex:1},
  habitStatStreak:{fontSize:12,color:COLORS.gold,fontWeight:'700'},
  habitStatBar:{height:7,backgroundColor:COLORS.bgSection,borderRadius:RADIUS.full,overflow:'hidden'},
  habitStatFill:{height:'100%',borderRadius:RADIUS.full},
  habitStatSub:{fontSize:11,color:COLORS.textSub,marginTop:4},
});
