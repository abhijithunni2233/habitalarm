import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Animated, Dimensions, Platform, Modal, PanResponder, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
const { width } = Dimensions.get('window');
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert:true,shouldPlaySound:true,shouldSetBadge:false,priority:Notifications.AndroidNotificationPriority.MAX }) });
async function setupNotifications() {
  try {
    if(!Device.isDevice) return;
    if(Platform.OS==='android') await Notifications.setNotificationChannelAsync('habit-alarms',{name:'Habit Alarms',importance:Notifications.AndroidImportance.MAX,vibrationPattern:[0,250,250,250],lightColor:'#6C3CE1'});
    const{status}=await Notifications.requestPermissionsAsync(); return status==='granted';
  } catch(e){return false;}
}
async function scheduleAlarm(habit,alarm) {
  try {
    const id=`habit_${habit.id}_${alarm.hour}_${alarm.minute}`;
    await Notifications.cancelScheduledNotificationAsync(id).catch(()=>{});
    await Notifications.scheduleNotificationAsync({identifier:id,content:{title:`⏰ ${habit.icon} ${habit.name}`,body:`Time for your habit! Keep the streak going 🔥`,sound:true,data:{habitId:habit.id},color:habit.color||'#6C3CE1'},trigger:{channelId:'habit-alarms',hour:alarm.hour,minute:alarm.minute,repeats:true}});
  } catch(e){}
}
async function cancelHabitAlarms(habitId) {
  try{const all=await Notifications.getAllScheduledNotificationsAsync();for(const n of all){if(n.identifier.startsWith(`habit_${habitId}`))await Notifications.cancelScheduledNotificationAsync(n.identifier);}}catch(e){}
}
async function playTick(){try{await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);}catch(e){}}
async function playApplause(){try{await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);}catch(e){}}
const C={bg:'#F0EEFF',card:'#FFFFFF',section:'#EAE6FF',border:'#E2DCF8',primary:'#6C3CE1',primaryLight:'#8B5CF6',primaryPale:'#EDE9FF',text:'#1A1040',textSub:'#6B6490',textMuted:'#B0A8CC',success:'#06D6A0',successPale:'#E6FBF5',danger:'#FF6B6B',dangerPale:'#FFF0F0',gold:'#F4A021',goldPale:'#FFF7E6',mood1:'#FF6B6B',mood2:'#FF8C42',mood3:'#FFD93D',mood4:'#8BCE6C',mood5:'#06D6A0',palette:['#4F8EF7','#FF8C42','#9B5DE5','#FF6B9D','#06D6A0','#F4A021','#4CC9F0','#F72585','#43AA8B','#E76F51']};
const ICONS=['💪','🏃','📚','💧','🧘','🎯','💤','🥗','🎵','✍️','🧠','❤️','🌅','🚴','🏋️','🎨','📱','💊','🌿','☕','🦷','🧹','💰','🙏'];
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_SHORT=['Su','Mo','Tu','We','Th','Fr','Sa'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const REMARK_EMOJIS=['🔥','💪','😊','⭐','🎯','✨','🙏','😤','💧','🌟','😅','❤️'];
const QUOTES=[
  {text:"Small daily improvements lead to stunning results.",author:"Robin Sharma"},
  {text:"We are what we repeatedly do. Excellence is a habit.",author:"Aristotle"},
  {text:"Motivation gets you started. Habit keeps you going.",author:"Jim Ryun"},
  {text:"The secret of your future is hidden in your daily routine.",author:"Mike Murdock"},
  {text:"Habits are the compound interest of self-improvement.",author:"James Clear"},
  {text:"Do something today that your future self will thank you for.",author:"Sean Patrick Flanery"},
  {text:"You don't rise to your goals, you fall to your systems.",author:"James Clear"},
  {text:"The chains of habit are too light to be felt until too heavy to be broken.",author:"Warren Buffett"},
  {text:"Successful people are simply those with successful habits.",author:"Brian Tracy"},
  {text:"The mind is everything. What you think you become.",author:"Buddha"},
  {text:"Take care of your body. It's the only place you have to live.",author:"Jim Rohn"},
  {text:"Believe you can and you're halfway there.",author:"Theodore Roosevelt"},
  {text:"It always seems impossible until it's done.",author:"Nelson Mandela"},
  {text:"The secret of getting ahead is getting started.",author:"Mark Twain"},
  {text:"Energy and persistence conquer all things.",author:"Benjamin Franklin"},
  {text:"🧠 Fact: It takes 66 days on average to form a new habit, not 21.",author:"UCL Research"},
  {text:"🧠 Fact: Exercise boosts brain function and memory by up to 20%.",author:"Neuroscience"},
  {text:"🧠 Fact: People who write goals are 42% more likely to achieve them.",author:"Dr. Gail Matthews"},
  {text:"🧠 Fact: Just 10 minutes of meditation reduces anxiety and improves focus.",author:"Harvard Study"},
  {text:"🧠 Fact: Gratitude journaling 5 min/day increases happiness by 25%.",author:"Psychology Research"},
  {text:"🧠 Fact: Walking 30 min a day reduces heart disease risk by 35%.",author:"WHO"},
  {text:"🧠 Fact: Drinking water first thing boosts metabolism by 24%.",author:"Health Research"},
  {text:"🧠 Fact: Sleep deprivation affects performance like being drunk.",author:"Sleep Foundation"},
];
const LEVELS=[{level:1,xp:0,title:'Beginner'},{level:2,xp:100,title:'Apprentice'},{level:3,xp:250,title:'Practitioner'},{level:4,xp:500,title:'Journeyman'},{level:5,xp:900,title:'Expert'},{level:6,xp:1400,title:'Master'},{level:7,xp:2000,title:'Champion'},{level:8,xp:3000,title:'Legend'},{level:9,xp:5000,title:'Mythic'},{level:10,xp:8000,title:'Transcendent'}];
function getLevelInfo(xp){let current=LEVELS[0],next=LEVELS[1];for(let i=LEVELS.length-1;i>=0;i--){if(xp>=LEVELS[i].xp){current=LEVELS[i];next=LEVELS[i+1]||null;break;}}return{current,next,progress:next?(xp-current.xp)/(next.xp-current.xp):1};}
function getTodayKey(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function getDateStr(dateKey){if(!dateKey)return'';const[y,m,d]=dateKey.split('-');const date=new Date(parseInt(y),parseInt(m)-1,parseInt(d));return`${DAYS[date.getDay()]}, ${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;}
function getStreak(logs,id){let streak=0;const today=new Date();for(let i=0;i<365;i++){const d=new Date(today);d.setDate(today.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(logs[key]&&logs[key][id])streak++;else if(i>0)break;}return streak;}
function getRate(logs,id,days=7){let count=0;const today=new Date();for(let i=0;i<days;i++){const d=new Date(today);d.setDate(today.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(logs[key]&&logs[key][id])count++;}return Math.round((count/days)*100);}
function fmtAlarm(a){const h=a.hour,m=String(a.minute).padStart(2,'0'),p=h>=12?'PM':'AM',dh=h===0?12:h>12?h-12:h;return`${dh}:${m} ${p}`;}
const Store={async get(key,def){try{const r=await AsyncStorage.getItem(key);return r?JSON.parse(r):def;}catch{return def;}},async set(key,val){try{await AsyncStorage.setItem(key,JSON.stringify(val));}catch{}}};
function generateInsights(habits,logs,moods){
  if(habits.length===0)return["Start adding habits to get personalized insights!"];
  const insights=[];
  const streaks=habits.map(h=>({name:h.name,streak:getStreak(logs,h.id),rate7:getRate(logs,h.id,7)}));
  const best=streaks.reduce((a,b)=>b.streak>a.streak?b:a,streaks[0]);
  const worst=streaks.reduce((a,b)=>b.rate7<a.rate7?b:a,streaks[0]);
  if(best.streak>=7)insights.push(`🏆 You're a champion at "${best.name}"! ${best.streak}-day streak shows real dedication.`);
  else if(best.streak>=3)insights.push(`💪 "${best.name}" is your strongest habit with a ${best.streak}-day streak. Keep it up!`);
  else insights.push(`🌱 You're just getting started! Try to build a 7-day streak on any habit first.`);
  const avgRate=Math.round(streaks.reduce((a,b)=>a+b.rate7,0)/streaks.length);
  if(avgRate>=80)insights.push(`⭐ Incredible! Your 7-day completion rate is ${avgRate}%. You're in the top tier of habit builders.`);
  else if(avgRate>=50)insights.push(`📈 Your 7-day completion rate is ${avgRate}%. You're consistent — push for 80%!`);
  else insights.push(`🎯 Your 7-day completion rate is ${avgRate}%. Focus on just 1-2 habits to build momentum.`);
  if(worst.rate7<50&&habits.length>1)insights.push(`⚠️ "${worst.name}" needs attention — only ${worst.rate7}% done this week.`);
  const moodVals=Object.values(moods);
  if(moodVals.length>=3){const avg=(moodVals.reduce((a,b)=>a+b,0)/moodVals.length).toFixed(1);if(avg>=4)insights.push(`😄 Your average mood is ${avg}/5 — you're thriving!`);else if(avg>=3)insights.push(`😐 Your average mood is ${avg}/5. More habits usually improve mood.`);else insights.push(`😔 Your mood has been low (${avg}/5). Try adding a self-care or exercise habit.`);}
  const dayCounts=[0,0,0,0,0,0,0];
  Object.entries(logs).forEach(([key,dayLogs])=>{const d=new Date(key);dayCounts[d.getDay()]+=Object.values(dayLogs).filter(Boolean).length;});
  const bestDayIdx=dayCounts.indexOf(Math.max(...dayCounts));
  if(Math.max(...dayCounts)>0)insights.push(`📅 You perform best on ${DAYS[bestDayIdx]}s. Schedule important habits then.`);
  const totalDone=Object.values(logs).reduce((a,d)=>a+Object.values(d).filter(Boolean).length,0);
  if(totalDone>=100)insights.push(`🎖️ You've completed ${totalDone} habits total. That's phenomenal discipline!`);
  else insights.push(`🚀 ${totalDone} habits completed so far. Every checkmark counts!`);
  if(avgRate>=70&&best.streak>=7)insights.push(`🧠 Personality: You're a "System Builder" — you thrive on routines.`);
  else if(avgRate>=50)insights.push(`🧠 Personality: You're a "Steady Climber" — progress even when motivation dips.`);
  else insights.push(`🧠 Personality: You're an "Aspiring Achiever" — you have the vision, now build the system.`);
  return insights;
}
function SplashScreen({onDone}){
  const wave1=useRef(new Animated.Value(0)).current,wave2=useRef(new Animated.Value(0)).current,wave3=useRef(new Animated.Value(0)).current;
  const logoScale=useRef(new Animated.Value(0)).current,logoOpacity=useRef(new Animated.Value(0)).current,textOpacity=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.sequence([
      Animated.parallel([Animated.spring(logoScale,{toValue:1,tension:50,friction:5,useNativeDriver:true}),Animated.timing(logoOpacity,{toValue:1,duration:600,useNativeDriver:true})]),
      Animated.timing(textOpacity,{toValue:1,duration:400,useNativeDriver:true}),
      Animated.parallel([Animated.timing(wave1,{toValue:1,duration:600,useNativeDriver:true}),Animated.timing(wave2,{toValue:1,duration:800,delay:100,useNativeDriver:true}),Animated.timing(wave3,{toValue:1,duration:1000,delay:200,useNativeDriver:true})]),
    ]).start(()=>setTimeout(onDone,400));
  },[]);
  return(
    <View style={{flex:1,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      {[wave1,wave2,wave3].map((w,i)=>(<Animated.View key={i} style={{position:'absolute',width:width*3,height:width*3,borderRadius:width*1.5,backgroundColor:`rgba(255,255,255,${0.05-i*0.01})`,transform:[{scale:w.interpolate({inputRange:[0,1],outputRange:[0,2.5]})}],opacity:w.interpolate({inputRange:[0,0.5,1],outputRange:[1,0.5,0]})}}/>))}
      <Animated.View style={{transform:[{scale:logoScale}],opacity:logoOpacity,alignItems:'center'}}>
        <Text style={{fontSize:80,marginBottom:16}}>⚡</Text>
        <Animated.Text style={{fontSize:32,fontWeight:'900',color:'#fff',opacity:textOpacity}}>HabitAlarm</Animated.Text>
        <Animated.Text style={{fontSize:14,color:'rgba(255,255,255,0.75)',marginTop:8,opacity:textOpacity}}>Build habits. Change your life.</Animated.Text>
      </Animated.View>
    </View>
  );
}
function OnboardingScreen({onDone}){
  const [page,setPage]=useState(0);
  const slideAnim=useRef(new Animated.Value(0)).current;
  const slides=[
    {emoji:'🏆',title:'Build Amazing Habits',desc:'Track your daily habits, build streaks and level up your life one day at a time.',color:'#6C3CE1'},
    {emoji:'⏰',title:'Never Miss a Day',desc:'Set alarms for each habit. Your phone reminds you at the exact time every day.',color:'#FF6B9D'},
    {emoji:'📊',title:'See Your Progress',desc:'Track streaks, view 30-day history, earn XP and unlock badges as you grow.',color:'#06D6A0'},
  ];
  const next=()=>{
    if(page===slides.length-1){onDone();return;}
    Animated.timing(slideAnim,{toValue:-width,duration:300,useNativeDriver:true}).start(()=>{slideAnim.setValue(width);setPage(p=>p+1);Animated.spring(slideAnim,{toValue:0,useNativeDriver:true,tension:100,friction:8}).start();});
  };
  const s=slides[page];
  return(
    <View style={{flex:1,backgroundColor:s.color}}>
      <StatusBar style="light"/>
      <TouchableOpacity onPress={onDone} style={{position:'absolute',top:56,right:20,zIndex:10,backgroundColor:'rgba(255,255,255,0.2)',borderRadius:99,paddingHorizontal:14,paddingVertical:6}}><Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>Skip</Text></TouchableOpacity>
      <Animated.View style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:32,transform:[{translateX:slideAnim}]}}>
        <Text style={{fontSize:100,marginBottom:32}}>{s.emoji}</Text>
        <Text style={{fontSize:28,fontWeight:'900',color:'#fff',textAlign:'center',marginBottom:16}}>{s.title}</Text>
        <Text style={{fontSize:16,color:'rgba(255,255,255,0.85)',textAlign:'center',lineHeight:24}}>{s.desc}</Text>
      </Animated.View>
      <View style={{flexDirection:'row',justifyContent:'center',gap:8,marginBottom:32}}>{slides.map((_,i)=><View key={i} style={{width:i===page?24:8,height:8,borderRadius:4,backgroundColor:i===page?'#fff':'rgba(255,255,255,0.4)'}}/>)}</View>
      <TouchableOpacity onPress={next} style={{marginHorizontal:32,marginBottom:48,backgroundColor:'rgba(255,255,255,0.25)',borderRadius:16,padding:18,alignItems:'center',borderWidth:1.5,borderColor:'rgba(255,255,255,0.5)'}}>
        <Text style={{color:'#fff',fontWeight:'900',fontSize:16}}>{page===slides.length-1?"Let's Start! 🚀":'Next →'}</Text>
      </TouchableOpacity>
    </View>
  );
}
function RemarkModal({visible,habitName,habitColor,existingRemark,onSave,onClose}){
  const [emoji,setEmoji]=useState(existingRemark?.emoji||'🔥');
  const [note,setNote]=useState(existingRemark?.note||'');
  useEffect(()=>{if(visible){setEmoji(existingRemark?.emoji||'🔥');setNote(existingRemark?.note||'');}},[visible]);
  const save=()=>{onSave({emoji,note:note.trim()});onClose();};
  const color=habitColor||C.primary;
  return(
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={rm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={rm.sheet}>
          <LinearGradient colors={[color,C.primaryLight]} style={rm.sheetHeader}>
            <Text style={rm.sheetTitle}>✅ Great job!</Text>
            <Text style={rm.sheetSub}>Add a remark for <Text style={{fontWeight:'900'}}>{habitName}</Text></Text>
          </LinearGradient>
          <View style={rm.body}>
            <Text style={rm.label}>How did it feel?</Text>
            <View style={rm.emojiRow}>{REMARK_EMOJIS.map(e=>(<TouchableOpacity key={e} onPress={()=>{Haptics.selectionAsync();setEmoji(e);}} style={[rm.emojiBtn,emoji===e&&{backgroundColor:color+'22',borderColor:color,borderWidth:2}]}><Text style={{fontSize:26}}>{e}</Text></TouchableOpacity>))}</View>
            <Text style={[rm.label,{marginTop:16}]}>Note (optional)</Text>
            <TextInput style={rm.noteInput} value={note} onChangeText={setNote} placeholder="e.g. Felt great today!" placeholderTextColor={C.textMuted} maxLength={100} multiline/>
            <View style={rm.btnRow}>
              <TouchableOpacity onPress={onClose} style={rm.skipBtn}><Text style={rm.skipTxt}>Skip</Text></TouchableOpacity>
              <TouchableOpacity onPress={save} style={{flex:1}}><LinearGradient colors={[color,C.primaryLight]} style={rm.saveBtn}><Text style={rm.saveTxt}>Save Remark</Text></LinearGradient></TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
const rm=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},sheet:{backgroundColor:C.card,borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden'},sheetHeader:{padding:20,paddingTop:24},sheetTitle:{fontSize:22,fontWeight:'900',color:'#fff'},sheetSub:{fontSize:14,color:'rgba(255,255,255,0.85)',marginTop:4},body:{padding:20,paddingBottom:40},label:{fontSize:13,fontWeight:'800',color:C.textSub,textTransform:'uppercase',letterSpacing:0.8,marginBottom:12},emojiRow:{flexDirection:'row',flexWrap:'wrap',gap:8},emojiBtn:{width:48,height:48,borderRadius:12,backgroundColor:C.section,alignItems:'center',justifyContent:'center'},noteInput:{backgroundColor:C.section,borderRadius:12,borderWidth:1.5,borderColor:C.border,padding:14,color:C.text,fontSize:15,minHeight:60},btnRow:{flexDirection:'row',gap:12,marginTop:20},skipBtn:{paddingHorizontal:20,paddingVertical:14,borderRadius:12,backgroundColor:C.section,justifyContent:'center'},skipTxt:{color:C.textSub,fontWeight:'700'},saveBtn:{borderRadius:12,padding:14,alignItems:'center'},saveTxt:{color:'#fff',fontWeight:'800',fontSize:15}});
function QuotesCard(){
  const [idx,setIdx]=useState(0);
  const tx=useRef(new Animated.Value(0)).current,op=useRef(new Animated.Value(1)).current;
  useEffect(()=>{
    const t=setInterval(()=>{
      Animated.parallel([Animated.timing(tx,{toValue:-30,duration:350,useNativeDriver:true}),Animated.timing(op,{toValue:0,duration:350,useNativeDriver:true})]).start(()=>{tx.setValue(30);setIdx(i=>(i+1)%QUOTES.length);Animated.parallel([Animated.spring(tx,{toValue:0,useNativeDriver:true,tension:120,friction:8}),Animated.timing(op,{toValue:1,duration:300,useNativeDriver:true})]).start();});
    },5000);
    return()=>clearInterval(t);
  },[]);
  const q=QUOTES[idx];
  return(
    <LinearGradient colors={[C.primary,C.primaryLight]} style={st.quoteCard} start={{x:0,y:0}} end={{x:1,y:1}}>
      <Text style={st.quoteDecor}>"</Text>
      <Animated.View style={{flex:1,transform:[{translateX:tx}],opacity:op}}>
        <Text style={st.quoteText}>{q.text}</Text>
        <Text style={st.quoteAuthor}>— {q.author}</Text>
      </Animated.View>
      <View style={st.quoteDots}>{QUOTES.map((_,i)=><View key={i} style={[st.dot,i===idx&&st.dotActive]}/>)}</View>
    </LinearGradient>
  );
}
function DateSelector({selectedDate,onSelectDate}){
  const dates=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;dates.push({key,day:DAYS_SHORT[d.getDay()],date:d.getDate(),isToday:i===0});}
  return(
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{paddingHorizontal:16,marginBottom:12}}>
      <View style={{flexDirection:'row',gap:8,paddingVertical:4}}>
        {dates.map(d=>(
          <TouchableOpacity key={d.key} onPress={()=>onSelectDate(d.key)} style={[{width:52,paddingVertical:10,borderRadius:14,alignItems:'center',backgroundColor:C.card,borderWidth:1.5,borderColor:C.border},selectedDate===d.key&&{backgroundColor:C.primary,borderColor:C.primary},d.isToday&&selectedDate!==d.key&&{borderColor:C.primary}]}>
            <Text style={{fontSize:10,fontWeight:'700',color:selectedDate===d.key?'#fff':C.textMuted}}>{d.day}</Text>
            <Text style={{fontSize:18,fontWeight:'900',color:selectedDate===d.key?'#fff':C.text,marginTop:2}}>{d.date}</Text>
            {d.isToday&&<Text style={{fontSize:8,color:selectedDate===d.key?'rgba(255,255,255,0.8)':C.primary,fontWeight:'700'}}>TODAY</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
function HomeScreen({habits,logs,moods,user,remarks,setUser,setLogs,setMoods,setRemarks,setHabits,onAddHabit,onHabitDetail}){
  const [selectedDate,setSelectedDate]=useState(getTodayKey());
  const today=getTodayKey();
  const selDate=new Date(selectedDate+'T00:00:00');
  const dayIdx=selDate.getDay();
  const hour=new Date().getHours();
  const greeting=hour<12?'Morning,':hour<17?'Afternoon,':'Evening,';
  const active=habits.filter(h=>!h.restDays?.includes(dayIdx));
  const done=active.filter(h=>logs[selectedDate]?.[h.id]===true).length;
  const todayMood=moods[selectedDate]||null;
  const info=getLevelInfo(user.xp);
  const pct=active.length>0?Math.round((done/active.length)*100):0;
  const [remarkModal,setRemarkModal]=useState(false);
  const [remarkHabit,setRemarkHabit]=useState(null);
  const barAnim=useRef(new Animated.Value(0)).current;
  const fadeAnim=useRef(new Animated.Value(0)).current;
  useEffect(()=>{Animated.parallel([Animated.timing(barAnim,{toValue:info.progress,duration:900,useNativeDriver:false}),Animated.timing(fadeAnim,{toValue:1,duration:600,useNativeDriver:true})]).start();},[user.xp]);
  const toggle=async(h,forceNotDone=false)=>{
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nl={...logs};if(!nl[selectedDate])nl[selectedDate]={};
    const was=nl[selectedDate][h.id];
    if(forceNotDone){nl[selectedDate][h.id]='notdone';}
    else if(nl[selectedDate][h.id]==='notdone'){nl[selectedDate][h.id]=false;}
    else{nl[selectedDate][h.id]=!was;}
    const completing=!was&&!forceNotDone&&nl[selectedDate][h.id]===true;
    const undoing=was===true&&!forceNotDone;
    const newXp=Math.max(0,user.xp+(completing?10:undoing?-10:0));
    const nu={...user,xp:newXp};
    setLogs(nl);setUser(nu);
    await Store.set('logs',nl);await Store.set('user',nu);
    if(completing){
      playTick();
      const newDone=active.filter(hh=>nl[selectedDate]?.[hh.id]===true).length;
      if(newDone===active.length&&active.length>0)setTimeout(()=>playApplause(),300);
      setRemarkHabit(h);setRemarkModal(true);
    }
  };
  const saveRemark=async(remark)=>{if(!remarkHabit)return;const key=`${selectedDate}_${remarkHabit.id}`;const nr={...remarks,[key]:remark};setRemarks(nr);await Store.set('remarks',nr);};
  const setMood=async(v)=>{Haptics.selectionAsync();const nm={...moods,[selectedDate]:v};setMoods(nm);await Store.set('moods',nm);};
  const reorder=async(newHabits)=>{setHabits(newHabits);await Store.set('habits',newHabits);};
  return(
    <Animated.View style={{flex:1,opacity:fadeAnim}}>
    <ScrollView style={{flex:1,backgroundColor:C.bg}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:100}}>
      <View style={st.header}>
        <View>
          <Text style={st.greeting}>Good <Text style={{color:C.primary}}>{greeting}</Text></Text>
          <Text style={st.greeting}>{user.name} 👋</Text>
          <Text style={st.dateTxt}>{getDateStr(selectedDate)}</Text>
        </View>
        <TouchableOpacity onPress={onAddHabit} style={st.fab}><LinearGradient colors={[C.primary,C.primaryLight]} style={st.fabGrad}><Text style={st.fabTxt}>＋</Text></LinearGradient></TouchableOpacity>
      </View>
      <DateSelector selectedDate={selectedDate} onSelectDate={setSelectedDate}/>
      {selectedDate!==today&&(<View style={{marginHorizontal:16,marginBottom:12,backgroundColor:'#FF8C4222',borderRadius:12,padding:10,borderWidth:1.5,borderColor:'#FF8C42'}}><Text style={{color:'#FF8C42',fontWeight:'700',fontSize:13,textAlign:'center'}}>📅 Editing past day — Tap TODAY to return</Text></View>)}
      <View style={{paddingHorizontal:16,marginBottom:16}}><QuotesCard/></View>
      <View style={{paddingHorizontal:16,marginBottom:12}}>
        <View style={st.levelStrip}>
          <View style={st.levelBadge}><Text style={st.levelNum}>{info.current.level}</Text></View>
          <View style={{flex:1,marginLeft:12}}>
            <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={st.levelTitle}>{info.current.title}</Text><Text style={st.levelXP}>{user.xp} XP</Text></View>
            <View style={st.barBg}><Animated.View style={[st.barFill,{width:barAnim.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]}/></View>
            {info.next&&<Text style={st.levelNext}>{info.next.xp-user.xp} XP to {info.next.title}</Text>}
          </View>
        </View>
      </View>
      <View style={{paddingHorizontal:16,marginBottom:16}}>
        <View style={st.progressCard}>
          <View style={st.ringWrap}><View style={[st.ring,{borderColor:pct===100?C.success:C.primary}]}><Text style={[st.ringPct,{color:pct===100?C.success:C.primary}]}>{pct}%</Text><Text style={st.ringLbl}>done</Text></View></View>
          <View style={{flex:1}}>
            <Text style={st.progressTitle}>Progress</Text>
            <Text style={st.progressSub}>{done} of {active.length} habits</Text>
            {pct===100&&active.length>0&&<View style={st.allDone}><Text style={st.allDoneTxt}>🎉 All done!</Text></View>}
          </View>
        </View>
      </View>
      <View style={{paddingHorizontal:16,marginBottom:16}}>
        <Text style={st.secTitle}>How are you feeling?</Text>
        <View style={{flexDirection:'row',gap:8,marginTop:8}}>
          {[{v:1,e:'😞',c:C.mood1},{v:2,e:'😕',c:C.mood2},{v:3,e:'😐',c:C.mood3},{v:4,e:'🙂',c:C.mood4},{v:5,e:'😄',c:C.mood5}].map(m=>(<TouchableOpacity key={m.v} onPress={()=>setMood(m.v)} style={[st.moodBtn,todayMood===m.v&&{backgroundColor:m.c+'22',borderColor:m.c}]}><Text style={{fontSize:24}}>{m.e}</Text></TouchableOpacity>))}
        </View>
      </View>
      <View style={{paddingHorizontal:16,marginBottom:8}}>
        <Text style={st.secTitle}>Habits</Text>
        <Text style={{fontSize:11,color:C.textMuted,marginTop:-6}}>Long-press icon to reorder · Swipe left for ❌ not done</Text>
      </View>
      {habits.length===0&&(<TouchableOpacity onPress={onAddHabit} style={st.empty}><Text style={{fontSize:52}}>🌱</Text><Text style={st.emptyTitle}>No habits yet!</Text><Text style={st.emptySub}>Tap + to add your first habit</Text></TouchableOpacity>)}
      {habits.map((h,i)=>{
        const status=logs[selectedDate]?.[h.id];
        const isCompleted=status===true;
        const isNotDone=status==='notdone';
        const isRest=!!h.restDays?.includes(dayIdx);
        const streak=getStreak(logs,h.id);
        const bg=h.color||C.palette[0];
        const remark=remarks[`${selectedDate}_${h.id}`];
        const swipeX=useRef(new Animated.Value(0)).current;
        const scaleAnim=useRef(new Animated.Value(1)).current;
        const panResponder=PanResponder.create({
          onMoveShouldSetPanResponder:(_,gs)=>Math.abs(gs.dx)>10&&Math.abs(gs.dy)<30,
          onPanResponderMove:(_,gs)=>{if(gs.dx<0)swipeX.setValue(gs.dx);},
          onPanResponderRelease:(_,gs)=>{
            if(gs.dx<-80){Animated.timing(swipeX,{toValue:-100,duration:150,useNativeDriver:true}).start(()=>{toggle(h,true);Animated.spring(swipeX,{toValue:0,useNativeDriver:true}).start();});}
            else{Animated.spring(swipeX,{toValue:0,useNativeDriver:true}).start();}
          },
        });
        const handleCheck=()=>{if(isRest)return;Animated.sequence([Animated.spring(scaleAnim,{toValue:0.92,useNativeDriver:true}),Animated.spring(scaleAnim,{toValue:1,useNativeDriver:true,tension:200})]).start();toggle(h);};
        return(
          <View key={h.id} style={{paddingHorizontal:16,marginBottom:10}}>
            <View style={{position:'relative'}}>
              <View style={{position:'absolute',right:0,top:0,bottom:0,width:80,backgroundColor:C.danger,borderRadius:20,alignItems:'center',justifyContent:'center'}}>
                <Text style={{fontSize:24}}>❌</Text>
                <Text style={{fontSize:10,color:'#fff',fontWeight:'700'}}>Not done</Text>
              </View>
              <Animated.View {...panResponder.panHandlers} style={[st.habitCard,{backgroundColor:isNotDone?'#888':bg,opacity:isNotDone?0.7:1},{transform:[{translateX:swipeX},{scale:scaleAnim}]}]}>
                <TouchableOpacity onLongPress={()=>{Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);Alert.alert('↕️ Move Habit',`Move "${h.name}" to:`,[...habits.map((_,j)=>j!==i?{text:`Position ${j+1} — ${habits[j].name}`,onPress:()=>{const arr=[...habits];const[item]=arr.splice(i,1);arr.splice(j,0,item);reorder(arr);}}:null).filter(Boolean),{text:'Cancel',style:'cancel'}]);}} style={st.habitIconWrap}>
                  <Text style={{fontSize:24}}>{isNotDone?'❌':h.icon}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{flex:1,marginLeft:10}} onPress={()=>onHabitDetail(h)}>
                  <Text style={[st.habitName,isNotDone&&{textDecorationLine:'line-through',opacity:0.7}]}>{h.name}</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:4}}>
                    {streak>0&&!isNotDone&&<Text style={st.habitStreak}>🔥 {streak}d</Text>}
                    {isNotDone&&<Text style={{fontSize:11,color:'rgba(255,255,255,0.80)',fontWeight:'700'}}>❌ Not done</Text>}
                    {h.alarms?.length>0&&<Text style={st.habitAlarm}>⏰ {fmtAlarm(h.alarms[0])}</Text>}
                    {h.duration>0&&<Text style={st.habitAlarm}>⏱️ {h.duration}min</Text>}
                    {isRest&&<Text style={st.habitRest}>😴 Rest</Text>}
                    {remark&&<Text style={st.habitRemark}>{remark.emoji}{remark.note?' · '+remark.note:''}</Text>}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCheck} style={st.checkBtn} disabled={isRest}>
                  <View style={[st.check,isCompleted&&st.checkDone,isNotDone&&{backgroundColor:C.danger+'33',borderColor:C.danger}]}>
                    {isCompleted&&<Text style={{fontSize:16,fontWeight:'900',color:bg}}>✓</Text>}
                    {isNotDone&&<Text style={{fontSize:16,fontWeight:'900',color:C.danger}}>✕</Text>}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        );
      })}
      <View style={{alignItems:'center',paddingVertical:32,paddingHorizontal:16}}>
        <Text style={{fontSize:28,marginBottom:8}}>🌴</Text>
        <Text style={{fontSize:13,color:C.textMuted,fontWeight:'600'}}>Crafted with ❤️ in Kerala, India</Text>
        <Text style={{fontSize:11,color:C.border,marginTop:4}}>HabitAlarm © {new Date().getFullYear()}</Text>
      </View>
      <RemarkModal visible={remarkModal} habitName={remarkHabit?.name||''} habitColor={remarkHabit?.color} existingRemark={remarkHabit?remarks[`${selectedDate}_${remarkHabit.id}`]:null} onSave={saveRemark} onClose={()=>{setRemarkModal(false);setRemarkHabit(null);}}/>
    </ScrollView>
    </Animated.View>
  );
}
function AddHabitScreen({existing,onSave,onBack}){
  const [name,setName]=useState(existing?.name||'');
  const [icon,setIcon]=useState(existing?.icon||'💪');
  const [color,setColor]=useState(existing?.color||C.palette[0]);
  const [restDays,setRestDays]=useState(existing?.restDays||[]);
  const [alarms,setAlarms]=useState(existing?.alarms||[]);
  const [duration,setDuration]=useState(existing?.duration?String(existing.duration):'');
  const [showPicker,setShowPicker]=useState(false);
  const [editIdx,setEditIdx]=useState(null);
  const [pickerDate,setPickerDate]=useState(new Date());
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    const handler=BackHandler.addEventListener('hardwareBackPress',()=>{onBack();return true;});
    return()=>handler.remove();
  },[]);
  const toggleRest=(d)=>setRestDays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d]);
  const handleTime=(e,date)=>{setShowPicker(false);if(e.type==='dismissed'||!date)return;const alarm={hour:date.getHours(),minute:date.getMinutes()};if(editIdx!==null){const u=[...alarms];u[editIdx]=alarm;setAlarms(u);}else setAlarms(p=>[...p,alarm]);setEditIdx(null);};
  const save=async()=>{
    if(!name.trim()){Alert.alert('Required','Enter a habit name.');return;}
    setSaving(true);
    const habit={id:existing?.id||`h_${Date.now()}`,name:name.trim(),icon,color,restDays,alarms,duration:parseInt(duration)||0,createdAt:existing?.createdAt||new Date().toISOString()};
    await cancelHabitAlarms(habit.id);
    for(const a of alarms)await scheduleAlarm(habit,a);
    const habits=await Store.get('habits',[]);
    if(existing){await Store.set('habits',habits.map(h=>h.id===existing.id?habit:h));}else{await Store.set('habits',[...habits,habit]);}
    setSaving(false);onSave();
  };
  return(
    <View style={{flex:1,backgroundColor:C.bg}}>
      <LinearGradient colors={[C.primary,C.primaryLight]} style={st.modalHeader}>
        <TouchableOpacity onPress={onBack} style={st.closeBtn}><Text style={st.closeTxt}>✕</Text></TouchableOpacity>
        <Text style={st.modalTitle}>{existing?'Edit Habit':'New Habit'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={st.saveHdrBtn}><Text style={st.saveHdrTxt}>{saving?'…':'Save'}</Text></TouchableOpacity>
      </LinearGradient>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:16,paddingBottom:60}}>
        <Text style={st.label}>HABIT NAME</Text>
        <View style={st.inputWrap}><Text style={{fontSize:22,marginRight:8}}>{icon}</Text><TextInput style={st.input} value={name} onChangeText={setName} placeholder="e.g. Morning Run" placeholderTextColor={C.textMuted} maxLength={40} autoFocus={!existing}/></View>
        <Text style={[st.label,{marginTop:20}]}>ICON</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{ICONS.map(ic=>(<TouchableOpacity key={ic} onPress={()=>{Haptics.selectionAsync();setIcon(ic);}} style={[st.iconBtn,icon===ic&&{backgroundColor:color+'22',borderColor:color,borderWidth:2}]}><Text style={{fontSize:22}}>{ic}</Text></TouchableOpacity>))}</View>
        <Text style={[st.label,{marginTop:20}]}>COLOR</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{C.palette.map(c=>(<TouchableOpacity key={c} onPress={()=>{Haptics.selectionAsync();setColor(c);}} style={[{width:36,height:36,borderRadius:18,backgroundColor:c,alignItems:'center',justifyContent:'center'},color===c&&{borderWidth:3,borderColor:'#fff'}]}>{color===c&&<Text style={{color:'#fff',fontWeight:'900'}}>✓</Text>}</TouchableOpacity>))}</View>
        <Text style={[st.label,{marginTop:20}]}>⏱️ DURATION (minutes)</Text>
        <View style={st.inputWrap}>
          <Text style={{fontSize:22,marginRight:8}}>⏱️</Text>
          <TextInput style={st.input} value={duration} onChangeText={setDuration} placeholder="How long? e.g. 30" placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={3}/>
          <Text style={{fontSize:14,color:C.textMuted,marginRight:8}}>min</Text>
        </View>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20,marginBottom:8}}>
          <Text style={st.label}>⏰ ALARMS</Text>
          <TouchableOpacity onPress={()=>{setEditIdx(null);setPickerDate(new Date());setShowPicker(true);}} style={[st.addAlarmBtn,{backgroundColor:color}]}><Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>+ Add Alarm</Text></TouchableOpacity>
        </View>
        {alarms.length===0&&<Text style={{fontSize:13,color:C.textMuted,fontStyle:'italic'}}>No alarms. Phone rings at set times.</Text>}
        {alarms.map((a,i)=>(<View key={i} style={st.alarmRow}><Text style={[{flex:1,fontSize:20,fontWeight:'900'},{color}]}>{fmtAlarm(a)}</Text><Text style={{fontSize:11,color:C.textMuted,marginRight:8}}>Daily</Text><TouchableOpacity onPress={()=>{setEditIdx(i);const d=new Date();d.setHours(a.hour,a.minute);setPickerDate(d);setShowPicker(true);}} style={st.alarmEditBtn}><Text style={{color:C.primary,fontWeight:'700',fontSize:12}}>Edit</Text></TouchableOpacity><TouchableOpacity onPress={()=>setAlarms(p=>p.filter((_,j)=>j!==i))} style={st.alarmDelBtn}><Text style={{color:C.danger,fontWeight:'700',fontSize:12}}>✕</Text></TouchableOpacity></View>))}
        {showPicker&&<DateTimePicker value={pickerDate} mode="time" is24Hour={false} onChange={handleTime}/>}
        <Text style={[st.label,{marginTop:20}]}>😴 REST DAYS</Text>
        <View style={{flexDirection:'row',gap:6}}>{DAYS_SHORT.map((d,i)=>(<TouchableOpacity key={i} onPress={()=>toggleRest(i)} style={[st.dayBtn,restDays.includes(i)&&{backgroundColor:C.textMuted+'22',borderColor:C.textMuted}]}><Text style={[{fontSize:12,fontWeight:'800',color:C.text},restDays.includes(i)&&{color:C.textSub}]}>{d}</Text></TouchableOpacity>))}</View>
        <Text style={[st.label,{marginTop:20}]}>PREVIEW</Text>
        <View style={[st.habitCard,{backgroundColor:color}]}>
          <View style={st.habitIconWrap}><Text style={{fontSize:24}}>{icon}</Text></View>
          <View style={{flex:1,marginLeft:10}}>
            <Text style={st.habitName}>{name||'Habit Name'}</Text>
            <View style={{flexDirection:'row',gap:6,marginTop:4,flexWrap:'wrap'}}>
              {alarms.length>0&&<Text style={{fontSize:11,color:'rgba(255,255,255,0.80)'}}>⏰ {alarms.map(fmtAlarm).join(' · ')}</Text>}
              {parseInt(duration)>0&&<Text style={{fontSize:11,color:'rgba(255,255,255,0.80)'}}>⏱️ {duration}min</Text>}
            </View>
          </View>
          <View style={st.check}/>
        </View>
        <View style={{marginTop:20,backgroundColor:'#FF8C4222',borderRadius:12,padding:14,borderWidth:1.5,borderColor:'#FF8C42'}}>
          <Text style={{fontSize:13,fontWeight:'800',color:'#FF8C42',marginBottom:6}}>📱 Xiaomi Notification Fix</Text>
          <Text style={{fontSize:12,color:C.textSub,lineHeight:18}}>For alarms to work when app is closed:{'\n'}Settings → Apps → HabitAlarm → Other Permissions → Enable Autostart ✅{'\n'}Also: Battery → No Restrictions</Text>
        </View>
      </ScrollView>
    </View>
  );
}
function MonthlyCalendarScreen({habits,logs,onBack}){
  const now=new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth());
  const today=getTodayKey();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay();
  const getDayKey=(day)=>`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const getDayStatus=(day)=>{const key=getDayKey(day);const dayLogs=logs[key]||{};const total=habits.length;if(total===0)return'none';const done=habits.filter(h=>dayLogs[h.id]===true).length;if(done===0)return'none';if(done===total)return'perfect';return'partial';};
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{onBack();return true;});return()=>handler.remove();},[]);
  const prevMonth=()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);};
  const nextMonth=()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);};
  const cells=[];for(let i=0;i<firstDay;i++)cells.push(null);for(let d=1;d<=daysInMonth;d++)cells.push(d);
  return(
    <View style={{flex:1,backgroundColor:C.bg}}>
      <LinearGradient colors={[C.primary,C.primaryLight]} style={st.screenHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
        <TouchableOpacity onPress={onBack} style={{marginBottom:12}}><Text style={{color:'rgba(255,255,255,0.9)',fontWeight:'700',fontSize:15}}>← Back</Text></TouchableOpacity>
        <Text style={st.screenHeaderTitle}>📆 Monthly Calendar</Text>
        <View style={{flexDirection:'row',alignItems:'center',gap:16,marginTop:8}}>
          <TouchableOpacity onPress={prevMonth} style={{backgroundColor:'rgba(255,255,255,0.2)',borderRadius:99,width:32,height:32,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontWeight:'900',fontSize:16}}>‹</Text></TouchableOpacity>
          <Text style={{color:'#fff',fontWeight:'800',fontSize:16,flex:1,textAlign:'center'}}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={{backgroundColor:'rgba(255,255,255,0.2)',borderRadius:99,width:32,height:32,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontWeight:'900',fontSize:16}}>›</Text></TouchableOpacity>
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:60}}>
        <View style={{flexDirection:'row',gap:16,marginBottom:16,justifyContent:'center'}}>
          {[{c:C.success,l:'Perfect'},{c:C.gold,l:'Partial'},{c:C.section,l:'None'}].map((x,i)=>(<View key={i} style={{flexDirection:'row',alignItems:'center',gap:6}}><View style={{width:14,height:14,borderRadius:4,backgroundColor:x.c}}/><Text style={{fontSize:11,color:C.textSub,fontWeight:'600'}}>{x.l}</Text></View>))}
        </View>
        <View style={{flexDirection:'row',marginBottom:8}}>{DAYS_SHORT.map(d=>(<Text key={d} style={{flex:1,textAlign:'center',fontSize:11,fontWeight:'800',color:C.textMuted}}>{d}</Text>))}</View>
        <View style={{flexDirection:'row',flexWrap:'wrap'}}>
          {cells.map((day,i)=>{
            if(!day)return<View key={`e${i}`} style={{width:`${100/7}%`,aspectRatio:1}}/>;
            const key=getDayKey(day);const status=getDayStatus(day);const isToday=key===today;const isFuture=new Date(year,month,day)>new Date();
            const bg=status==='perfect'?C.success:status==='partial'?C.gold:C.section;
            return(<View key={day} style={{width:`${100/7}%`,aspectRatio:1,padding:2}}><View style={[{flex:1,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:isFuture?'transparent':bg},isToday&&{borderWidth:2,borderColor:C.primary}]}><Text style={{fontSize:12,fontWeight:isToday?'900':'700',color:status!=='none'&&!isFuture?'#fff':C.textSub}}>{day}</Text>{status==='perfect'&&!isFuture&&<Text style={{fontSize:8}}>⭐</Text>}</View></View>);
          })}
        </View>
        <View style={{marginTop:20,backgroundColor:C.card,borderRadius:20,padding:16}}>
          <Text style={{fontSize:15,fontWeight:'800',color:C.text,marginBottom:12}}>Month Summary</Text>
          {(()=>{let perfect=0,partial=0,missed=0;for(let d=1;d<=daysInMonth;d++){const s=getDayStatus(d);const isFuture=new Date(year,month,d)>new Date();if(!isFuture){if(s==='perfect')perfect++;else if(s==='partial')partial++;else missed++;}}return(<View style={{flexDirection:'row',gap:10}}>{[{v:perfect,l:'Perfect',c:C.success},{v:partial,l:'Partial',c:C.gold},{v:missed,l:'Missed',c:C.danger}].map((x,i)=>(<View key={i} style={{flex:1,backgroundColor:x.c+'20',borderRadius:12,padding:12,alignItems:'center'}}><Text style={{fontSize:22,fontWeight:'900',color:x.c}}>{x.v}</Text><Text style={{fontSize:11,color:x.c,fontWeight:'700'}}>{x.l}</Text></View>))}</View>);})()}
        </View>
      </ScrollView>
    </View>
  );
}
function StatsScreen({habits,logs,moods,onMonthly}){
  const matrixRef=useRef(null);
  const totalDone=Object.values(logs).reduce((a,d)=>a+Object.values(d).filter(v=>v===true).length,0);
  const bestStreak=habits.reduce((b,h)=>{const s=getStreak(logs,h.id);return s>b?s:b;},0);
  const mv=Object.values(moods);
  const avgMood=mv.length>0?(mv.reduce((a,b)=>a+b,0)/mv.length).toFixed(1):'—';
  const totalMinutes=habits.reduce((acc,h)=>{const done=Object.values(logs).filter(d=>d[h.id]===true).length;return acc+(done*(h.duration||0));},0);
  const totalHours=totalMinutes>0?(totalMinutes/60).toFixed(1):0;
  const dayKeys=[];
  for(let i=29;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;dayKeys.push({key,label:DAYS_SHORT[d.getDay()],date:d.getDate(),isToday:i===0});}
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{return false;});return()=>handler.remove();},[]);
  useEffect(()=>{setTimeout(()=>matrixRef.current?.scrollToEnd({animated:false}),300);},[]);
  return(
    <ScrollView style={{flex:1,backgroundColor:C.bg}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:80}}>
      <LinearGradient colors={[C.primary,C.primaryLight]} style={st.screenHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Text style={st.screenHeaderTitle}>📊 Statistics</Text>
        <Text style={st.screenHeaderSub}>Your habit insights</Text>
        <TouchableOpacity onPress={onMonthly} style={st.headerAddBtn}><Text style={{color:'#fff',fontWeight:'800',fontSize:13}}>📆 Monthly View</Text></TouchableOpacity>
      </LinearGradient>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,paddingHorizontal:16,marginBottom:16}}>
        {[{v:totalDone,l:'Total Done',bg:'#4F8EF7'},{v:`🔥${bestStreak}`,l:'Best Streak',bg:C.gold},{v:avgMood,l:'Avg Mood',bg:C.success},{v:`${totalHours}h`,l:'Time Invested',bg:'#9B5DE5'}].map((x,i)=>(<View key={i} style={[st.overviewCard,{backgroundColor:x.bg,width:'47%'}]}><Text style={{fontSize:20,fontWeight:'900',color:'#fff'}}>{x.v}</Text><Text style={{fontSize:10,color:'rgba(255,255,255,0.85)',marginTop:4,fontWeight:'700',textAlign:'center'}}>{x.l}</Text></View>))}
      </View>
      {habits.length>0&&(
        <View style={{marginHorizontal:16,marginBottom:16,backgroundColor:C.card,borderRadius:20,padding:16}}>
          <Text style={{fontSize:15,fontWeight:'800',color:C.text}}>📅 30-Day Matrix</Text>
          <Text style={{fontSize:11,color:C.textMuted,marginBottom:12}}>Today on right →</Text>
          <View style={{flexDirection:'row'}}>
            <View style={{width:100}}>
              <View style={{height:40}}><Text style={{fontSize:10,fontWeight:'700',color:C.textMuted,textTransform:'uppercase',alignSelf:'flex-end',paddingBottom:4}}>Habit</Text></View>
              {habits.map(h=>(<View key={h.id} style={{height:36,flexDirection:'row',alignItems:'center',gap:4,borderBottomWidth:1,borderBottomColor:C.border}}><Text style={{fontSize:14}}>{h.icon}</Text><Text style={{fontSize:11,fontWeight:'700',color:C.text,flex:1}} numberOfLines={1}>{h.name}</Text></View>))}
            </View>
            <ScrollView ref={matrixRef} horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{flexDirection:'row',height:40,alignItems:'flex-end',paddingBottom:4}}>{dayKeys.map(dk=>(<View key={dk.key} style={[{width:36,alignItems:'center'},dk.isToday&&{backgroundColor:C.primaryPale,borderRadius:6}]}><Text style={{fontSize:8,color:dk.isToday?C.primary:C.textMuted,fontWeight:'700'}}>{dk.label}</Text><Text style={{fontSize:11,color:dk.isToday?C.primary:C.textSub,fontWeight:dk.isToday?'900':'700'}}>{dk.date}</Text></View>))}</View>
                {habits.map(h=>(<View key={h.id} style={{flexDirection:'row',height:36,alignItems:'center',borderBottomWidth:1,borderBottomColor:C.border}}>{dayKeys.map(dk=>{const status=logs[dk.key]?.[h.id];const done=status===true;const notdone=status==='notdone';return(<View key={dk.key} style={{width:36,alignItems:'center'}}><View style={[{width:24,height:24,borderRadius:6,alignItems:'center',justifyContent:'center'},{backgroundColor:done?(h.color||C.primary):notdone?C.danger+'44':C.section},dk.isToday&&!done&&!notdone&&{borderWidth:1.5,borderColor:C.primary+'50'}]}>{done&&<Text style={{fontSize:12,color:'#fff',fontWeight:'900'}}>✓</Text>}{notdone&&<Text style={{fontSize:12,color:C.danger,fontWeight:'900'}}>✕</Text>}</View></View>);})}</View>))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
      <View style={{paddingHorizontal:16}}>
        <Text style={st.secTitle}>Habit Breakdown</Text>
        {habits.length===0&&<Text style={{fontSize:13,color:C.textMuted,textAlign:'center',paddingVertical:20}}>No habits yet</Text>}
        {habits.map(h=>{
          const streak=getStreak(logs,h.id);const r7=getRate(logs,h.id,7);const r30=getRate(logs,h.id,30);
          const totalHabitMin=Object.values(logs).filter(d=>d[h.id]===true).length*(h.duration||0);
          return(<View key={h.id} style={st.breakdownCard}><View style={{width:44,height:44,borderRadius:14,backgroundColor:h.color||C.primary,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:20}}>{h.icon}</Text></View><View style={{flex:1,marginLeft:12}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:14,fontWeight:'700',color:C.text,flex:1}}>{h.name}</Text><Text style={{fontSize:12,color:C.gold,fontWeight:'700'}}>🔥 {streak}</Text></View><View style={{height:7,backgroundColor:C.section,borderRadius:99,overflow:'hidden',marginVertical:6}}><View style={{height:'100%',width:`${r7}%`,backgroundColor:h.color||C.primary,borderRadius:99}}/></View><Text style={{fontSize:11,color:C.textSub}}>7d: {r7}% · 30d: {r30}%{totalHabitMin>0?` · ⏱️ ${(totalHabitMin/60).toFixed(1)}h`:''}</Text></View></View>);
        })}
      </View>
    </ScrollView>
  );
}
function GoalsScreen({goals,setGoals}){
  const [showAdd,setShowAdd]=useState(false);
  const [title,setTitle]=useState('');const [target,setTarget]=useState('30');const [reward,setReward]=useState('');const [emoji,setEmoji]=useState('🎯');
  const GEMOJIS=['🎯','💪','📚','🏃','💧','🧘','💰','❤️','🏆','🌟'];
  const RCHIPS=[{e:'🎬',l:'Movie night'},{e:'🍕',l:'Cheat meal'},{e:'🛍️',l:'Shopping'},{e:'☕',l:'Coffee'},{e:'🎮',l:'Gaming'}];
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{return false;});return()=>handler.remove();},[]);
  const add=async()=>{if(!title.trim()){Alert.alert('Required','Enter goal name.');return;}const g={id:`g_${Date.now()}`,title:title.trim(),target:parseInt(target)||30,current:0,reward,emoji};const u=[...goals,g];setGoals(u);await Store.set('goals',u);setTitle('');setTarget('30');setReward('');setEmoji('🎯');setShowAdd(false);};
  const inc=async(id)=>{Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);const u=goals.map(g=>g.id===id?{...g,current:Math.min(g.current+1,g.target)}:g);setGoals(u);await Store.set('goals',u);};
  const del=async(id)=>{Alert.alert('Delete','Remove this goal?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{const u=goals.filter(g=>g.id!==id);setGoals(u);await Store.set('goals',u);}}]);};
  return(
    <ScrollView style={{flex:1,backgroundColor:C.bg}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:80}}>
      <LinearGradient colors={['#FF6B9D','#FF8C42']} style={st.screenHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Text style={st.screenHeaderTitle}>🎯 Goals & Rewards</Text>
        <Text style={st.screenHeaderSub}>Set goals, earn rewards</Text>
        <TouchableOpacity onPress={()=>setShowAdd(v=>!v)} style={st.headerAddBtn}><Text style={{color:'#fff',fontWeight:'800',fontSize:14}}>{showAdd?'✕ Cancel':'＋ New Goal'}</Text></TouchableOpacity>
      </LinearGradient>
      {showAdd&&(<View style={{margin:16,backgroundColor:C.card,borderRadius:20,padding:16}}>
        <Text style={{fontSize:17,fontWeight:'800',color:C.text,marginBottom:12}}>Create Goal</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12}}>{GEMOJIS.map(e=>(<TouchableOpacity key={e} onPress={()=>setEmoji(e)} style={[{width:44,height:44,borderRadius:10,backgroundColor:C.section,alignItems:'center',justifyContent:'center'},emoji===e&&{backgroundColor:C.primaryPale,borderWidth:2,borderColor:C.primary}]}><Text style={{fontSize:22}}>{e}</Text></TouchableOpacity>))}</View>
        <TextInput style={st.inputFull} value={title} onChangeText={setTitle} placeholder="Goal name" placeholderTextColor={C.textMuted}/>
        <TextInput style={st.inputFull} value={target} onChangeText={setTarget} placeholder="Target count" placeholderTextColor={C.textMuted} keyboardType="numeric"/>
        <Text style={{fontSize:13,fontWeight:'700',color:C.textSub,marginBottom:8}}>🏆 Reward</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:8}}>{RCHIPS.map(r=>(<TouchableOpacity key={r.l} onPress={()=>setReward(r.l)} style={[{paddingHorizontal:10,paddingVertical:6,backgroundColor:C.section,borderRadius:99},reward===r.l&&{backgroundColor:C.goldPale,borderWidth:1.5,borderColor:C.gold}]}><Text style={{fontSize:12,color:C.textSub,fontWeight:'600'}}>{r.e} {r.l}</Text></TouchableOpacity>))}</View>
        <TextInput style={st.inputFull} value={reward} onChangeText={setReward} placeholder="Custom reward…" placeholderTextColor={C.textMuted}/>
        <TouchableOpacity onPress={add}><LinearGradient colors={[C.primary,C.primaryLight]} style={{borderRadius:12,padding:16,alignItems:'center',marginTop:8}}><Text style={{color:'#fff',fontWeight:'800',fontSize:15}}>Create Goal 🚀</Text></LinearGradient></TouchableOpacity>
      </View>)}
      <View style={{paddingHorizontal:16}}>
        {goals.length===0&&!showAdd&&(<View style={st.empty}><Text style={{fontSize:52}}>🏆</Text><Text style={st.emptyTitle}>No goals yet</Text><Text style={st.emptySub}>Tap + New Goal to get started</Text></View>)}
        {goals.map(g=>{const pct=Math.min(g.current/g.target,1);const done=g.current>=g.target;return(
          <View key={g.id} style={[st.goalCard,done&&{borderColor:C.success+'60'}]}>
            <View style={{flexDirection:'row',alignItems:'flex-start',gap:10,marginBottom:10}}>
              <View style={{width:52,height:52,borderRadius:14,backgroundColor:C.primaryPale,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:28}}>{g.emoji}</Text></View>
              <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:'800',color:C.text}}>{g.title}</Text>{g.reward?<Text style={{fontSize:12,color:C.gold,marginTop:2}}>🏆 {g.reward}</Text>:null}</View>
              {!done&&(<TouchableOpacity onPress={()=>inc(g.id)} style={{backgroundColor:C.primaryPale,paddingHorizontal:10,paddingVertical:6,borderRadius:8}}><Text style={{color:C.primary,fontWeight:'900',fontSize:14}}>+1</Text></TouchableOpacity>)}
              <TouchableOpacity onPress={()=>del(g.id)} style={{backgroundColor:C.dangerPale,paddingHorizontal:10,paddingVertical:6,borderRadius:8}}><Text style={{color:C.danger,fontWeight:'700',fontSize:14}}>✕</Text></TouchableOpacity>
            </View>
            <View style={{height:8,backgroundColor:C.section,borderRadius:99,overflow:'hidden'}}><View style={{height:'100%',width:`${pct*100}%`,backgroundColor:done?C.success:C.primary,borderRadius:99}}/></View>
            <View style={{flexDirection:'row',justifyContent:'space-between',marginTop:6}}><Text style={{fontSize:12,color:C.textSub,fontWeight:'700'}}>{g.current} / {g.target}</Text><Text style={{fontSize:12,color:C.primary,fontWeight:'800'}}>{Math.round(pct*100)}%</Text></View>
            {done&&(<View style={{backgroundColor:C.successPale,borderRadius:10,padding:10,marginTop:8,alignItems:'center'}}><Text style={{fontSize:13,color:C.success,fontWeight:'700'}}>🎉 Goal achieved! Enjoy: {g.reward||'your reward'}</Text></View>)}
          </View>
        );})}
      </View>
    </ScrollView>
  );
}
function ProfileScreen({user,setUser,habits,logs,moods,setHabits,setLogs,setMoods}){
  const [editName,setEditName]=useState(false);const [tmpName,setTmpName]=useState('');const [showInsights,setShowInsights]=useState(false);
  const info=getLevelInfo(user.xp);
  const bestStreak=habits.reduce((b,h)=>{const s=getStreak(logs,h.id);return s>b?s:b;},0);
  const totalDone=Object.values(logs).reduce((a,d)=>a+Object.values(d).filter(v=>v===true).length,0);
  const insights=generateInsights(habits,logs,moods);
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{return false;});return()=>handler.remove();},[]);
  const BADGES=[
    {e:'🌱',l:'First Habit',d:'Create first habit',ok:()=>habits.length>=1},
    {e:'🔥',l:'Week Warrior',d:'7-day streak',ok:()=>habits.some(h=>getStreak(logs,h.id)>=7)},
    {e:'⚡',l:'Monthly Master',d:'30-day streak',ok:()=>habits.some(h=>getStreak(logs,h.id)>=30)},
    {e:'💪',l:'Full Stack',d:'5+ habits',ok:()=>habits.length>=5},
    {e:'⭐',l:'Perfect Day',d:'All habits done today',ok:()=>{const k=getTodayKey(),dl=logs[k]||{};return habits.length>0&&habits.every(h=>dl[h.id]===true);}},
    {e:'🏆',l:'Level 5',d:'Reach Level 5',ok:()=>info.current.level>=5},
    {e:'💎',l:'Diamond',d:'Earn 500 XP',ok:()=>user.xp>=500},
    {e:'😄',l:'Mood Tracker',d:'Log mood 7 days',ok:()=>{for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(!moods[k])return false;}return true;}},
  ];
  const saveName=async()=>{if(!tmpName.trim())return;const u={...user,name:tmpName.trim()};setUser(u);await Store.set('user',u);setEditName(false);};
  const reset=()=>Alert.alert('Reset All','Delete all data?',[{text:'Cancel',style:'cancel'},{text:'Reset',style:'destructive',onPress:async()=>{await Promise.all([Store.set('habits',[]),Store.set('logs',{}),Store.set('moods',{}),Store.set('user',{xp:0,name:user.name}),Store.set('remarks',{}),Store.set('goals',[])]);setHabits([]);setLogs({});setMoods({});setUser({xp:0,name:user.name});}}]);
  return(
    <ScrollView style={{flex:1,backgroundColor:C.bg}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:80}}>
      <LinearGradient colors={[C.primary,'#4CC9F0']} style={[st.screenHeader,{alignItems:'center',paddingBottom:30}]} start={{x:0,y:0}} end={{x:1,y:1}}>
        <View style={{width:88,height:88,borderRadius:44,borderWidth:4,borderColor:'rgba(255,255,255,0.5)',padding:3,marginBottom:12}}><View style={{flex:1,borderRadius:40,backgroundColor:'rgba(255,255,255,0.25)',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:36,fontWeight:'900',color:'#fff'}}>{(user.name||'C')[0].toUpperCase()}</Text></View></View>
        {editName?<TextInput style={st.nameInput} value={tmpName} onChangeText={setTmpName} autoFocus onBlur={saveName} onSubmitEditing={saveName} maxLength={20}/>:<TouchableOpacity onPress={()=>{setTmpName(user.name);setEditName(true);}}><Text style={{fontSize:22,fontWeight:'900',color:'#fff',marginBottom:8}}>{user.name} ✏️</Text></TouchableOpacity>}
        <View style={{backgroundColor:'rgba(255,255,255,0.20)',borderRadius:99,paddingHorizontal:16,paddingVertical:6}}><Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>⚡ Level {info.current.level} · {info.current.title}</Text></View>
      </LinearGradient>
      <View style={{marginHorizontal:16,marginBottom:16,backgroundColor:C.card,borderRadius:20,overflow:'hidden'}}>
        <TouchableOpacity onPress={()=>setShowInsights(v=>!v)} style={{padding:16}}><LinearGradient colors={[C.primary,C.primaryLight]} style={{borderRadius:12,padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View><Text style={{fontSize:15,fontWeight:'800',color:'#fff'}}>🧠 AI Habit Insights</Text><Text style={{fontSize:12,color:'rgba(255,255,255,0.80)',marginTop:2}}>Tap to see your habit personality</Text></View><Text style={{fontSize:24}}>{showInsights?'▲':'▼'}</Text></LinearGradient></TouchableOpacity>
        {showInsights&&(<View style={{paddingHorizontal:16,paddingBottom:16}}>{insights.map((insight,i)=>(<View key={i} style={{flexDirection:'row',gap:10,marginBottom:12,backgroundColor:C.section,borderRadius:12,padding:12}}><Text style={{fontSize:13,color:C.text,flex:1,lineHeight:20}}>{insight}</Text></View>))}</View>)}
      </View>
      <View style={{marginHorizontal:16,marginBottom:16,backgroundColor:C.card,borderRadius:20,padding:16}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:8}}><Text style={{fontSize:20,fontWeight:'900',color:C.primary}}>{user.xp} XP</Text>{info.next&&<Text style={{fontSize:11,color:C.textSub,alignSelf:'flex-end'}}>→ {info.next.title} ({info.next.xp} XP)</Text>}</View>
        <View style={{height:10,backgroundColor:C.section,borderRadius:99,overflow:'hidden',marginBottom:8}}><View style={{height:'100%',width:`${info.progress*100}%`,backgroundColor:C.primary,borderRadius:99}}/></View>
        <View style={{flexDirection:'row',justifyContent:'space-between'}}>{LEVELS.map(l=>(<View key={l.level} style={[{width:24,height:24,borderRadius:12,backgroundColor:C.section,alignItems:'center',justifyContent:'center'},user.xp>=l.xp&&{backgroundColor:C.primary}]}><Text style={{fontSize:9,fontWeight:'800',color:user.xp>=l.xp?'#fff':C.text}}>{l.level}</Text></View>))}</View>
      </View>
      <View style={{flexDirection:'row',gap:10,paddingHorizontal:16,marginBottom:16}}>{[{v:habits.length,l:'Habits',c:'#4F8EF7'},{v:`🔥${bestStreak}`,l:'Streak',c:C.gold},{v:totalDone,l:'Total Done',c:C.success},{v:BADGES.filter(b=>b.ok()).length,l:'Badges',c:'#FF6B9D'}].map((x,i)=>(<View key={i} style={[st.statCard,{borderTopColor:x.c,borderTopWidth:4}]}><Text style={{fontSize:16,fontWeight:'900',color:x.c}}>{x.v}</Text><Text style={{fontSize:9,color:C.textSub,marginTop:2,fontWeight:'700',textAlign:'center'}}>{x.l}</Text></View>))}</View>
      <View style={{paddingHorizontal:16,marginBottom:16}}>
        <Text style={st.secTitle}>🏅 Badges</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{BADGES.map((b,i)=>{const ok=b.ok();return(<View key={i} style={[{width:'47%',backgroundColor:C.card,borderRadius:20,padding:16,alignItems:'center',borderWidth:1.5},ok?{borderColor:C.primaryPale}:{borderColor:C.border}]}><Text style={{fontSize:30,marginBottom:6,opacity:ok?1:0.2}}>{b.e}</Text><Text style={{fontSize:12,fontWeight:'800',color:ok?C.text:C.textMuted,textAlign:'center'}}>{b.l}</Text><Text style={{fontSize:10,color:C.textMuted,textAlign:'center',marginTop:2}}>{b.d}</Text>{ok&&<Text style={{fontSize:11,color:C.success,fontWeight:'700',marginTop:6}}>✓ Earned</Text>}</View>);})}</View>
      </View>
      <View style={{paddingHorizontal:16}}><TouchableOpacity onPress={reset} style={{backgroundColor:C.dangerPale,borderRadius:12,padding:16,alignItems:'center',borderWidth:1.5,borderColor:C.danger+'40'}}><Text style={{color:C.danger,fontWeight:'700',fontSize:14}}>🗑️ Reset All Data</Text></TouchableOpacity></View>
    </ScrollView>
  );
}
function HabitDetailScreen({habit,logs,remarks,onBack,onEdit,onDelete}){
  const streak=getStreak(logs,habit.id);const r7=getRate(logs,habit.id,7);const r30=getRate(logs,habit.id,30);const color=habit.color||C.primary;
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{onBack();return true;});return()=>handler.remove();},[]);
  const days=[];
  for(let i=34;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const remark=remarks[`${key}_${habit.id}`];
    const status=logs[key]?.[habit.id];
    days.push({key,date:d.getDate(),done:status===true,notdone:status==='notdone',isToday:i===0,remark});
  }
  const remarkDays=days.filter(d=>d.remark&&(d.done||d.notdone)).slice(0,10);
  return(
    <ScrollView style={{flex:1,backgroundColor:C.bg}} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:60}}>
      <LinearGradient colors={[color,color+'BB']} style={[st.screenHeader,{alignItems:'center'}]} start={{x:0,y:0}} end={{x:1,y:1}}>
        <TouchableOpacity onPress={onBack} style={{alignSelf:'flex-start',marginBottom:12}}><Text style={{color:'rgba(255,255,255,0.9)',fontWeight:'700',fontSize:15}}>← Back</Text></TouchableOpacity>
        <Text style={{fontSize:56,marginBottom:8}}>{habit.icon}</Text>
        <Text style={{fontSize:24,fontWeight:'900',color:'#fff',marginBottom:8}}>{habit.name}</Text>
        {habit.duration>0&&<Text style={{fontSize:13,color:'rgba(255,255,255,0.80)',marginBottom:8}}>⏱️ {habit.duration} min per session</Text>}
        <View style={{backgroundColor:'rgba(255,255,255,0.22)',borderRadius:99,paddingHorizontal:16,paddingVertical:6}}><Text style={{color:'#fff',fontWeight:'800',fontSize:15}}>🔥 {streak} day{streak!==1?'s':''} streak</Text></View>
      </LinearGradient>
      <View style={{flexDirection:'row',gap:10,paddingHorizontal:16,marginBottom:16}}>{[{v:`${r7}%`,l:'7-day rate'},{v:`${r30}%`,l:'30-day rate'},{v:streak,l:'Streak'}].map((x,i)=>(<View key={i} style={[st.statCard,{borderTopColor:color,borderTopWidth:4}]}><Text style={{fontSize:18,fontWeight:'900',color}}>{x.v}</Text><Text style={{fontSize:10,color:C.textSub,marginTop:4,fontWeight:'600',textAlign:'center'}}>{x.l}</Text></View>))}</View>
      {habit.alarms?.length>0&&(<View style={{paddingHorizontal:16,marginBottom:16}}><Text style={st.secTitle}>⏰ Alarms</Text>{habit.alarms.map((a,i)=>(<View key={i} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:C.card,borderRadius:12,padding:16,marginBottom:6}}><Text style={{fontSize:22,fontWeight:'900',color}}>{fmtAlarm(a)}</Text><Text style={{fontSize:12,color:C.textMuted}}>Repeats daily</Text></View>))}</View>)}
      {habit.restDays?.length>0&&(<View style={{paddingHorizontal:16,marginBottom:16}}><Text style={st.secTitle}>😴 Rest Days</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{habit.restDays.map(d=>(<View key={d} style={{backgroundColor:C.section,borderRadius:99,paddingHorizontal:12,paddingVertical:4}}><Text style={{fontSize:13,color:C.textSub,fontWeight:'700'}}>{DAYS[d]}</Text></View>))}</View></View>)}
      <View style={{paddingHorizontal:16,marginBottom:16}}>
        <Text style={st.secTitle}>📅 Last 35 Days</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:5}}>
          {days.map((d,i)=>(<View key={i} style={[{width:38,height:46,borderRadius:8,alignItems:'center',justifyContent:'center'},d.done&&{backgroundColor:color},d.notdone&&{backgroundColor:C.danger+'44'},!d.done&&!d.notdone&&{backgroundColor:C.section},d.isToday&&{borderWidth:2,borderColor:color}]}>
            <Text style={{fontSize:10,fontWeight:'700',color:d.done?'#fff':d.notdone?C.danger:C.textSub}}>{d.date}</Text>
            {d.done&&<Text style={{fontSize:9,color:'#fff',fontWeight:'900'}}>✓</Text>}
            {d.notdone&&<Text style={{fontSize:9,color:C.danger,fontWeight:'900'}}>✕</Text>}
            {d.remark&&<Text style={{fontSize:9}}>{d.remark.emoji}</Text>}
          </View>))}
        </View>
      </View>
      {remarkDays.length>0&&(
        <View style={{paddingHorizontal:16,marginBottom:16}}>
          <Text style={st.secTitle}>💬 Recent Remarks</Text>
          {remarkDays.map((d,i)=>(
            <View key={i} style={{backgroundColor:C.card,borderRadius:12,padding:14,marginBottom:8,borderWidth:1.5,borderColor:C.border}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
                <Text style={{fontSize:28}}>{d.remark.emoji}</Text>
                <View style={{flex:1}}>
                  <Text style={{fontSize:12,color:C.textMuted,fontWeight:'600'}}>{getDateStr(d.key)}</Text>
                  {d.remark.note?<Text style={{fontSize:14,color:C.text,marginTop:2,fontWeight:'500'}}>{d.remark.note}</Text>:<Text style={{fontSize:13,color:C.textSub,marginTop:2,fontStyle:'italic'}}>No note added</Text>}
                </View>
                <View style={{backgroundColor:d.done?C.successPale:C.dangerPale,borderRadius:8,paddingHorizontal:8,paddingVertical:4}}><Text style={{fontSize:11,color:d.done?C.success:C.danger,fontWeight:'700'}}>{d.done?'✓ Done':'✕ Missed'}</Text></View>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={{paddingHorizontal:16,gap:10}}>
        <TouchableOpacity onPress={onEdit}><LinearGradient colors={[color,color+'CC']} style={{borderRadius:12,padding:16,alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'800',fontSize:15}}>✏️ Edit Habit</Text></LinearGradient></TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{backgroundColor:C.dangerPale,borderRadius:12,padding:16,alignItems:'center',borderWidth:1.5,borderColor:C.danger+'40'}}><Text style={{color:C.danger,fontWeight:'700',fontSize:14}}>🗑️ Delete Habit</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}
export default function App(){
  const [showSplash,setShowSplash]=useState(true);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [showMonthly,setShowMonthly]=useState(false);
  const [screen,setScreen]=useState('main');
  const [habits,setHabits]=useState([]);
  const [logs,setLogs]=useState({});
  const [moods,setMoods]=useState({});
  const [user,setUser]=useState({xp:0,name:'Champion'});
  const [goals,setGoals]=useState([]);
  const [remarks,setRemarks]=useState({});
  const [editHabit,setEditHabit]=useState(null);
  const [detailHabit,setDetailHabit]=useState(null);
  const [tab,setTab]=useState('home');
  useEffect(()=>{
    setupNotifications();
    Promise.all([Store.get('habits',[]),Store.get('logs',{}),Store.get('moods',{}),Store.get('user',{xp:0,name:'Champion'}),Store.get('goals',[]),Store.get('remarks',{}),Store.get('onboarded',false)]).then(([h,l,m,u,g,r,onboarded])=>{setHabits(h);setLogs(l);setMoods(m);setUser(u);setGoals(g);setRemarks(r);if(!onboarded)setShowOnboarding(true);});
  },[]);
  useEffect(()=>{
    const handler=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(showMonthly){setShowMonthly(false);return true;}
      if(screen==='addHabit'||screen==='habitDetail'){setScreen('main');setEditHabit(null);setDetailHabit(null);return true;}
      return false;
    });
    return()=>handler.remove();
  },[screen,showMonthly]);
  const reloadHabits=async()=>{const h=await Store.get('habits',[]);setHabits(h);};
  const deleteHabit=(id)=>{Alert.alert('Delete','Remove this habit?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{await cancelHabitAlarms(id);const nh=habits.filter(h=>h.id!==id);setHabits(nh);await Store.set('habits',nh);setScreen('main');setDetailHabit(null);}}]);};
  if(showSplash)return<SplashScreen onDone={()=>setShowSplash(false)}/>;
  if(showOnboarding)return<OnboardingScreen onDone={async()=>{await Store.set('onboarded',true);setShowOnboarding(false);}}/>;
  if(showMonthly)return<MonthlyCalendarScreen habits={habits} logs={logs} onBack={()=>setShowMonthly(false)}/>;
  const renderScreen=()=>{
    if(screen==='addHabit')return(<AddHabitScreen existing={editHabit} onBack={()=>{setScreen('main');setEditHabit(null);}} onSave={async()=>{await reloadHabits();setScreen('main');setEditHabit(null);}}/>);
    if(screen==='habitDetail'&&detailHabit)return(<HabitDetailScreen habit={detailHabit} logs={logs} remarks={remarks} onBack={()=>{setScreen('main');setDetailHabit(null);}} onEdit={()=>{setEditHabit(detailHabit);setScreen('addHabit');}} onDelete={()=>deleteHabit(detailHabit.id)}/>);
    return(
      <View style={{flex:1}}>
        {tab==='home'&&(<HomeScreen habits={habits} logs={logs} moods={moods} user={user} remarks={remarks} setUser={setUser} setLogs={setLogs} setMoods={setMoods} setRemarks={setRemarks} setHabits={setHabits} onAddHabit={()=>{setEditHabit(null);setScreen('addHabit');}} onHabitDetail={(h)=>{setDetailHabit(h);setScreen('habitDetail');}}/>)}
        {tab==='stats'&&<StatsScreen habits={habits} logs={logs} moods={moods} onMonthly={()=>setShowMonthly(true)}/>}
        {tab==='goals'&&<GoalsScreen goals={goals} setGoals={setGoals}/>}
        {tab==='profile'&&<ProfileScreen user={user} setUser={setUser} habits={habits} logs={logs} moods={moods} setHabits={setHabits} setLogs={setLogs} setMoods={setMoods}/>}
        <View style={st.tabBar}>
          {[{id:'home',e:'🏠',l:'Today'},{id:'stats',e:'📊',l:'Stats'},{id:'goals',e:'🎯',l:'Goals'},{id:'profile',e:'⚡',l:'Profile'}].map(t=>(<TouchableOpacity key={t.id} onPress={()=>setTab(t.id)} style={st.tabBtn}><View style={[st.tabInner,tab===t.id&&st.tabInnerActive]}><Text style={{fontSize:18}}>{t.e}</Text>{tab===t.id&&<Text style={st.tabLabel}>{t.l}</Text>}</View></TouchableOpacity>))}
        </View>
      </View>
    );
  };
  return(<View style={{flex:1,backgroundColor:C.bg}}><StatusBar style="dark"/>{renderScreen()}</View>);
}
const st=StyleSheet.create({
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',paddingHorizontal:16,paddingTop:56,paddingBottom:16},
  greeting:{fontSize:22,fontWeight:'900',color:C.text},
  dateTxt:{fontSize:13,color:C.textSub,marginTop:4},
  fab:{borderRadius:99,overflow:'hidden',elevation:6,shadowColor:'#6C3CE1',shadowOffset:{width:0,height:4},shadowOpacity:0.2,shadowRadius:8},
  fabGrad:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  fabTxt:{color:'#fff',fontSize:26,fontWeight:'700',marginTop:-2},
  quoteCard:{borderRadius:20,padding:16,minHeight:110,justifyContent:'space-between',elevation:6,shadowColor:'#6C3CE1',shadowOffset:{width:0,height:4},shadowOpacity:0.15,shadowRadius:12},
  quoteDecor:{fontSize:40,color:'rgba(255,255,255,0.25)',position:'absolute',top:4,left:12},
  quoteText:{fontSize:14,color:'#fff',fontWeight:'600',lineHeight:21,paddingTop:8},
  quoteAuthor:{fontSize:12,color:'rgba(255,255,255,0.70)',marginTop:6,fontWeight:'700'},
  quoteDots:{flexDirection:'row',gap:4,marginTop:8},
  dot:{width:5,height:5,borderRadius:3,backgroundColor:'rgba(255,255,255,0.35)'},
  dotActive:{width:14,backgroundColor:'#fff'},
  levelStrip:{backgroundColor:C.card,borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',elevation:3,shadowColor:'#6C3CE1',shadowOffset:{width:0,height:2},shadowOpacity:0.08,shadowRadius:8},
  levelBadge:{width:40,height:40,borderRadius:20,backgroundColor:C.primary,alignItems:'center',justifyContent:'center'},
  levelNum:{color:'#fff',fontSize:18,fontWeight:'900'},
  levelTitle:{fontSize:13,fontWeight:'800',color:C.text},
  levelXP:{fontSize:11,color:C.textSub},
  barBg:{height:8,backgroundColor:C.section,borderRadius:99,overflow:'hidden',marginVertical:4},
  barFill:{height:'100%',backgroundColor:C.primary,borderRadius:99},
  levelNext:{fontSize:10,color:C.textMuted},
  progressCard:{backgroundColor:C.card,borderRadius:20,padding:16,flexDirection:'row',alignItems:'center',gap:16,elevation:3,shadowColor:'#6C3CE1',shadowOffset:{width:0,height:2},shadowOpacity:0.08,shadowRadius:8},
  ringWrap:{width:80,height:80,alignItems:'center',justifyContent:'center'},
  ring:{width:80,height:80,borderRadius:40,borderWidth:7,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  ringPct:{fontSize:18,fontWeight:'900'},
  ringLbl:{fontSize:9,color:C.textSub,fontWeight:'600'},
  progressTitle:{fontSize:16,fontWeight:'800',color:C.text},
  progressSub:{fontSize:13,color:C.textSub,marginTop:2},
  allDone:{backgroundColor:C.successPale,borderRadius:99,paddingHorizontal:10,paddingVertical:4,marginTop:6,alignSelf:'flex-start'},
  allDoneTxt:{fontSize:12,color:C.success,fontWeight:'700'},
  moodBtn:{flex:1,alignItems:'center',paddingVertical:10,backgroundColor:C.card,borderRadius:14,borderWidth:1.5,borderColor:C.border,elevation:2},
  habitCard:{flexDirection:'row',alignItems:'center',borderRadius:20,padding:14,elevation:5,shadowColor:'#6C3CE1',shadowOffset:{width:0,height:4},shadowOpacity:0.12,shadowRadius:12},
  habitIconWrap:{width:46,height:46,borderRadius:14,backgroundColor:'rgba(255,255,255,0.25)',alignItems:'center',justifyContent:'center'},
  habitName:{fontSize:15,fontWeight:'800',color:'#fff'},
  habitStreak:{fontSize:11,color:'rgba(255,255,255,0.85)',fontWeight:'700'},
  habitAlarm:{fontSize:11,color:'rgba(255,255,255,0.80)',fontWeight:'600'},
  habitRest:{fontSize:11,color:'rgba(255,255,255,0.70)'},
  habitRemark:{fontSize:11,color:'rgba(255,255,255,0.90)',fontWeight:'600'},
  checkBtn:{marginLeft:10},
  check:{width:32,height:32,borderRadius:16,borderWidth:2.5,borderColor:'rgba(255,255,255,0.6)',alignItems:'center',justifyContent:'center'},
  checkDone:{backgroundColor:'rgba(255,255,255,0.9)',borderColor:'transparent'},
  empty:{alignItems:'center',paddingVertical:60},
  emptyTitle:{fontSize:20,fontWeight:'800',color:C.text,marginBottom:4,marginTop:12},
  emptySub:{fontSize:14,color:C.textSub},
  screenHeader:{paddingHorizontal:16,paddingTop:56,paddingBottom:30,borderBottomLeftRadius:28,borderBottomRightRadius:28,marginBottom:16},
  screenHeaderTitle:{fontSize:28,fontWeight:'900',color:'#fff'},
  screenHeaderSub:{fontSize:14,color:'rgba(255,255,255,0.75)',marginTop:4},
  headerAddBtn:{alignSelf:'flex-start',marginTop:12,backgroundColor:'rgba(255,255,255,0.25)',borderRadius:99,paddingHorizontal:16,paddingVertical:8},
  modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:56,paddingBottom:16},
  modalTitle:{fontSize:18,fontWeight:'900',color:'#fff'},
  closeBtn:{width:36,height:36,borderRadius:18,backgroundColor:'rgba(255,255,255,0.2)',alignItems:'center',justifyContent:'center'},
  closeTxt:{color:'#fff',fontSize:16,fontWeight:'700'},
  saveHdrBtn:{backgroundColor:'rgba(255,255,255,0.25)',paddingHorizontal:16,paddingVertical:8,borderRadius:99},
  saveHdrTxt:{color:'#fff',fontWeight:'800',fontSize:14},
  label:{fontSize:13,fontWeight:'800',color:C.textSub,textTransform:'uppercase',letterSpacing:0.8,marginBottom:8},
  inputWrap:{flexDirection:'row',alignItems:'center',backgroundColor:C.card,borderRadius:12,borderWidth:1.5,borderColor:C.border,paddingHorizontal:16,elevation:2},
  input:{flex:1,color:C.text,fontSize:16,paddingVertical:14,fontWeight:'600'},
  inputFull:{backgroundColor:C.section,borderRadius:12,borderWidth:1.5,borderColor:C.border,padding:14,color:C.text,fontSize:15,marginBottom:10,fontWeight:'500'},
  iconBtn:{width:48,height:48,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:C.card,borderWidth:1.5,borderColor:C.border},
  addAlarmBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:99},
  alarmRow:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:C.card,borderRadius:12,padding:14,marginTop:8,elevation:2},
  alarmEditBtn:{backgroundColor:C.section,paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  alarmDelBtn:{backgroundColor:C.dangerPale,paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  dayBtn:{flex:1,alignItems:'center',paddingVertical:10,backgroundColor:C.card,borderRadius:12,borderWidth:1.5,borderColor:C.border},
  overviewCard:{borderRadius:20,padding:14,alignItems:'center',elevation:3},
  breakdownCard:{flexDirection:'row',alignItems:'center',backgroundColor:C.card,borderRadius:20,padding:14,marginBottom:10,elevation:3},
  goalCard:{backgroundColor:C.card,borderRadius:20,padding:16,marginBottom:12,elevation:3,borderWidth:1.5,borderColor:C.border},
  nameInput:{backgroundColor:'rgba(255,255,255,0.25)',borderRadius:12,padding:10,color:'#fff',fontSize:20,fontWeight:'700',textAlign:'center',minWidth:160,marginBottom:10},
  statCard:{flex:1,backgroundColor:C.card,borderRadius:14,padding:10,alignItems:'center',elevation:3},
  tabBar:{flexDirection:'row',backgroundColor:C.card,borderTopWidth:1,borderTopColor:C.border,paddingBottom:Platform.OS==='ios'?24:8,paddingTop:8,elevation:8},
  tabBtn:{flex:1,alignItems:'center'},
  tabInner:{alignItems:'center',justifyContent:'center',paddingHorizontal:12,paddingVertical:6,borderRadius:20},
  tabInnerActive:{backgroundColor:C.primaryPale,flexDirection:'row',gap:6},
  tabLabel:{fontSize:12,color:C.primary,fontWeight:'700'},
  secTitle:{fontSize:16,fontWeight:'800',color:C.text,marginBottom:10},
});
