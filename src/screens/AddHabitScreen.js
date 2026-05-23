import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Platform, Animated, Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS, SHADOW, HABIT_ICONS } from '../utils/theme';
import { Storage } from '../utils/storage';
import { scheduleHabitAlarm, cancelAllHabitAlarms } from '../utils/notifications';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const HABIT_TYPES = [
  { id: 'checkmark',  label: 'Checkmark',  sub: 'Track yes or no per day',          icon: '✅' },
  { id: 'measurable', label: 'Measurable', sub: 'Track numbers, distance, or time', icon: '📊' },
];

const HABIT_DIRECTIONS = [
  { id: 'build', label: 'Build a Habit', icon: '📈', desc: 'Add a new positive routine. Daily completions build your streak.' },
  { id: 'quit',  label: 'Quit a Habit',  icon: '🚫', desc: 'Break a bad habit. Track the days you successfully avoid it.'   },
];

const UNITS = ['hr', 'min', 'km', 'mi', 'pages', 'glasses', 'reps', 'kcal', 'words', '$', 'Custom…'];

const CATEGORIES = [
  { id: 'art',       label: 'Art',       icon: '🎨' },
  { id: 'finances',  label: 'Finances',  icon: '💵' },
  { id: 'fitness',   label: 'Fitness',   icon: '🏋️' },
  { id: 'health',    label: 'Health',    icon: '❤️' },
  { id: 'nutrition', label: 'Nutrition', icon: '🍽️' },
  { id: 'social',    label: 'Social',    icon: '👥' },
  { id: 'study',     label: 'Study',     icon: '🎓' },
  { id: 'work',      label: 'Work',      icon: '💼' },
  { id: 'morning',   label: 'Morning',   icon: '☀️' },
  { id: 'day',       label: 'Day',       icon: '🌤️' },
  { id: 'evening',   label: 'Evening',   icon: '🌙' },
  { id: 'other',     label: 'Other',     icon: '···' },
];

function fmtAlarm(a) {
  const h = a.hour, m = String(a.minute).padStart(2, '0');
  const p = h >= 12 ? 'PM' : 'AM';
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh}:${m} ${p}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AddHabitScreen({ navigation, route }) {
  const existing = route.params?.habit;
  const onSave   = route.params?.onSave;

  // Wizard step
  const [step, setStep] = useState(1);

  // Step 1 — Type & Direction
  const [habitType,      setHabitType]      = useState(existing?.habitType      || 'checkmark');
  const [habitDirection, setHabitDirection] = useState(existing?.habitDirection || 'build');

  // Step 2 — Name / Icon / Color
  const [name,  setName]  = useState(existing?.name  || '');
  const [icon,  setIcon]  = useState(existing?.icon  || '💪');
  const [color, setColor] = useState(existing?.color || COLORS.habitPalette[0]);

  // Step 3 — Measurable extras
  const [unit,        setUnit]        = useState(existing?.unit        || 'km');
  const [customUnit,  setCustomUnit]  = useState(existing?.customUnit  || '');
  const [dailyTarget, setDailyTarget] = useState(existing?.dailyTarget ? String(existing.dailyTarget) : '');
  const [categories,  setCategories]  = useState(existing?.categories  || []);

  // Step 4 — Reminder
  const [reminderOn, setReminderOn] = useState(existing?.alarms?.length > 0);
  const [alarms,     setAlarms]     = useState(existing?.alarms || [{ hour: 9, minute: 0 }]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const [saving, setSaving] = useState(false);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const goNext = () => {
    Haptics.selectionAsync();
    let next = step + 1;
    // Checkmark skips step 3 (measurable config)
    if (step === 2 && habitType === 'checkmark') next = 4;
    setStep(next);
  };

  const goBack = () => {
    Haptics.selectionAsync();
    if (step === 1) { navigation.goBack(); return; }
    let prev = step - 1;
    if (step === 4 && habitType === 'checkmark') prev = 2;
    setStep(prev);
  };

  const canContinue = () => {
    if (step === 2) return name.trim().length > 0;
    return true;
  };

  const toggleCategory = (id) => {
    Haptics.selectionAsync();
    setCategories(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const handleTimeChange = (event, date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (date) {
      setAlarms([{ hour: date.getHours(), minute: date.getMinutes() }]);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter a habit name.'); return; }
    setSaving(true);
    try {
      const habits = await Storage.getHabits();
      const finalAlarms = reminderOn ? alarms : [];
      const habit = {
        id:            existing?.id || `h_${Date.now()}`,
        name:          name.trim(),
        icon,
        color,
        habitType,
        habitDirection,
        unit:          habitType === 'measurable' ? (unit === 'Custom…' ? customUnit : unit) : null,
        dailyTarget:   habitType === 'measurable' ? (dailyTarget ? parseFloat(dailyTarget) : null) : null,
        categories:    habitType === 'measurable' ? categories : [],
        restDays:      existing?.restDays || [],
        alarms:        finalAlarms,
        createdAt:     existing?.createdAt || new Date().toISOString(),
      };
      await cancelAllHabitAlarms(habit.id);
      for (const a of finalAlarms) await scheduleHabitAlarm(habit, a);
      if (existing) {
        await Storage.saveHabits(habits.map(h => h.id === existing.id ? habit : h));
      } else {
        await Storage.saveHabits([...habits, habit]);
      }
      onSave?.();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Step Renderers ──────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.stepContent}>
      <Text style={s.stepQuestion}>What kind of habit?</Text>

      {HABIT_TYPES.map(t => {
        const selected = habitType === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={[s.typeCard, selected && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' }]}
            onPress={() => { Haptics.selectionAsync(); setHabitType(t.id); }}
            activeOpacity={0.8}
          >
            <View style={[s.typeIconBox, { backgroundColor: selected ? COLORS.primary + '30' : COLORS.bgSection }]}>
              <Text style={{ fontSize: 22 }}>{t.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.typeLabel, selected && { color: COLORS.primary }]}>{t.label}</Text>
              <Text style={s.typeSub}>{t.sub}</Text>
            </View>
            <View style={[s.radioOuter, selected && { borderColor: COLORS.primary }]}>
              {selected && <View style={[s.radioInner, { backgroundColor: COLORS.primary }]} />}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Build / Quit toggle — shown for Checkmark */}
      {habitType === 'checkmark' && (
        <View style={s.directionSection}>
          <View style={s.directionToggleRow}>
            {HABIT_DIRECTIONS.map(d => {
              const active = habitDirection === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[s.directionBtn, active && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' }]}
                  onPress={() => { Haptics.selectionAsync(); setHabitDirection(d.id); }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 14, marginRight: 6 }}>{d.icon}</Text>
                  <Text style={[s.directionLabel, active && { color: COLORS.primary }]}>{d.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.directionDesc}>
            <Text style={{ fontSize: 13, marginRight: 6 }}>ℹ️</Text>
            <Text style={s.directionDescText}>
              {HABIT_DIRECTIONS.find(d => d.id === habitDirection)?.desc}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.stepContent}>
      <Text style={s.stepQuestion}>Name Your Habit</Text>

      {/* Icon preview + name input */}
      <View style={s.namePreviewBox}>
        <View style={[s.nameIconCircle, { backgroundColor: color + '30' }]}>
          <Text style={{ fontSize: 38 }}>{icon}</Text>
        </View>
        <TextInput
          style={s.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Morning Run"
          placeholderTextColor={COLORS.textMuted}
          maxLength={40}
          autoFocus={!existing}
          textAlign="center"
        />
        <View style={s.nameUnderline} />
      </View>

      <Text style={s.secLabel}>Select Icon</Text>
      <View style={s.iconGrid}>
        {HABIT_ICONS.map(ic => (
          <TouchableOpacity
            key={ic}
            onPress={() => { Haptics.selectionAsync(); setIcon(ic); }}
            style={[s.iconBtn, icon === ic && { backgroundColor: color + '22', borderColor: color, borderWidth: 2 }]}
          >
            <Text style={{ fontSize: 24 }}>{ic}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.secLabel, { marginTop: SPACING.lg }]}>Select Color</Text>
      <View style={s.colorRow}>
        {COLORS.habitPalette.map(c => (
          <TouchableOpacity
            key={c}
            onPress={() => { Haptics.selectionAsync(); setColor(c); }}
            style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotSel]}
          >
            {color === c && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.stepContent}>
      <Text style={s.stepQuestion}>How do you track it?</Text>

      <Text style={s.secLabel}>Unit</Text>
      <View style={s.unitRow}>
        {UNITS.map(u => {
          const sel = unit === u;
          return (
            <TouchableOpacity
              key={u}
              style={[s.unitChip, sel && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '20' }]}
              onPress={() => { Haptics.selectionAsync(); setUnit(u); }}
            >
              <Text style={[s.unitChipText, sel && { color: COLORS.primary, fontWeight: '800' }]}>{u}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {unit === 'Custom…' && (
        <TextInput
          style={s.customUnitInput}
          value={customUnit}
          onChangeText={setCustomUnit}
          placeholder="Enter custom unit…"
          placeholderTextColor={COLORS.textMuted}
          maxLength={20}
        />
      )}

      <Text style={[s.secLabel, { marginTop: SPACING.lg }]}>Daily target (optional)</Text>
      <View style={s.targetRow}>
        <TextInput
          style={s.targetInput}
          value={dailyTarget}
          onChangeText={setDailyTarget}
          placeholder="0"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="numeric"
          maxLength={8}
        />
        <Text style={[s.targetUnit, { color: COLORS.primary }]}>
          {unit === 'Custom…' ? (customUnit || 'unit') : unit}
        </Text>
      </View>
      <Text style={s.targetHint}>Leave empty to log any positive value.</Text>

      <View style={s.divider} />

      <Text style={s.secLabel}>Categories</Text>
      <View style={s.categoryGrid}>
        {CATEGORIES.map(cat => {
          const sel = categories.includes(cat.id);
          return (
            <TouchableOpacity
              key={cat.id}
              style={[s.categoryChip, sel && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '18' }]}
              onPress={() => toggleCategory(cat.id)}
            >
              <Text style={{ fontSize: 13, marginRight: 4 }}>{cat.icon}</Text>
              <Text style={[s.categoryLabel, sel && { color: COLORS.primary, fontWeight: '700' }]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={[s.categoryChip, { borderStyle: 'dashed' }]}>
          <Text style={[s.categoryLabel, { color: COLORS.primary }]}>+ Custom</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderStep4 = () => {
    const reminderTime = alarms[0] || { hour: 9, minute: 0 };
    return (
      <ScrollView style={s.stepScroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.stepContent}>
        <View style={s.reminderHeader}>
          <Text style={s.stepQuestion}>Set a Daily Reminder</Text>
          <TouchableOpacity
            style={[s.toggle, reminderOn && { backgroundColor: COLORS.primary }]}
            onPress={() => { Haptics.selectionAsync(); setReminderOn(p => !p); }}
            activeOpacity={0.8}
          >
            <View style={[s.toggleThumb, reminderOn && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>
        <Text style={s.reminderSubtext}>
          People who set reminders are 3× more likely to stick with their habits.
        </Text>

        {reminderOn && (
          <>
            <TouchableOpacity
              style={s.timeDisplayBox}
              onPress={() => {
                const d = new Date();
                d.setHours(reminderTime.hour, reminderTime.minute, 0);
                setPickerDate(d);
                setShowPicker(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={[s.timeDisplayText, { color: COLORS.primary }]}>
                {fmtAlarm(reminderTime)}
              </Text>
              <Text style={s.timeDisplayTap}>Tap to change</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.setTimeBtn, { borderColor: COLORS.primary }]}
              onPress={() => {
                const d = new Date();
                d.setHours(reminderTime.hour, reminderTime.minute, 0);
                setPickerDate(d);
                setShowPicker(true);
              }}
            >
              <Text style={[s.setTimeBtnText, { color: COLORS.primary }]}>+ Set This Time</Text>
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker
                value={pickerDate}
                mode="time"
                is24Hour={false}
                onChange={handleTimeChange}
              />
            )}

            <Text style={s.reminderNote}>
              More reminders can be added later from the habit settings.
            </Text>
          </>
        )}
      </ScrollView>
    );
  };

  // ─── Progress bar ────────────────────────────────────────────────────────────

  // For checkmark: 3 visual steps (skip step 3)
  // For measurable: 4 visual steps
  const visualTotal   = habitType === 'checkmark' ? 3 : 4;
  const visualCurrent = habitType === 'checkmark' && step === 4 ? 3 : step;

  // ─── Layout ──────────────────────────────────────────────────────────────────

  const isLastStep = step === TOTAL_STEPS;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} style={s.headerBackBtn}>
          <Text style={s.headerBackText}>{step === 1 ? '✕' : '←'}</Text>
        </TouchableOpacity>
        <View style={s.progressTrack}>
          {Array.from({ length: visualTotal }).map((_, i) => (
            <View key={i} style={s.progressSeg}>
              <View style={[s.progressFill, i < visualCurrent && { backgroundColor: COLORS.primary, width: '100%' }]} />
            </View>
          ))}
        </View>
      </View>

      {/* Steps */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      {/* Bottom CTA */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[
            s.continueBtn,
            { backgroundColor: canContinue() ? COLORS.primary : COLORS.bgCard },
            !canContinue() && { opacity: 0.45 },
          ]}
          onPress={isLastStep ? handleSave : goNext}
          disabled={!canContinue() || saving}
          activeOpacity={0.85}
        >
          <Text style={[s.continueBtnText, { color: canContinue() ? '#fff' : COLORS.textMuted }]}>
            {isLastStep ? (saving ? 'Saving…' : 'Save Habit') : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: COLORS.bg },

  // Header & progress
  header:             { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: SPACING.sm, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  headerBackBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.border },
  headerBackText:     { fontSize: 16, fontWeight: '700', color: COLORS.text },
  progressTrack:      { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg:        { flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.bgSection, overflow: 'hidden' },
  progressFill:       { height: '100%', width: '0%', borderRadius: 3 },

  // Shared step layout
  stepScroll:         { flex: 1 },
  stepContent:        { paddingHorizontal: SPACING.md, paddingTop: SPACING.xl, paddingBottom: 120 },
  stepQuestion:       { fontSize: 26, fontWeight: '900', color: COLORS.text, marginBottom: SPACING.xl, flex: 1 },
  secLabel:           { fontSize: 13, fontWeight: '800', color: COLORS.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm },

  // Step 1 — Type
  typeCard:           { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md, ...SHADOW.sm },
  typeIconBox:        { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeLabel:          { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  typeSub:            { fontSize: 12, color: COLORS.textMuted },
  radioOuter:         { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  radioInner:         { width: 11, height: 11, borderRadius: 6 },

  // Step 1 — Direction
  directionSection:   { marginTop: SPACING.md },
  directionToggleRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  directionBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard },
  directionLabel:     { fontSize: 13, fontWeight: '700', color: COLORS.text },
  directionDesc:      { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm },
  directionDescText:  { flex: 1, fontSize: 12, color: COLORS.textSub, lineHeight: 18 },

  // Step 2 — Name
  namePreviewBox:     { alignItems: 'center', marginBottom: SPACING.xl },
  nameIconCircle:     { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  nameInput:          { fontSize: 22, fontWeight: '800', color: COLORS.text, width: '80%', textAlign: 'center' },
  nameUnderline:      { height: 1.5, width: '80%', backgroundColor: COLORS.border, marginTop: 6 },

  // Step 2 — Icons & colors
  iconGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  iconBtn:            { width: 50, height: 50, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgCard, borderWidth: 1.5, borderColor: COLORS.border },
  colorRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  colorDot:           { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  colorDotSel:        { borderWidth: 3, borderColor: '#fff', ...SHADOW.sm },

  // Step 3 — Measurable
  unitRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  unitChip:           { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard },
  unitChipText:       { fontSize: 13, fontWeight: '600', color: COLORS.text },
  customUnitInput:    { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: COLORS.text, fontSize: 15, fontWeight: '600', marginTop: SPACING.sm },
  targetRow:          { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  targetInput:        { width: 120, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, color: COLORS.text, fontSize: 18, fontWeight: '700' },
  targetUnit:         { fontSize: 18, fontWeight: '700' },
  targetHint:         { fontSize: 12, color: COLORS.textMuted, marginTop: SPACING.xs, fontStyle: 'italic' },
  divider:            { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.lg },
  categoryGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  categoryChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgCard },
  categoryLabel:      { fontSize: 12, fontWeight: '600', color: COLORS.textSub },

  // Step 4 — Reminder
  reminderHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  toggle:             { width: 52, height: 30, borderRadius: 15, backgroundColor: COLORS.bgSection, justifyContent: 'center', paddingHorizontal: 3 },
  toggleThumb:        { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', ...SHADOW.sm },
  toggleThumbOn:      { alignSelf: 'flex-end' },
  reminderSubtext:    { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', marginBottom: SPACING.xl, lineHeight: 20 },
  timeDisplayBox:     { alignItems: 'center', backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, ...SHADOW.sm },
  timeDisplayText:    { fontSize: 52, fontWeight: '900', letterSpacing: -1 },
  timeDisplayTap:     { fontSize: 12, color: COLORS.textMuted, marginTop: SPACING.xs },
  setTimeBtn:         { borderWidth: 1.5, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, alignItems: 'center', marginBottom: SPACING.md },
  setTimeBtnText:     { fontSize: 15, fontWeight: '700' },
  reminderNote:       { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', fontStyle: 'italic', marginTop: SPACING.xl },

  // Bottom bar
  bottomBar:          { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: SPACING.md, paddingBottom: Platform.OS === 'ios' ? 36 : SPACING.lg, paddingTop: SPACING.sm, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  continueBtn:        { borderRadius: RADIUS.xl, paddingVertical: SPACING.md + 2, alignItems: 'center', ...SHADOW.sm },
  continueBtnText:    { fontSize: 17, fontWeight: '800' },
});
