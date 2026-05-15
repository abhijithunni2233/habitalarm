import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, SHADOW } from '../utils/theme';
import { Storage, getStreakCount, getCompletionRate } from '../utils/storage';
import { cancelAllHabitAlarms } from '../utils/notifications';

const DAY_S = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtAlarm(a) {
  const h=a.hour,m=String(a.minute).padStart(2,'0'),p=h>=12?'PM':'AM',dh=h===0?12:h>12?h-12:h;
  return `${dh}:${m} ${p}`;
}

export default function HabitDetailScreen({route,navigation}) {
  const {habitId} = route.params;
  const [habit,setHabit] = useState(null);
  const [logs,setLogs] = useState({});
  const [days,setDays] = useState([]);

  const load = useCallback(async()=>{
    const [habits,l]=await Promise.all([Storage.getHabits(),Storage.getLogs()]);
    const h=habits.find(x=>x.id===habitId);setHabit(h);setLogs(l);
    const arr=[];
    for(let i=34;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      arr.push({key,date:d.getDate(),done:!!(l[key]&&l[key][habitId]),isToday:i===0});
    }
    setDays(arr);
  },[habitId]);

  useFocusEffect(useCallback(()=>{load();},[load]));

  const del = () => Alert.alert('Delete Habit','Remove this habit and all logs?',[
    {text:'Cancel',style:'cancel'},
    {text:'Delete',style:'destructive',onPress:async()=>{
      await cancelAllHabitAlarms(habitId);
      const habits=await Storage.getHabits();
      await Storage.saveHabits(habits.filter(h=>h.id!==habitId));
      navigation.goBack();
    }},
  ]);

  if(!habit) return null;

  const streak=getStreakCount(logs,habitId);
  const r7=getCompletionRate(logs,habitId,7);
  const r30=getCompletionRate(logs,habitId,30);
  const color=habit.color||COLORS.primary;

  return (
    <ScrollView style={{flex:1,backgroundColor:COLORS.bg}} contentContainerStyle={{paddingBottom:60}} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[color,color+'BB']} style={s.hero} start={{x:0,y:0}} end={{x:1,y:1}}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.heroIcon}>{habit.icon}</Text>
        <Text style={s.heroName}>{habit.name}</Text>
        <View style={s.streakBig}>
          <Text style={s.streakBigText}>🔥 {streak} day{streak!==1?'s':''} streak</Text>
        </View>
      </LinearGradient>

      <View style={s.statsRow}>
        {[{val:`${r7}%`,lbl:'7-day rate'},{val:`${r30}%`,lbl:'30-day rate'},{val:streak,lbl:'Streak'}].map((x,i)=>(
          <View key={i} style={[s.statCard,{borderTopColor:color,borderTopWidth:4}]}>
            <Text style={[s.statVal,{color}]}>{x.val}</Text>
            <Text style={s.statLbl}>{x.lbl}</Text>
          </View>
        ))}
      </View>

      {habit.alarms?.length>0&&(
        <View style={s.sec}>
          <Text style={s.secTitle}>⏰ Alarms</Text>
          {habit.alarms.map((a,i)=>(
            <View key={i} style={s.alarmRow}>
              <Text style={[s.alarmTime,{color}]}>{fmtAlarm(a)}</Text>
              <Text style={s.alarmRpt}>Repeats daily</Text>
            </View>
          ))}
        </View>
      )}

      {habit.restDays?.length>0&&(
        <View style={s.sec}>
          <Text style={s.secTitle}>😴 Rest Days</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:SPACING.xs}}>
            {habit.restDays.map(d=>(
              <View key={d} style={s.restChip}>
                <Text style={s.restChipText}>{DAY_S[d]}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={s.sec}>
        <Text style={s.secTitle}>📅 Last 35 Days</Text>
        <View style={s.cal}>
          {days.map((d,i)=>(
            <View key={i} style={[s.calCell,d.done&&{backgroundColor:color},!d.done&&{backgroundColor:COLORS.bgSection},d.isToday&&{borderWidth:2,borderColor:color}]}>
              <Text style={[s.calDate,d.done&&{color:'#fff'}]}>{d.date}</Text>
              {d.done&&<Text style={s.calCheck}>✓</Text>}
            </View>
          ))}
        </View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity onPress={()=>navigation.navigate('AddHabit',{habit,onSave:load})}>
          <LinearGradient colors={[color,color+'CC']} style={s.editBtn}>
            <Text style={s.editBtnText}>✏️ Edit Habit</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={del} style={s.delBtn}>
          <Text style={s.delBtnText}>🗑️ Delete Habit</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero:{alignItems:'center',paddingTop:56,paddingBottom:SPACING.xl,borderBottomLeftRadius:RADIUS.xxl,borderBottomRightRadius:RADIUS.xxl,marginBottom:SPACING.md},
  backBtn:{alignSelf:'flex-start',marginLeft:SPACING.md,marginBottom:SPACING.md},
  backText:{color:'rgba(255,255,255,0.9)',fontWeight:'700',fontSize:15},
  heroIcon:{fontSize:60,marginBottom:SPACING.sm},
  heroName:{fontSize:26,fontWeight:'900',color:'#fff',textAlign:'center',marginBottom:SPACING.sm},
  streakBig:{backgroundColor:'rgba(255,255,255,0.22)',borderRadius:RADIUS.full,paddingHorizontal:SPACING.md,paddingVertical:SPACING.xs},
  streakBigText:{color:'#fff',fontWeight:'800',fontSize:15},
  statsRow:{flexDirection:'row',gap:SPACING.sm,paddingHorizontal:SPACING.md,marginBottom:SPACING.md},
  statCard:{flex:1,backgroundColor:COLORS.bgCard,borderRadius:RADIUS.lg,padding:SPACING.md,alignItems:'center',...SHADOW.sm},
  statVal:{fontSize:20,fontWeight:'900'},
  statLbl:{fontSize:10,color:COLORS.textSub,marginTop:4,fontWeight:'600',textAlign:'center'},
  sec:{paddingHorizontal:SPACING.md,marginBottom:SPACING.md},
  secTitle:{fontSize:15,fontWeight:'800',color:COLORS.text,marginBottom:SPACING.sm},
  alarmRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:COLORS.bgCard,borderRadius:RADIUS.md,padding:SPACING.md,marginBottom:SPACING.xs,...SHADOW.sm},
  alarmTime:{fontSize:22,fontWeight:'900'},
  alarmRpt:{fontSize:12,color:COLORS.textMuted},
  restChip:{backgroundColor:COLORS.bgSection,borderRadius:RADIUS.full,paddingHorizontal:SPACING.sm,paddingVertical:4},
  restChipText:{fontSize:13,color:COLORS.textSub,fontWeight:'700'},
  cal:{flexDirection:'row',flexWrap:'wrap',gap:5},
  calCell:{width:38,height:38,borderRadius:RADIUS.sm,alignItems:'center',justifyContent:'center'},
  calDate:{fontSize:10,fontWeight:'700',color:COLORS.textSub},
  calCheck:{fontSize:10,color:'#fff',fontWeight:'900'},
  actions:{paddingHorizontal:SPACING.md,gap:SPACING.sm},
  editBtn:{borderRadius:RADIUS.md,padding:SPACING.md,alignItems:'center',...SHADOW.sm},
  editBtnText:{color:'#fff',fontWeight:'800',fontSize:15},
  delBtn:{backgroundColor:COLORS.dangerPale,borderRadius:RADIUS.md,padding:SPACING.md,alignItems:'center',borderWidth:1.5,borderColor:COLORS.danger+'40'},
  delBtnText:{color:COLORS.danger,fontWeight:'700',fontSize:14},
});
