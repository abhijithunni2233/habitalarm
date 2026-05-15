import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS, SHADOW, MOTIVATIONAL_QUOTES, getLevelInfo, XP_PER_HABIT } from '../utils/theme';
import { Storage, getTodayKey, getStreakCount } from '../utils/storage';

const MOOD_DATA = [
  {value:1,emoji:'😞',color:COLORS.mood1},{value:2,emoji:'😕',color:COLORS.mood2},
  {value:3,emoji:'😐',color:COLORS.mood3},{value:4,emoji:'🙂',color:COLORS.mood4},
  {value:5,emoji:'😄',color:COLORS.mood5},
];

function QuotesCard() {
  const [idx,setIdx] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(translateX,{toValue:-30,duration:350,useNativeDriver:true}),
        Animated.timing(opacity,{toValue:0,duration:350,useNativeDriver:true}),
      ]).start(() => {
        translateX.setValue(30);
        setIdx(i=>(i+1)%MOTIVATIONAL_QUOTES.length);
        Animated.parallel([
          Animated.spring(translateX,{toValue:0,useNativeDriver:true,tension:120,friction:8}),
          Animated.timing(opacity,{toValue:1,duration:300,useNativeDriver:true}),
        ]).start();
      });
    },4500);
    return () => clearInterval(interval);
  },[]);
  const q = MOTIVATIONAL_QUOTES[idx];
  return (
    <LinearGradient colors={[COLORS.primary,COLORS.primaryLight]} style={s.quoteCard} start={{x:0,y:0}} end={{x:1,y:1}}>
      <Text style={s.quoteDecor}>"</Text>
      <Animated.View style={{flex:1,transform:[{translateX}],opacity}}>
        <Text style={s.quoteText}>{q.text}</Text>
        <Text style={s.quoteAuthor}>— {q.author}</Text>
      </Animated.View>
      <View style={s.quoteDots}>
        {MOTIVATIONAL_QUOTES.map((_,i)=><View key={i} style={[s.dot,i===idx&&s.dotActive]}/>)}
      </View>
    </LinearGradient>
  );
}

function LevelStrip({xp}) {
  const info = getLevelInfo(xp);
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.timing(barAnim,{toValue:info.progress,duration:900,useNativeDriver:false}).start();
  },[xp]);
  return (
    <View style={s.levelStrip}>
      <View style={s.levelLeft}>
        <View style={s.levelBadge}><Text style={s.levelNum}>{info.current.level}</Text></View>
        <View>
          <Text style={s.levelTitle}>{info.current.title}</Text>
          <Text style={s.levelXP}>{xp} XP</Text>
        </View>
      </View>
      <View style={s.levelRight}>
        <View style={s.levelBarBg}>
          <Animated.View style={[s.levelBarFill,{width:barAnim.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]}/>
        </View>
        {info.next&&<Text style={s.levelNext}>{info.next.xp-xp} XP to {info.next.title}</Text>}
      </View>
    </View>
  );
}

function HabitCard({item,isCompleted,isRestDay,streak,onToggle,onPress}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handleCheck = () => {
    if(isRestDay) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(scaleAnim,{toValue:0.94,useNativeDriver:true}),
      Animated.spring(scaleAnim,{toValue:1,useNativeDriver:true,tension:120}),
    ]).start();
    onToggle(item.id);
  };
  const bg = item.color||COLORS.habitPalette[0];
  const fmtAlarm = (a) => {
    const h=a.hour,m=String(a.minute).padStart(2,'0'),p=h>=12?'PM':'AM',dh=h===0?12:h>12?h-12:h;
    return `${dh}:${m} ${p}`;
  };
  return (
    <Animated.View style={[s.habitCard,{backgroundColor:bg},{transform:[{scale:scaleAnim}]}]}>
      <TouchableOpacity style={s.habitIconBg} onPress={()=>onPress(item)}>
        <Text style={s.habitIcon}>{item.icon}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.habitBody} onPress={()=>onPress(item)} activeOpacity={0.8}>
        <Text style={s.habitName}>{item.name}</Text>
        <View style={s.habitMeta}>
          {streak>0&&<Text style={s.habitStreak}>🔥 {streak} day{streak>1?'s':''}</Text>}
          {item.alarms?.length>0&&<Text style={s.habitAlarm}>⏰ {fmtAlarm(item.alarms[0])}</Text>}
          {isRestDay&&<Text style={s.habitRest}>😴 Rest day</Text>}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleCheck} style={s.checkBtn} disabled={isRestDay}>
        <View style={[s.checkCircle,isCompleted&&s.checkCircleDone]}>
          {isCompleted&&<Text style={s.checkMark}>✓</Text>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen({navigation}) {
  const [habits,setHabits] = useState([]);
  const [logs,setLogs] = useState({});
  const [moods,setMoods] = useState({});
  const [user,setUser] = useState({xp:0,name:'Champion'});
  const today = getTodayKey();
  const todayDayIdx = new Date().getDay();

  const load = useCallback(async()=>{
    const [h,l,m,u] = await Promise.all([Storage.getHabits(),Storage.getLogs(),Storage.getMoods(),Storage.getUser()]);
    setHabits(h);setLogs(l);setMoods(m);setUser(u);
  },[]);

  useFocusEffect(useCallback(()=>{load();},[load]));

  const handleToggle = async(id)=>{
    const newLogs={...logs};
    if(!newLogs[today]) newLogs[today]={};
    const was=newLogs[today][id];
    newLogs[today][id]=!was;
    const xpDelta=was?-XP_PER_HABIT:XP_PER_HABIT;
    const newUser={...user,xp:Math.max(0,user.xp+xpDelta)};
    setLogs(newLogs);setUser(newUser);
    await Storage.saveLogs(newLogs);await Storage.saveUser(newUser);
  };

  const handleMood = async(v)=>{
    Haptics.selectionAsync();
    const nm={...moods,[today]:v};
    setMoods(nm);await Storage.saveMoods(nm);
  };

  const activeHabits = habits.filter(h=>!h.restDays?.includes(todayDayIdx));
  const completedCount = activeHabits.filter(h=>logs[today]?.[h.id]).length;
  const todayMood = moods[today]||null;
  const dateStr = new Date().toLocaleDateString('en-IN',{weekday:'long',month:'long',day:'numeric'});
  const hour = new Date().getHours();
  const greeting = hour<12?'Morning,':hour<17?'Afternoon,':'Evening,';

  return (
    <ScrollView style={{flex:1,backgroundColor:COLORS.bg}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:100}}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Good <Text style={{color:COLORS.primary}}>{greeting}</Text></Text>
          <Text style={s.greeting}>{user.name} 👋</Text>
          <Text style={s.dateText}>{dateStr}</Text>
        </View>
        <TouchableOpacity style={s.addFab} onPress={()=>navigation.navigate('AddHabit',{onSave:load})}>
          <LinearGradient colors={[COLORS.primary,COLORS.primaryLight]} style={s.addFabGrad}>
            <Text style={s.addFabText}>＋</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <View style={{paddingHorizontal:SPACING.md,marginBottom:SPACING.md}}><QuotesCard/></View>
      <View style={{paddingHorizontal:SPACING.md,marginBottom:SPACING.sm}}><LevelStrip xp={user.xp}/></View>
      <View style={s.progressCard}>
        <View style={s.ringWrap}>
          <View style={s.ring}>
            <View style={[s.ringArc,{borderColor:completedCount===activeHabits.length&&activeHabits.length>0?COLORS.success:COLORS.primary}]}/>
            <View style={s.ringInner}>
              <Text style={s.ringPct}>{activeHabits.length>0?Math.round((completedCount/activeHabits.length)*100):0}%</Text>
              <Text style={s.ringLabel}>done</Text>
            </View>
          </View>
        </View>
        <View style={s.progressInfo}>
          <Text style={s.progressTitle}>Today's Progress</Text>
          <Text style={s.progressSub}>{completedCount} of {activeHabits.length} habits done</Text>
          {completedCount===activeHabits.length&&activeHabits.length>0&&(
            <View style={s.allDone}><Text style={s.allDoneText}>🎉 All done!</Text></View>
          )}
        </View>
      </View>
      <View style={s.sectionWrap}>
        <Text style={s.sectionTitle}>How are you feeling?</Text>
        <View style={s.moodRow}>
          {MOOD_DATA.map(m=>(
            <TouchableOpacity key={m.value} onPress={()=>handleMood(m.value)}
              style={[s.moodBtn,todayMood===m.value&&{backgroundColor:m.color+'22',borderColor:m.color}]}>
              <Text style={s.moodEmoji}>{m.emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={s.sectionWrap}>
        <Text style={s.sectionTitle}>Today's Habits</Text>
      </View>
      {habits.length===0&&(
        <TouchableOpacity style={s.empty} onPress={()=>navigation.navigate('AddHabit',{onSave:load})}>
          <Text style={{fontSize:52,marginBottom:SPACING.sm}}>🌱</Text>
          <Text style={s.emptyTitle}>No habits yet!</Text>
          <Text style={s.emptySub}>Tap here to add your first habit</Text>
        </TouchableOpacity>
      )}
      {habits.map(item=>(
        <View key={item.id} style={{paddingHorizontal:SPACING.md}}>
          <HabitCard
            item={item}
            isCompleted={!!logs[today]?.[item.id]}
            isRestDay={!!item.restDays?.includes(todayDayIdx)}
            streak={getStreakCount(logs,item.id)}
            onToggle={handleToggle}
            onPress={(h)=>navigation.navigate('HabitDetail',{habitId:h.id})}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',paddingHorizontal:SPACING.md,paddingTop:56,paddingBottom:SPACING.md},
  greeting:{fontSize:22,fontWeight:'900',color:COLORS.text},
  dateText:{fontSize:13,color:COLORS.textSub,marginTop:4},
  addFab:{borderRadius:RADIUS.full,overflow:'hidden',...SHADOW.md},
  addFabGrad:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  addFabText:{color:'#fff',fontSize:26,fontWeight:'700',marginTop:-2},
  quoteCard:{borderRadius:RADIUS.xl,padding:SPACING.md,minHeight:110,justifyContent:'space-between',...SHADOW.md},
  quoteDecor:{fontSize:40,color:'rgba(255,255,255,0.25)',position:'absolute',top:4,left:12},
  quoteText:{fontSize:14,color:'#fff',fontWeight:'600',lineHeight:21,paddingTop:8},
  quoteAuthor:{fontSize:12,color:'rgba(255,255,255,0.70)',marginTop:6,fontWeight:'700'},
  quoteDots:{flexDirection:'row',gap:4,marginTop:8},
  dot:{width:5,height:5,borderRadius:3,backgroundColor:'rgba(255,255,255,0.35)'},
  dotActive:{width:14,backgroundColor:'#fff'},
  levelStrip:{backgroundColor:COLORS.bgCard,borderRadius:RADIUS.lg,padding:SPACING.md,flexDirection:'row',alignItems:'center',gap:SPACING.md,...SHADOW.sm},
  levelLeft:{flexDirection:'row',alignItems:'center',gap:SPACING.sm},
  levelBadge:{width:40,height:40,borderRadius:20,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center'},
  levelNum:{color:'#fff',fontSize:18,fontWeight:'900'},
  levelTitle:{fontSize:13,fontWeight:'800',color:COLORS.text},
  levelXP:{fontSize:11,color:COLORS.textSub,marginTop:1},
  levelRight:{flex:1},
  levelBarBg:{height:8,backgroundColor:COLORS.bgSection,borderRadius:RADIUS.full,overflow:'hidden',marginBottom:4},
  levelBarFill:{height:'100%',backgroundColor:COLORS.primary,borderRadius:RADIUS.full},
  levelNext:{fontSize:10,color:COLORS.textMuted},
  progressCard:{marginHorizontal:SPACING.md,marginBottom:SPACING.md,backgroundColor:COLORS.bgCard,borderRadius:RADIUS.xl,padding:SPACING.md,flexDirection:'row',alignItems:'center',gap:SPACING.md,...SHADOW.sm},
  ringWrap:{width:80,height:80,alignItems:'center',justifyContent:'center'},
  ring:{width:80,height:80,borderRadius:40,borderWidth:7,borderColor:COLORS.border,alignItems:'center',justifyContent:'center',position:'relative'},
  ringArc:{position:'absolute',width:80,height:80,borderRadius:40,borderWidth:7,borderRightColor:'transparent',borderBottomColor:'transparent'},
  ringInner:{alignItems:'center'},
  ringPct:{fontSize:18,fontWeight:'900',color:COLORS.primary},
  ringLabel:{fontSize:9,color:COLORS.textSub,fontWeight:'600'},
  progressInfo:{flex:1},
  progressTitle:{fontSize:16,fontWeight:'800',color:COLORS.text},
  progressSub:{fontSize:13,color:COLORS.textSub,marginTop:2},
  allDone:{backgroundColor:COLORS.successPale,borderRadius:RADIUS.full,paddingHorizontal:10,paddingVertical:4,marginTop:6,alignSelf:'flex-start'},
  allDoneText:{fontSize:12,color:COLORS.success,fontWeight:'700'},
  sectionWrap:{paddingHorizontal:SPACING.md,marginBottom:SPACING.md},
  sectionTitle:{fontSize:16,fontWeight:'800',color:COLORS.text,marginBottom:SPACING.sm},
  moodRow:{flexDirection:'row',gap:SPACING.sm},
  moodBtn:{flex:1,alignItems:'center',paddingVertical:10,backgroundColor:COLORS.bgCard,borderRadius:RADIUS.lg,borderWidth:1.5,borderColor:COLORS.border,...SHADOW.sm},
  moodEmoji:{fontSize:24},
  habitCard:{flexDirection:'row',alignItems:'center',borderRadius:RADIUS.xl,marginBottom:SPACING.sm,padding:SPACING.md,...SHADOW.card},
  habitIconBg:{width:46,height:46,borderRadius:14,backgroundColor:'rgba(255,255,255,0.25)',alignItems:'center',justifyContent:'center',marginRight:SPACING.sm},
  habitIcon:{fontSize:24},
  habitBody:{flex:1},
  habitName:{fontSize:15,fontWeight:'800',color:'#fff'},
  habitMeta:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:4},
  habitStreak:{fontSize:11,color:'rgba(255,255,255,0.85)',fontWeight:'700'},
  habitAlarm:{fontSize:11,color:'rgba(255,255,255,0.80)',fontWeight:'600'},
  habitRest:{fontSize:11,color:'rgba(255,255,255,0.70)'},
  checkBtn:{marginLeft:SPACING.sm},
  checkCircle:{width:32,height:32,borderRadius:16,borderWidth:2.5,borderColor:'rgba(255,255,255,0.6)',alignItems:'center',justifyContent:'center'},
  checkCircleDone:{backgroundColor:'rgba(255,255,255,0.9)',borderColor:'transparent'},
  checkMark:{fontSize:16,fontWeight:'900',color:COLORS.primary},
  empty:{alignItems:'center',paddingVertical:60},
  emptyTitle:{fontSize:20,fontWeight:'800',color:COLORS.text,marginBottom:4},
  emptySub:{fontSize:14,color:COLORS.textSub},
});
