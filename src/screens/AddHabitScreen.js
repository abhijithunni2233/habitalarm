// src/screens/AddHabitScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert,
} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS, SPACING, RADIUS, SHADOW, HABIT_ICONS } from '../utils/theme';
import { Storage } from '../utils/storage';
import { scheduleHabitAlarm, cancelAllHabitAlarms } from '../utils/notifications';

const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmtAlarm(a) {
  const h=a.hour, m=String(a.minute).padStart(2,'0');
  const p=h>=12?'PM':'AM', dh=h===0?12:h>12?h-12:h;
  return `${dh}:${m} ${p}`;
}

export default function AddHabitScreen({ navigation, route }) {
  const existing = route.params?.habit;
  const onSave   = route.params?.onSave;

  const [name,     setName]     = useState(existing?.name  || '');
  const [icon,     setIcon]     = useState(existing?.icon  || '💪');
  const [color,    setColor]    = useState(existing?.color || COLORS.habitPalette[0]);
  const [restDays, setRestDays] = useState(existing?.restDays || []);
  const [alarms,   setAlarms]   = useState(existing?.alarms   || []);
  const [showPicker, setShowPicker] = useState(false);
  const [editIdx,    setEditIdx]    = useState(null);
  const [saving,     setSaving]     = useState(false);

  const toggleRest = (d) => {
    Haptics.selectionAsync();
    setRestDays(p => p.includes(d) ? p.filter(x=>x!==d) : [...p,d]);
  };

  const handleTimeConfirm = (date) => {
    setShowPicker(false);
    const alarm = { hour: date.getHours(), minute: date.getMinutes() };
    if (editIdx !== null) {
      const u=[...alarms]; u[editIdx]=alarm; setAlarms(u);
    } else setAlarms(p=>[...p,alarm]);
    setEditIdx(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required','Please enter a habit name.'); return; }
    setSaving(true);
    try {
      const habits = await Storage.getHabits();
      const habit  = {
        id: existing?.id || `h_${Date.now()}`,
        name: name.trim(), icon, color, restDays, alarms,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      await cancelAllHabitAlarms(habit.id);
      for (const a of alarms) await scheduleHabitAlarm(habit, a);
      if (existing) {
        await Storage.saveHabits(habits.map(h=>h.id===existing.id?habit:h));
      } else {
        await Storage.saveHabits([...habits, habit]);
      }
      onSave?.(); navigation.goBack();
    } catch { Alert.alert('Error','Failed to save.'); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <LinearGradient colors={[COLORS.primary, COLORS.primaryLight]} style={s.header} start={{x:0,y:0}} end={{x:1,y:0}}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{existing?'Edit Habit':'New Habit'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={s.saveBtn}>
          <Text style={s.saveBtnText}>{saving?'Saving…':'Save'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:60 }}>
        {/* Name */}
        <View style={s.sec}>
          <Text style={s.label}>Habit Name</Text>
          <View style={s.inputWrap}>
            <Text style={{ fontSize:22 }}>{icon}</Text>
            <TextInput
              style={s.input} value={name} onChangeText={setName}
              placeholder="e.g. Morning Run" placeholderTextColor={COLORS.textMuted}
              maxLength={40} autoFocus={!existing}
            />
          </View>
        </View>

        {/* Icon */}
        <View style={s.sec}>
          <Text style={s.label}>Icon</Text>
          <View style={s.iconGrid}>
            {HABIT_ICONS.map(ic=>(
              <TouchableOpacity key={ic} onPress={()=>{Haptics.selectionAsync();setIcon(ic);}}
                style={[s.iconBtn, icon===ic && { backgroundColor:color+'22', borderColor:color, borderWidth:2 }]}>
                <Text style={{ fontSize:24 }}>{ic}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color */}
        <View style={s.sec}>
          <Text style={s.label}>Card Color</Text>
          <View style={s.colorRow}>
            {COLORS.habitPalette.map(c=>(
              <TouchableOpacity key={c} onPress={()=>{Haptics.selectionAsync();setColor(c);}}
                style={[s.colorDot, { backgroundColor:c }, color===c && s.colorDotSel]}>
                {color===c && <Text style={{ color:'#fff', fontWeight:'900', fontSize:14 }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Alarms */}
        <View style={s.sec}>
          <View style={s.rowBetween}>
            <Text style={s.label}>⏰ Alarms</Text>
            <TouchableOpacity onPress={()=>{setEditIdx(null);setShowPicker(true);}} style={[s.addAlarmBtn,{backgroundColor:color}]}>
              <Text style={s.addAlarmText}>+ Add Alarm</Text>
            </TouchableOpacity>
          </View>
          {alarms.length===0 && <Text style={s.emptyHint}>No alarms yet. Phone will ring at set times.</Text>}
          {alarms.map((a,i)=>(
            <View key={i} style={s.alarmRow}>
              <Text style={[s.alarmTime,{color}]}>{fmtAlarm(a)}</Text>
              <Text style={s.alarmRepeat}>Daily</Text>
              <TouchableOpacity onPress={()=>{setEditIdx(i);setShowPicker(true);}} style={s.alarmEditBtn}>
                <Text style={s.alarmEditText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setAlarms(p=>p.filter((_,j)=>j!==i))} style={s.alarmDelBtn}>
                <Text style={s.alarmDelText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Rest days */}
        <View style={s.sec}>
          <Text style={s.label}>😴 Rest Days</Text>
          <View style={s.dayRow}>
            {DAY_LABELS.map((d,i)=>(
              <TouchableOpacity key={i} onPress={()=>toggleRest(i)}
                style={[s.dayBtn, restDays.includes(i) && { backgroundColor:COLORS.textMuted+'22', borderColor:COLORS.textMuted }]}>
                <Text style={[s.dayLabel, restDays.includes(i) && { color:COLORS.textSub }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {restDays.length>0 && <Text style={s.restInfo}>Resting: {restDays.map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}</Text>}
        </View>

        {/* Preview */}
        <View style={s.sec}>
          <Text style={s.label}>Preview</Text>
          <View style={[s.previewCard, { backgroundColor: color }]}>
            <View style={s.previewIconBg}><Text style={{fontSize:26}}>{icon}</Text></View>
            <View style={{ flex:1 }}>
              <Text style={s.previewName}>{name||'Habit Name'}</Text>
              {alarms.length>0 && <Text style={s.previewAlarm}>⏰ {alarms.map(fmtAlarm).join(' · ')}</Text>}
            </View>
            <View style={s.previewCircle} />
          </View>
        </View>
      </ScrollView>

      <DateTimePickerModal
        isVisible={showPicker} mode="time"
        onConfirm={handleTimeConfirm} onCancel={()=>setShowPicker(false)}
        is24Hour={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor: COLORS.bg },
  header: {
    flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    paddingHorizontal: SPACING.md, paddingTop:56, paddingBottom: SPACING.md,
  },
  backBtn:   { width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center' },
  backText:  { color:'#fff', fontSize:16, fontWeight:'700' },
  headerTitle:{ fontSize:18, fontWeight:'900', color:'#fff' },
  saveBtn:   { backgroundColor:'rgba(255,255,255,0.25)', paddingHorizontal:SPACING.md, paddingVertical:SPACING.sm, borderRadius:RADIUS.full },
  saveBtnText:{ color:'#fff', fontWeight:'800', fontSize:14 },

  scroll: { flex:1 },
  sec:    { paddingHorizontal: SPACING.md, marginTop: SPACING.lg },
  label:  { fontSize:13, fontWeight:'800', color: COLORS.textSub, textTransform:'uppercase', letterSpacing:0.8, marginBottom: SPACING.sm },
  rowBetween: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: SPACING.sm },

  inputWrap: {
    flexDirection:'row', alignItems:'center', backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md, borderWidth:1.5, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, ...SHADOW.sm,
  },
  input: { flex:1, color: COLORS.text, fontSize:16, paddingVertical: SPACING.md, marginLeft: SPACING.sm, fontWeight:'600' },

  iconGrid: { flexDirection:'row', flexWrap:'wrap', gap: SPACING.xs },
  iconBtn:  {
    width:50, height:50, borderRadius: RADIUS.md, alignItems:'center', justifyContent:'center',
    backgroundColor: COLORS.bgCard, borderWidth:1.5, borderColor: COLORS.border,
  },

  colorRow: { flexDirection:'row', flexWrap:'wrap', gap: SPACING.sm },
  colorDot: { width:38, height:38, borderRadius:19, alignItems:'center', justifyContent:'center' },
  colorDotSel: { borderWidth:3, borderColor:'#fff', ...SHADOW.sm },

  addAlarmBtn:  { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  addAlarmText: { color:'#fff', fontWeight:'700', fontSize:13 },
  emptyHint:    { fontSize:13, color: COLORS.textMuted, fontStyle:'italic' },
  alarmRow: {
    flexDirection:'row', alignItems:'center', gap: SPACING.sm,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.sm, ...SHADOW.sm,
  },
  alarmTime:    { flex:1, fontSize:20, fontWeight:'900' },
  alarmRepeat:  { fontSize:11, color: COLORS.textMuted },
  alarmEditBtn: { backgroundColor: COLORS.bgSection, paddingHorizontal: SPACING.sm, paddingVertical:4, borderRadius: RADIUS.sm },
  alarmEditText:{ color: COLORS.primary, fontWeight:'700', fontSize:12 },
  alarmDelBtn:  { backgroundColor: COLORS.dangerPale, paddingHorizontal: SPACING.sm, paddingVertical:4, borderRadius: RADIUS.sm },
  alarmDelText: { color: COLORS.danger, fontWeight:'700', fontSize:12 },

  dayRow: { flexDirection:'row', gap: SPACING.xs },
  dayBtn: {
    flex:1, alignItems:'center', paddingVertical: SPACING.sm,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    borderWidth:1.5, borderColor: COLORS.border,
  },
  dayLabel:  { fontSize:12, fontWeight:'800', color: COLORS.text },
  restInfo:  { fontSize:12, color: COLORS.textMuted, marginTop: SPACING.sm },

  previewCard: {
    flexDirection:'row', alignItems:'center', borderRadius: RADIUS.xl,
    padding: SPACING.md, gap: SPACING.sm, ...SHADOW.card,
  },
  previewIconBg:{ width:46, height:46, borderRadius:14, backgroundColor:'rgba(255,255,255,0.25)', alignItems:'center', justifyContent:'center' },
  previewName:  { fontSize:16, fontWeight:'800', color:'#fff' },
  previewAlarm: { fontSize:11, color:'rgba(255,255,255,0.80)', marginTop:3 },
  previewCircle:{ width:32, height:32, borderRadius:16, borderWidth:2.5, borderColor:'rgba(255,255,255,0.6)' },
});
