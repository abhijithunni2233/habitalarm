import { Audio } from 'expo-av';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Animated, Dimensions, Platform, Modal, PanResponder, BackHandler, Linking } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidVisibility,
  AndroidNotificationSetting,
  TriggerType,
  RepeatFrequency,
  EventType,
} from '@notifee/react-native';

const { width } = Dimensions.get('window');

// Keep expo-notifications handler for iOS fallback banners
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function setupNotifications() {
  try {
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: 'habit-alarms',
        name: 'Habit Alarms',
        importance: AndroidImportance.HIGH,
        vibration: true,
        vibrationPattern: [0, 250, 250, 250],
        lights: true,
        lightColor: '#6C3CE1',
        sound: 'default',
      });
      await notifee.createChannel({
        id: 'high-priority-alarms',
        name: 'High Priority Alarms',
        importance: AndroidImportance.HIGH,
        vibration: true,
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        lights: true,
        lightColor: '#FF6B6B',
        bypassDnd: true,
        sound: 'default',
      });
    }
    await notifee.requestPermission();
    if (Platform.OS === 'android') await checkExactAlarmPermission();
    if (Device.isDevice) {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Android 12+ gates exact alarm scheduling behind a special-access toggle;
// without it, daily habit alarms silently degrade to inexact/batched delivery
// and fire at unpredictable times instead of the time the user picked.
async function checkExactAlarmPermission() {
  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.android?.alarm !== AndroidNotificationSetting.ENABLED) {
      Alert.alert(
        '⏰ Enable Exact Alarms',
        'To make sure habit alarms fire at exactly the time you set, allow Hadbit to schedule exact alarms.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => notifee.openAlarmPermissionSettings() },
        ]
      );
    }
  } catch (e) {}
}

async function scheduleFollowUpReminder(habitName) {
  try {
    const tonight = new Date();
    tonight.setHours(22, 0, 0, 0);
    if (tonight <= new Date()) return;
    await notifee.createTriggerNotification(
      {
        title: '💔 You skipped a priority habit',
        body: `"${habitName}" was skipped today. Show up tomorrow — don't break the chain! 💪`,
        android: { channelId: 'habit-alarms', importance: AndroidImportance.DEFAULT },
        ios: { sound: 'default' },
      },
      { type: TriggerType.TIMESTAMP, timestamp: tonight.getTime(), alarmManager: { allowWhileIdle: true } }
    );
  } catch (e) {}
}

async function scheduleAlarm(habit, alarm) {
  try {
    const id = `habit_${habit.id}_${alarm.hour}_${alarm.minute}`;
    await notifee.cancelTriggerNotification(id).catch(() => {});
    const isHigh = !!habit.highPriority;
    const channelId = isHigh ? 'high-priority-alarms' : 'habit-alarms';

    const now = new Date();
    const trigger = new Date();
    trigger.setHours(alarm.hour, alarm.minute, 0, 0);
    if (trigger <= now) trigger.setDate(trigger.getDate() + 1);

    await notifee.createTriggerNotification(
      {
        id,
        title: isHigh ? `⚡ ${habit.icon} ${habit.name}` : `⏰ ${habit.icon} ${habit.name}`,
        body: isHigh ? 'Your priority habit is calling. Act now!' : 'Time for your habit! Keep the streak going 🔥',
        data: {
          habitId: habit.id,
          habitName: habit.name,
          habitIcon: habit.icon || '⏰',
          isHighPriority: isHigh ? 'true' : 'false',
          streak: '0',
        },
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.ALARM,
          visibility: AndroidVisibility.PUBLIC,
          lightUpScreen: true,
          fullScreenAction: { id: 'default', launchActivity: 'in.xspare.hadbit.AlarmActivity' },
          pressAction: { id: 'default', launchActivity: 'default' },
          actions: [
            { title: '✅ Done Now', pressAction: { id: 'done_now', launchActivity: 'default' } },
            { title: '😔 Skip Today', pressAction: { id: 'skip_today', launchActivity: 'default' } },
          ],
          color: isHigh ? '#FF6B6B' : (habit.color || '#6C3CE1'),
        },
        ios: { sound: 'default', categoryId: 'habit' },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: trigger.getTime(),
        repeatFrequency: RepeatFrequency.DAILY,
        alarmManager: { allowWhileIdle: true },
      }
    );
  } catch (e) {}
}

async function cancelHabitAlarms(habitId) {
  try {
    const scheduled = await notifee.getTriggerNotifications();
    for (const { notification } of scheduled) {
      if (notification.id?.startsWith(`habit_${habitId}_`))
        await notifee.cancelTriggerNotification(notification.id);
    }
  } catch (e) {}
}

// Self-heal: cancel any scheduled alarm that no longer matches a habit's
// current configuration (deleted habit, edited/removed reminder, etc). Run
// once on app launch to clear stray alarms that could otherwise fire
// "out of nowhere" for a reminder the user no longer has set.
async function reconcileAlarms(habits) {
  try {
    const validIds = new Set();
    habits.forEach(h => {
      (h.alarms || []).forEach(a => validIds.add(`habit_${h.id}_${a.hour}_${a.minute}`));
    });
    const scheduled = await notifee.getTriggerNotifications();
    for (const { notification } of scheduled) {
      const id = notification.id || '';
      if (id.startsWith('habit_') && !validIds.has(id)) {
        await notifee.cancelTriggerNotification(id).catch(() => {});
      }
    }
  } catch (e) {}
}

async function playTick() {
  try {
    const { sound } = await Audio.Sound.createAsync(
      require('./assets/tick.mp3')
    );
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) sound.unloadAsync();
    });
  } catch (e) {}
}

async function playApplause() {
  try {
    const { sound } = await Audio.Sound.createAsync(
      require('./assets/applause.mp3')
    );
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) sound.unloadAsync();
    });
  } catch (e) {}
}

const C = {
  bg: '#F4F2FF',
  card: '#FFFFFF',
  section: '#EAE6FF',
  border: '#E2DCF8',
  primary: '#6C3CE1',
  primaryLight: '#8B5CF6',
  primaryPale: '#EDE9FF',
  text: '#1A1040',
  textSub: '#6B6490',
  textMuted: '#B0A8CC',
  success: '#06D6A0',
  successPale: '#E6FBF5',
  danger: '#FF6B6B',
  dangerPale: '#FFF0F0',
  gold: '#F4A021',
  goldPale: '#FFF7E6',
  mood1: '#FF6B6B',
  mood2: '#FF8C42',
  mood3: '#FFD93D',
  mood4: '#8BCE6C',
  mood5: '#06D6A0',
  palette: ['#4F8EF7', '#FF8C42', '#9B5DE5', '#FF6B9D', '#06D6A0', '#F4A021', '#4CC9F0', '#F72585', '#43AA8B', '#E76F51'],
};

const ICONS = ['💪','🏃','📚','💧','🧘','🎯','💤','🥗','🎵','✍️','🧠','❤️','🌅','🚴','🏋️','🎨','📱','💊','🌿','☕','🦷','🧹','💰','🙏'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const REMARK_EMOJIS = ['🔥','💪','😊','⭐','🎯','✨','🙏','😤','💧','🌟','😅','❤️'];
const QUOTES = [
  { text: "Small daily improvements lead to stunning results.", author: "Robin Sharma" },
  { text: "We are what we repeatedly do. Excellence is a habit.", author: "Aristotle" },
  { text: "Motivation gets you started. Habit keeps you going.", author: "Jim Ryun" },
  { text: "The secret of your future is hidden in your daily routine.", author: "Mike Murdock" },
  { text: "Habits are the compound interest of self-improvement.", author: "James Clear" },
  { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
  { text: "You don't rise to your goals, you fall to your systems.", author: "James Clear" },
  { text: "The chains of habit are too light to be felt until too heavy to be broken.", author: "Warren Buffett" },
  { text: "Successful people are simply those with successful habits.", author: "Brian Tracy" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "🧠 Fact: It takes 66 days on average to form a new habit, not 21.", author: "UCL Research" },
  { text: "🧠 Fact: Exercise boosts brain function and memory by up to 20%.", author: "Neuroscience" },
  { text: "🧠 Fact: People who write goals are 42% more likely to achieve them.", author: "Dr. Gail Matthews" },
  { text: "🧠 Fact: Just 10 minutes of meditation reduces anxiety and improves focus.", author: "Harvard Study" },
  { text: "🧠 Fact: Gratitude journaling 5 min/day increases happiness by 25%.", author: "Psychology Research" },
  { text: "🧠 Fact: Walking 30 min a day reduces heart disease risk by 35%.", author: "WHO" },
  { text: "🧠 Fact: Drinking water first thing boosts metabolism by 24%.", author: "Health Research" },
  { text: "🧠 Fact: Sleep deprivation affects performance like being drunk.", author: "Sleep Foundation" },
  { text: "മനുഷ്യനെ മനുഷ്യനായി കാണാൻ പഠിക്കുന്നിടത്താണ് മനുഷ്യത്വം വളരുക, അതാണ് ഏറ്റവും നല്ല ഒരു കഴിവ്.", author: "അഭിജിത് പൊയ്യ" },
];

const LEVELS = [
  { level: 1, xp: 0, title: 'Beginner' },
  { level: 2, xp: 100, title: 'Apprentice' },
  { level: 3, xp: 250, title: 'Practitioner' },
  { level: 4, xp: 500, title: 'Journeyman' },
  { level: 5, xp: 900, title: 'Expert' },
  { level: 6, xp: 1400, title: 'Master' },
  { level: 7, xp: 2000, title: 'Champion' },
  { level: 8, xp: 3000, title: 'Legend' },
  { level: 9, xp: 5000, title: 'Mythic' },
  { level: 10, xp: 8000, title: 'Transcendent' },
];

function getLevelInfo(xp) {
  let current = LEVELS[0], next = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
      break;
    }
  }
  return { current, next, progress: next ? (xp - current.xp) / (next.xp - current.xp) : 1 };
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysKey(dateKey, n) {
  const d = new Date(dateKey + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateStr(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return `${DAYS[date.getDay()]}, ${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function getStreak(logs, id) {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (logs[key] && logs[key][id]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getRate(logs, id, days = 7) {
  let count = 0;
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (logs[key] && logs[key][id]) count++;
  }
  return Math.round((count / days) * 100);
}

// Overall consistency % across all habits over the trailing window, rest-day aware.
function getConsistency(habits, logs, days) {
  if (habits.length === 0) return 0;
  let totalDone = 0, totalActive = 0;
  const today = getTodayKey();
  for (let i = 0; i < days; i++) {
    const key = addDaysKey(today, -i);
    const { done, active } = getDayCompletion(habits, logs, key);
    totalDone += done; totalActive += active;
  }
  return totalActive > 0 ? Math.round((totalDone / totalActive) * 100) : 0;
}

// Completion % for a single date, accounting for rest days and measurable targets
function getDayCompletion(habits, logs, dateKey) {
  const dayIdx = new Date(dateKey + 'T00:00:00').getDay();
  const active = habits.filter(h => !h.restDays?.includes(dayIdx));
  const done = active.filter(h => {
    const tl = logs[dateKey]?.[h.id];
    if (h.habitType === 'measurable') {
      const t = h.dailyTarget || null;
      return t ? (typeof tl === 'number' && tl >= t) : (typeof tl === 'number' && tl > 0);
    }
    return tl === true;
  }).length;
  const pct = active.length > 0 ? Math.round((done / active.length) * 100) : 0;
  return { done, active: active.length, pct };
}

function fmtAlarm(a) {
  const h = a.hour, m = String(a.minute).padStart(2, '0'), p = h >= 12 ? 'PM' : 'AM', dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh}:${m} ${p}`;
}

// ─── Nutrition: built-in food database (macros per stated serving) ───
// cal/protein/fat/carbs/fiber in grams (kcal for cal). Sourced from common USDA-style averages.
const FOOD_DB = [
  { name: 'Rice, cooked', serving: '100g', cal: 130, protein: 2.7, fat: 0.3, carbs: 28, fiber: 0.4 },
  { name: 'Chicken breast, cooked', serving: '100g', cal: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0 },
  { name: 'Egg', serving: '1 large', cal: 78, protein: 6, fat: 5, carbs: 0.6, fiber: 0 },
  { name: 'Banana', serving: '1 medium', cal: 105, protein: 1.3, fat: 0.4, carbs: 27, fiber: 3.1 },
  { name: 'Apple', serving: '1 medium', cal: 95, protein: 0.5, fat: 0.3, carbs: 25, fiber: 4.4 },
  { name: 'Broccoli', serving: '100g', cal: 34, protein: 2.8, fat: 0.4, carbs: 7, fiber: 2.6 },
  { name: 'Oats, dry', serving: '100g', cal: 389, protein: 17, fat: 7, carbs: 66, fiber: 10 },
  { name: 'Milk', serving: '1 cup', cal: 149, protein: 8, fat: 8, carbs: 12, fiber: 0 },
  { name: 'Greek yogurt', serving: '170g', cal: 100, protein: 17, fat: 0.7, carbs: 6, fiber: 0 },
  { name: 'Almonds', serving: '28g', cal: 164, protein: 6, fat: 14, carbs: 6, fiber: 3.5 },
  { name: 'Bread, whole wheat', serving: '1 slice', cal: 69, protein: 3.6, fat: 1, carbs: 12, fiber: 1.9 },
  { name: 'Peanut butter', serving: '2 tbsp', cal: 188, protein: 8, fat: 16, carbs: 6, fiber: 2 },
  { name: 'Salmon, cooked', serving: '100g', cal: 208, protein: 20, fat: 13, carbs: 0, fiber: 0 },
  { name: 'Sweet potato', serving: '100g', cal: 86, protein: 1.6, fat: 0.1, carbs: 20, fiber: 3 },
  { name: 'Lentils / Dal, cooked', serving: '100g', cal: 116, protein: 9, fat: 0.4, carbs: 20, fiber: 8 },
  { name: 'Paneer', serving: '100g', cal: 265, protein: 18, fat: 20, carbs: 6, fiber: 0 },
  { name: 'Chapati / Roti', serving: '1 piece', cal: 104, protein: 3, fat: 2.5, carbs: 18, fiber: 2 },
  { name: 'Idli', serving: '1 piece', cal: 39, protein: 1.5, fat: 0.1, carbs: 8, fiber: 0.4 },
  { name: 'Dosa', serving: '1 piece', cal: 133, protein: 3, fat: 3.7, carbs: 22, fiber: 1 },
  { name: 'Curd / Plain yogurt', serving: '100g', cal: 61, protein: 3.5, fat: 3.3, carbs: 4.7, fiber: 0 },
  { name: 'Spinach', serving: '100g', cal: 23, protein: 2.9, fat: 0.4, carbs: 3.6, fiber: 2.2 },
  { name: 'Avocado', serving: '100g', cal: 160, protein: 2, fat: 15, carbs: 9, fiber: 7 },
  { name: 'Orange', serving: '1 medium', cal: 62, protein: 1.2, fat: 0.2, carbs: 15, fiber: 3.1 },
  { name: 'Potato, boiled', serving: '100g', cal: 87, protein: 1.9, fat: 0.1, carbs: 20, fiber: 1.8 },
  { name: 'Pasta, cooked', serving: '100g', cal: 131, protein: 5, fat: 1.1, carbs: 25, fiber: 1.8 },
  { name: 'Cheese, cheddar', serving: '28g', cal: 113, protein: 7, fat: 9, carbs: 0.4, fiber: 0 },
  { name: 'Tofu', serving: '100g', cal: 76, protein: 8, fat: 4.8, carbs: 1.9, fiber: 0.3 },
  { name: 'Beef, cooked', serving: '100g', cal: 250, protein: 26, fat: 15, carbs: 0, fiber: 0 },
  { name: 'Cashews', serving: '28g', cal: 157, protein: 5, fat: 12, carbs: 9, fiber: 0.9 },
  { name: 'Walnuts', serving: '28g', cal: 185, protein: 4.3, fat: 18, carbs: 3.9, fiber: 1.9 },
  { name: 'Black coffee', serving: '1 cup', cal: 2, protein: 0.3, fat: 0, carbs: 0, fiber: 0 },
  { name: 'Butter', serving: '1 tbsp', cal: 102, protein: 0.1, fat: 11.5, carbs: 0, fiber: 0 },
  { name: 'Olive oil', serving: '1 tbsp', cal: 119, protein: 0, fat: 14, carbs: 0, fiber: 0 },
  { name: 'Honey', serving: '1 tbsp', cal: 64, protein: 0.1, fat: 0, carbs: 17, fiber: 0 },
  { name: 'Watermelon', serving: '100g', cal: 30, protein: 0.6, fat: 0.2, carbs: 8, fiber: 0.4 },
  { name: 'Cucumber', serving: '100g', cal: 15, protein: 0.7, fat: 0.1, carbs: 3.6, fiber: 0.5 },
  { name: 'Tomato', serving: '100g', cal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, fiber: 1.2 },
  { name: 'Carrot', serving: '100g', cal: 41, protein: 0.9, fat: 0.2, carbs: 10, fiber: 2.8 },
  { name: 'Chickpeas, cooked', serving: '100g', cal: 164, protein: 9, fat: 2.6, carbs: 27, fiber: 8 },
  { name: 'Kidney beans, cooked', serving: '100g', cal: 127, protein: 8.7, fat: 0.5, carbs: 22.8, fiber: 6.4 },
  { name: 'Quinoa, cooked', serving: '100g', cal: 120, protein: 4.4, fat: 1.9, carbs: 21, fiber: 2.8 },
  { name: 'Soda / Cola', serving: '330ml can', cal: 139, protein: 0, fat: 0, carbs: 35, fiber: 0 },
  { name: 'French fries', serving: '100g', cal: 312, protein: 3.4, fat: 15, carbs: 41, fiber: 3.8 },
  // Kerala cuisine — estimates for typical home-style preparation; actual macros vary by recipe/oil used.
  { name: 'Puttu', serving: '1 cup (100g)', cal: 130, protein: 2.5, fat: 1, carbs: 28, fiber: 1.5 },
  { name: 'Kadala curry', serving: '1 cup (150g)', cal: 180, protein: 8, fat: 7, carbs: 22, fiber: 7 },
  { name: 'Appam / Vellappam', serving: '1 piece', cal: 120, protein: 2, fat: 2, carbs: 23, fiber: 0.5 },
  { name: 'Kerala parotta', serving: '1 piece', cal: 280, protein: 5, fat: 12, carbs: 38, fiber: 1.5 },
  { name: 'Idiyappam / String hoppers', serving: '1 piece', cal: 90, protein: 1.8, fat: 0.3, carbs: 20, fiber: 0.5 },
  { name: 'Sambar', serving: '1 cup (200g)', cal: 120, protein: 6, fat: 3, carbs: 18, fiber: 5 },
  { name: 'Rasam', serving: '1 cup (200g)', cal: 60, protein: 2, fat: 1.5, carbs: 10, fiber: 1.5 },
  { name: 'Avial', serving: '1 cup (150g)', cal: 150, protein: 4, fat: 9, carbs: 15, fiber: 4 },
  { name: 'Cabbage thoran', serving: '100g', cal: 90, protein: 2.5, fat: 6, carbs: 8, fiber: 3 },
  { name: 'Beans thoran', serving: '100g', cal: 95, protein: 3, fat: 6, carbs: 9, fiber: 3.5 },
  { name: 'Olan', serving: '1 cup (150g)', cal: 110, protein: 2, fat: 8, carbs: 9, fiber: 2 },
  { name: 'Kerala fish curry (meen curry)', serving: '150g', cal: 220, protein: 20, fat: 13, carbs: 6, fiber: 1 },
  { name: 'Fish fry (meen varuthathu)', serving: '100g', cal: 220, protein: 22, fat: 14, carbs: 4, fiber: 0.5 },
  { name: 'Nadan chicken curry', serving: '150g', cal: 260, protein: 22, fat: 17, carbs: 6, fiber: 1 },
  { name: 'Beef ularthiyathu (beef fry)', serving: '100g', cal: 280, protein: 24, fat: 19, carbs: 4, fiber: 0.5 },
  { name: 'Egg curry, Kerala style', serving: '150g', cal: 180, protein: 9, fat: 13, carbs: 6, fiber: 1 },
  { name: 'Kappa (tapioca), boiled', serving: '100g', cal: 160, protein: 1.4, fat: 0.3, carbs: 38, fiber: 1.8 },
  { name: 'Semiya payasam', serving: '1 cup (200g)', cal: 250, protein: 5, fat: 8, carbs: 40, fiber: 0.5 },
  { name: 'Ada pradhaman', serving: '1 cup (200g)', cal: 320, protein: 4, fat: 12, carbs: 50, fiber: 1 },
  { name: 'Palada payasam', serving: '1 cup (200g)', cal: 280, protein: 6, fat: 9, carbs: 44, fiber: 0.3 },
  { name: 'Banana chips (upperi)', serving: '30g', cal: 160, protein: 1, fat: 10, carbs: 17, fiber: 1.5 },
  { name: 'Sharkara varatti', serving: '30g', cal: 140, protein: 0.8, fat: 6, carbs: 22, fiber: 1 },
  { name: 'Pazham pori (banana fritter)', serving: '1 piece', cal: 150, protein: 1.5, fat: 8, carbs: 19, fiber: 1 },
  { name: 'Unniyappam', serving: '1 piece', cal: 80, protein: 1, fat: 3, carbs: 13, fiber: 0.5 },
  { name: 'Pulissery / Moru curry', serving: '1 cup (200g)', cal: 100, protein: 4, fat: 5, carbs: 10, fiber: 1.5 },
  { name: 'Erissery', serving: '1 cup (150g)', cal: 140, protein: 4, fat: 6, carbs: 18, fiber: 4 },
  { name: 'Kalan', serving: '1 cup (150g)', cal: 130, protein: 4, fat: 7, carbs: 14, fiber: 2 },
  { name: 'Coconut chutney', serving: '2 tbsp', cal: 70, protein: 1, fat: 6, carbs: 3, fiber: 1.5 },
  { name: 'Puzhukku (mixed root veg)', serving: '150g', cal: 160, protein: 3, fat: 6, carbs: 24, fiber: 4 },
  { name: 'Karimeen fry', serving: '100g', cal: 200, protein: 21, fat: 12, carbs: 3, fiber: 0.3 },
  { name: 'Prawns / Chemmeen curry', serving: '150g', cal: 190, protein: 18, fat: 10, carbs: 6, fiber: 1 },
  { name: 'Malabar biryani', serving: '1 plate (250g)', cal: 480, protein: 20, fat: 18, carbs: 58, fiber: 2 },
  { name: 'Neyyappam', serving: '1 piece', cal: 110, protein: 1, fat: 5, carbs: 15, fiber: 0.4 },
  { name: 'Chakka varattiyathu (jackfruit jam)', serving: '30g', cal: 90, protein: 0.5, fat: 1, carbs: 20, fiber: 1 },
  { name: 'Ela ada', serving: '1 piece', cal: 120, protein: 1.5, fat: 3, carbs: 22, fiber: 1 },
  { name: 'Kozhukatta', serving: '1 piece', cal: 70, protein: 1, fat: 2, carbs: 12, fiber: 0.8 },
  { name: 'Kerala kanji (rice porridge)', serving: '1 cup (200g)', cal: 110, protein: 2, fat: 0.5, carbs: 24, fiber: 0.5 },
  { name: 'Cherupayar curry (green gram)', serving: '150g', cal: 130, protein: 8, fat: 3, carbs: 18, fiber: 6 },
  { name: 'Beetroot pachadi', serving: '100g', cal: 80, protein: 2, fat: 4, carbs: 9, fiber: 2 },
  { name: 'Meen pollichathu', serving: '150g', cal: 230, protein: 22, fat: 14, carbs: 4, fiber: 0.5 },
];

const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise', mult: 1.2 },
  { id: 'light', label: 'Lightly active', desc: 'Exercise 1-3 days/week', mult: 1.375 },
  { id: 'moderate', label: 'Moderately active', desc: 'Exercise 3-5 days/week', mult: 1.55 },
  { id: 'active', label: 'Very active', desc: 'Exercise 6-7 days/week', mult: 1.725 },
  { id: 'veryActive', label: 'Extremely active', desc: 'Hard exercise + physical job', mult: 1.9 },
];

const NUTRITION_GOALS = [
  { id: 'lose', label: 'Lose weight', delta: -500 },
  { id: 'maintain', label: 'Maintain weight', delta: 0 },
  { id: 'gain', label: 'Gain weight', delta: 300 },
];

const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '🍛' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snack', label: 'Snack', icon: '🍎' },
];

// Mifflin-St Jeor BMR → TDEE → macro targets, adjusted for stated goal.
function calcNutritionTargets(profile) {
  if (!profile) return null;
  const { sex, age, heightCm, weightKg, activityLevel, goal } = profile;
  const bmr = sex === 'female'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const mult = ACTIVITY_LEVELS.find(a => a.id === activityLevel)?.mult || 1.375;
  const tdee = bmr * mult;
  const delta = NUTRITION_GOALS.find(g => g.id === goal)?.delta || 0;
  const calories = Math.round(tdee + delta);
  const protein = Math.round(weightKg * 1.6);
  const fat = Math.round((calories * 0.25) / 9);
  const proteinCal = protein * 4, fatCal = fat * 9;
  const carbs = Math.max(0, Math.round((calories - proteinCal - fatCal) / 4));
  const fiber = Math.round((calories / 1000) * 14);
  return { calories, protein, fat, carbs, fiber };
}

function sumNutrition(entries) {
  return (entries || []).reduce((acc, e) => ({
    cal: acc.cal + (e.cal || 0), protein: acc.protein + (e.protein || 0),
    fat: acc.fat + (e.fat || 0), carbs: acc.carbs + (e.carbs || 0), fiber: acc.fiber + (e.fiber || 0),
  }), { cal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
}

// How rich/oily a food is, derived from the % of its calories that come from fat —
// works for every item including custom entries, no manual tagging needed.
function getOilLevel(cal, fat) {
  if (!cal || cal <= 0) return null;
  const fatPct = Math.round((fat * 9 / cal) * 100);
  if (fatPct >= 45) return { label: 'High fat', emoji: '🔴', pct: fatPct };
  if (fatPct >= 25) return { label: 'Medium fat', emoji: '🟡', pct: fatPct };
  return { label: 'Low fat', emoji: '🟢', pct: fatPct };
}

// ─── AI Coach: calls the user's own free Gemini API key directly (no backend). ───
async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

function buildAICoachPrompt(habits, logs, moods, foodLog, bodyProfile) {
  const today = getTodayKey();
  const habitLines = habits.map(h => `- ${h.name}: ${getRate(logs, h.id, 7)}% done last 7 days, ${getStreak(logs, h.id)}-day current streak`).join('\n') || 'No habits tracked yet.';
  const moodVals = Object.values(moods).slice(-7);
  const avgMood = moodVals.length ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1) : 'n/a';
  const targets = calcNutritionTargets(bodyProfile);
  const todayFood = sumNutrition(foodLog?.[today]);
  const foodLine = targets
    ? `Today's food so far: ${Math.round(todayFood.cal)} kcal (target ${targets.calories}), protein ${Math.round(todayFood.protein)}g (target ${targets.protein}g), fat ${Math.round(todayFood.fat)}g (target ${targets.fat}g), carbs ${Math.round(todayFood.carbs)}g (target ${targets.carbs}g), fiber ${Math.round(todayFood.fiber)}g (target ${targets.fiber}g).`
    : 'No body profile / food log set up yet.';
  return `You are a supportive personal habit and nutrition coach. Based on this user's real data, give short, specific, encouraging advice.

HABITS (last 7 days):
${habitLines}

Average mood (last 7 entries, 1-5 scale): ${avgMood}

NUTRITION:
${foodLine}

Respond with two short sections:
1. "Do today" — 2-3 concrete, specific actions.
2. "Avoid today" — 1-2 things to watch out for or cut back on.
Keep the whole response under 130 words, plain text, no markdown headers, use simple dashes for bullets. Be warm but direct. This is general wellness guidance, not medical advice.`;
}

const Store = {
  async get(key, def) {
    try {
      const r = await AsyncStorage.getItem(key);
      return r ? JSON.parse(r) : def;
    } catch { return def; }
  },
  async set(key, val) {
    try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

// Any habit left unmarked by the end of a day is treated as skipped. Runs on
// every launch and walks the gap between the last run and yesterday, so days
// missed while the app was closed still get closed out. Never touches
// "today" (still in progress) and, on first run after this shipped, doesn't
// retroactively mark pre-existing blank history — it just starts tracking
// from tomorrow.
async function backfillMissedDays(habits, logs) {
  const today = getTodayKey();
  const yesterday = addDaysKey(today, -1);
  const lastDone = await Store.get('lastBackfillDate', null);

  if (!lastDone) {
    await Store.set('lastBackfillDate', yesterday);
    return null;
  }
  if (lastDone >= yesterday) return null;

  const nl = { ...logs };
  let changed = false;
  let cursor = lastDone;
  for (let i = 0; i < 60 && cursor < yesterday; i++) {
    cursor = addDaysKey(cursor, 1);
    const dayIdx = new Date(cursor + 'T00:00:00').getDay();
    const dayLogs = { ...(nl[cursor] || {}) };
    let dayChanged = false;
    habits.forEach(h => {
      if (h.createdAt && h.createdAt.slice(0, 10) > cursor) return;
      if (h.restDays?.includes(dayIdx)) return;
      if (dayLogs[h.id] === undefined) { dayLogs[h.id] = 'notdone'; dayChanged = true; }
    });
    if (dayChanged) { nl[cursor] = dayLogs; changed = true; }
  }
  await Store.set('lastBackfillDate', yesterday);
  if (!changed) return null;
  await Store.set('logs', nl);
  return nl;
}

// Handles notification actions when app is killed or in background
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { pressAction, notification } = detail;
  const habitId = notification?.data?.habitId;
  if (!habitId) return;

  if (type === EventType.ACTION_PRESS && pressAction?.id === 'done_now') {
    const [logs, user] = await Promise.all([Store.get('logs', {}), Store.get('user', { xp: 0 })]);
    const todayKey = getTodayKey();
    if (logs[todayKey]?.[habitId] === true) return;
    if (!logs[todayKey]) logs[todayKey] = {};
    logs[todayKey][habitId] = true;
    user.xp = (user.xp || 0) + 20;
    await Promise.all([Store.set('logs', logs), Store.set('user', user)]);
    await notifee.cancelNotification(notification.id);
  } else if (type === EventType.ACTION_PRESS && pressAction?.id === 'skip_today') {
    const [habits, user] = await Promise.all([Store.get('habits', []), Store.get('user', { xp: 0 })]);
    user.xp = Math.max(0, (user.xp || 0) - 15);
    await Store.set('user', user);
    const habit = habits.find(h => h.id === habitId);
    if (habit) await scheduleFollowUpReminder(habit.name);
    await notifee.cancelNotification(notification.id);
  }
});

// ─── BUG FIX: generateInsights moved BEFORE StyleSheet, as a proper top-level function ───
function generateInsights(habits, logs, moods) {
  if (habits.length === 0) return ["Start adding habits to get personalized insights!"];
  const insights = [];
  const streaks = habits.map(h => ({ name: h.name, streak: getStreak(logs, h.id), rate7: getRate(logs, h.id, 7) }));
  const best = streaks.reduce((a, b) => b.streak > a.streak ? b : a, streaks[0]);
  const worst = streaks.reduce((a, b) => b.rate7 < a.rate7 ? b : a, streaks[0]);
  if (best.streak >= 7) insights.push(`🏆 You're a champion at "${best.name}"! ${best.streak}-day streak shows real dedication.`);
  else if (best.streak >= 3) insights.push(`💪 "${best.name}" is your strongest habit with a ${best.streak}-day streak. Keep it up!`);
  else insights.push(`🌱 You're just getting started! Try to build a 7-day streak on any habit first.`);
  const avgRate = Math.round(streaks.reduce((a, b) => a + b.rate7, 0) / streaks.length);
  if (avgRate >= 80) insights.push(`⭐ Incredible! Your 7-day completion rate is ${avgRate}%. You're in the top tier of habit builders.`);
  else if (avgRate >= 50) insights.push(`📈 Your 7-day completion rate is ${avgRate}%. You're consistent — push for 80%!`);
  else insights.push(`🎯 Your 7-day completion rate is ${avgRate}%. Focus on just 1-2 habits to build momentum.`);
  if (worst.rate7 < 50 && habits.length > 1) insights.push(`⚠️ "${worst.name}" needs attention — only ${worst.rate7}% done this week.`);
  const moodVals = Object.values(moods);
  if (moodVals.length >= 3) {
    const avg = (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1);
    if (avg >= 4) insights.push(`😄 Your average mood is ${avg}/5 — you're thriving!`);
    else if (avg >= 3) insights.push(`😐 Your average mood is ${avg}/5. More habits usually improve mood.`);
    else insights.push(`😔 Your mood has been low (${avg}/5). Try adding a self-care or exercise habit.`);
  }
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  Object.entries(logs).forEach(([key, dayLogs]) => {
    const d = new Date(key);
    dayCounts[d.getDay()] += Object.values(dayLogs).filter(Boolean).length;
  });
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  if (Math.max(...dayCounts) > 0) insights.push(`📅 You perform best on ${DAYS[bestDayIdx]}s. Schedule important habits then.`);
  const totalDone = Object.values(logs).reduce((a, d) => a + Object.values(d).filter(Boolean).length, 0);
  if (totalDone >= 100) insights.push(`🎖️ You've completed ${totalDone} habits total. That's phenomenal discipline!`);
  else insights.push(`🚀 ${totalDone} habits completed so far. Every checkmark counts!`);
  if (avgRate >= 70 && best.streak >= 7) insights.push(`🧠 Personality: You're a "System Builder" — you thrive on routines.`);
  else if (avgRate >= 50) insights.push(`🧠 Personality: You're a "Steady Climber" — progress even when motivation dips.`);
  else insights.push(`🧠 Personality: You're an "Aspiring Achiever" — you have the vision, now build the system.`);
  return insights;
}

// ─── BUG FIX: StyleSheet now properly closed with }); ───
const st = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 58, paddingBottom: 8 },
  greeting: { fontSize: 26, fontWeight: '900', color: C.text },
  dateTxt: { fontSize: 13, color: C.textMuted, marginTop: 4 },
  fab: { borderRadius: 99, overflow: 'hidden', elevation: 6, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 12 },
  fabGrad: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  fabTxt: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: -2 },
  quoteCard: { borderRadius: 22, padding: 18, minHeight: 110, justifyContent: 'space-between', elevation: 4, shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.20, shadowRadius: 16 },
  quoteDecor: { fontSize: 40, color: 'rgba(255,255,255,0.25)', position: 'absolute', top: 4, left: 12 },
  quoteText: { fontSize: 14, color: '#fff', fontWeight: '600', lineHeight: 21, paddingTop: 8 },
  quoteAuthor: { fontSize: 12, color: 'rgba(255,255,255,0.70)', marginTop: 6, fontWeight: '700' },
  quoteDots: { flexDirection: 'row', gap: 4, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { width: 14, backgroundColor: '#fff' },
  levelStrip: { backgroundColor: C.card, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: C.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 12, borderWidth: 1, borderColor: C.border },
  levelBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  levelNum: { color: '#fff', fontSize: 18, fontWeight: '900' },
  levelTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  levelXP: { fontSize: 11, color: C.textSub },
  barBg: { height: 6, backgroundColor: C.section, borderRadius: 99, overflow: 'hidden', marginVertical: 4 },
  barFill: { height: '100%', backgroundColor: C.primary, borderRadius: 99 },
  levelNext: { fontSize: 10, color: C.textMuted },
  progressCard: { backgroundColor: C.card, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16, elevation: 2, shadowColor: C.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 12, borderWidth: 1, borderColor: C.border },
  ringWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 80, height: 80, borderRadius: 40, borderWidth: 7, borderColor: C.section, alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 20, fontWeight: '900' },
  ringLbl: { fontSize: 9, color: C.textSub, fontWeight: '600' },
  progressTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  progressSub: { fontSize: 13, color: C.textSub, marginTop: 2 },
  allDone: { backgroundColor: C.successPale, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6, alignSelf: 'flex-start' },
  allDoneTxt: { fontSize: 12, color: C.success, fontWeight: '700' },
  moodBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, elevation: 1, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  habitCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, backgroundColor: C.card, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, borderWidth: 1, borderColor: C.border },
  habitIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  habitName: { fontSize: 15, fontWeight: '800', color: C.text },
  habitStreak: { fontSize: 11, color: C.textSub, fontWeight: '700' },
  habitAlarm: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  habitRest: { fontSize: 11, color: C.textMuted },
  habitRemark: { fontSize: 11, color: C.textSub, fontWeight: '600' },
  checkBtn: { marginLeft: 10 },
  check: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkDone: { borderColor: 'transparent' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 4, marginTop: 12 },
  emptySub: { fontSize: 14, color: C.textSub },
  screenHeader: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, marginBottom: 16 },
  screenHeaderTitle: { fontSize: 28, fontWeight: '900', color: '#fff' },
  screenHeaderSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  headerAddBtn: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saveHdrBtn: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99 },
  saveHdrTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, elevation: 2 },
  input: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 14, fontWeight: '600' },
  inputFull: { backgroundColor: C.section, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, padding: 14, color: C.text, fontSize: 15, marginBottom: 10, fontWeight: '500' },
  iconBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  addAlarmBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
  alarmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 12, padding: 14, marginTop: 8, elevation: 2 },
  alarmEditBtn: { backgroundColor: C.section, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  alarmDelBtn: { backgroundColor: C.dangerPale, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dayBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
  overviewCard: { borderRadius: 20, padding: 14, alignItems: 'center', elevation: 3 },
  breakdownCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 10, elevation: 3 },
  goalCard: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 12, elevation: 3, borderWidth: 1.5, borderColor: C.border },
  nameInput: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, padding: 10, color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', minWidth: 160, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 10, alignItems: 'center', elevation: 3 },
  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8, elevation: 8 },
  tabBtn: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabInnerActive: { backgroundColor: C.primaryPale, flexDirection: 'row', gap: 6 },
  tabLabel: { fontSize: 12, color: C.primary, fontWeight: '700' },
  secTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 10 },
});
// ─── END StyleSheet ───

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  sheetHeader: { padding: 20, paddingTop: 24 },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  sheetSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  body: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: C.section, alignItems: 'center', justifyContent: 'center' },
  noteInput: { backgroundColor: C.section, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, padding: 14, color: C.text, fontSize: 15, minHeight: 60 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  skipBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: C.section, justifyContent: 'center' },
  skipTxt: { color: C.textSub, fontWeight: '700' },
  saveBtn: { borderRadius: 12, padding: 14, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

const nd = StyleSheet.create({
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonBtn: { width: '31%', paddingVertical: 12, borderRadius: 12, backgroundColor: C.section, borderWidth: 1.5, borderColor: C.section, alignItems: 'center', gap: 4 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: C.textSub, textAlign: 'center' },
});

function SplashScreen({ onDone }) {
  const wave1 = useRef(new Animated.Value(0)).current, wave2 = useRef(new Animated.Value(0)).current, wave3 = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0)).current, logoOpacity = useRef(new Animated.Value(0)).current, textOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(wave1, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(wave2, { toValue: 1, duration: 800, delay: 100, useNativeDriver: true }),
        Animated.timing(wave3, { toValue: 1, duration: 1000, delay: 200, useNativeDriver: true }),
      ]),
    ]).start(() => setTimeout(onDone, 400));
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {[wave1, wave2, wave3].map((w, i) => (
        <Animated.View key={i} style={{ position: 'absolute', width: width * 3, height: width * 3, borderRadius: width * 1.5, backgroundColor: `rgba(255,255,255,${0.05 - i * 0.01})`, transform: [{ scale: w.interpolate({ inputRange: [0, 1], outputRange: [0, 2.5] }) }], opacity: w.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 0] }) }} />
      ))}
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center' }}>
        <Text style={{ fontSize: 80, marginBottom: 16 }}>⚡</Text>
        <Animated.Text style={{ fontSize: 32, fontWeight: '900', color: '#fff', opacity: textOpacity }}>HabitAlarm</Animated.Text>
        <Animated.Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 8, opacity: textOpacity }}>Build habits. Change your life.</Animated.Text>
      </Animated.View>
    </View>
  );
}

function OnboardingScreen({ onDone }) {
  const [page, setPage] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const slides = [
    { emoji: '🏆', title: 'Build Amazing Habits', desc: 'Track your daily habits, build streaks and level up your life one day at a time.', color: '#6C3CE1' },
    { emoji: '⏰', title: 'Never Miss a Day', desc: 'Set alarms for each habit. Your phone reminds you at the exact time every day.', color: '#FF6B9D' },
    { emoji: '📊', title: 'See Your Progress', desc: 'Track streaks, view 30-day history, earn XP and unlock badges as you grow.', color: '#06D6A0' },
  ];
  const next = () => {
    if (page === slides.length - 1) { onDone(); return; }
    Animated.timing(slideAnim, { toValue: -width, duration: 300, useNativeDriver: true }).start(() => {
      slideAnim.setValue(width);
      setPage(p => p + 1);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 8 }).start();
    });
  };
  const s = slides[page];
  return (
    <View style={{ flex: 1, backgroundColor: s.color }}>
      <StatusBar style="light" />
      <TouchableOpacity onPress={onDone} style={{ position: 'absolute', top: 56, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Skip</Text>
      </TouchableOpacity>
      <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, transform: [{ translateX: slideAnim }] }}>
        <Text style={{ fontSize: 100, marginBottom: 32 }}>{s.emoji}</Text>
        <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 16 }}>{s.title}</Text>
        <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 24 }}>{s.desc}</Text>
      </Animated.View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
        {slides.map((_, i) => <View key={i} style={{ width: i === page ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? '#fff' : 'rgba(255,255,255,0.4)' }} />)}
      </View>
      <TouchableOpacity onPress={next} style={{ marginHorizontal: 32, marginBottom: 48, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{page === slides.length - 1 ? "Let's Start! 🚀" : 'Next →'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function RemarkModal({ visible, habitName, habitColor, existingRemark, onSave, onClose }) {
  const [emoji, setEmoji] = useState(existingRemark?.emoji || '🔥');
  const [note, setNote] = useState(existingRemark?.note || '');
  useEffect(() => {
    if (visible) { setEmoji(existingRemark?.emoji || '🔥'); setNote(existingRemark?.note || ''); }
  }, [visible]);
  const save = () => { onSave({ emoji, note: note.trim() }); onClose(); };
  const color = habitColor || C.primary;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={rm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={rm.sheet}>
          <LinearGradient colors={[color, C.primaryLight]} style={rm.sheetHeader}>
            <Text style={rm.sheetTitle}>✅ Great job!</Text>
            <Text style={rm.sheetSub}>Add a remark for <Text style={{ fontWeight: '900' }}>{habitName}</Text></Text>
          </LinearGradient>
          <View style={rm.body}>
            <Text style={rm.label}>How did it feel?</Text>
            <View style={rm.emojiRow}>
              {REMARK_EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => { Haptics.selectionAsync(); setEmoji(e); }} style={[rm.emojiBtn, emoji === e && { backgroundColor: color + '22', borderColor: color, borderWidth: 2 }]}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[rm.label, { marginTop: 16 }]}>Note (optional)</Text>
            <TextInput style={rm.noteInput} value={note} onChangeText={setNote} placeholder="e.g. Felt great today!" placeholderTextColor={C.textMuted} maxLength={100} multiline />
            <View style={rm.btnRow}>
              <TouchableOpacity onPress={onClose} style={rm.skipBtn}><Text style={rm.skipTxt}>Skip</Text></TouchableOpacity>
              <TouchableOpacity onPress={save} style={{ flex: 1 }}>
                <LinearGradient colors={[color, C.primaryLight]} style={rm.saveBtn}>
                  <Text style={rm.saveTxt}>Save Remark</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const NOT_DONE_REASONS = [
  { emoji: '😴', label: 'Too tired' },
  { emoji: '⏰', label: 'No time' },
  { emoji: '🤒', label: 'Sick' },
  { emoji: '😑', label: 'Forgot' },
  { emoji: '🙅', label: 'Not feeling it' },
  { emoji: '❓', label: 'Other' },
];

function NotDoneModal({ visible, habitName, habitColor, existingRemark, onSave, onClose }) {
  const [reasonIdx, setReasonIdx] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (visible) {
      const existingLabel = existingRemark?.note?.split(' · ')[0];
      const idx = NOT_DONE_REASONS.findIndex(r => r.label === existingLabel);
      setReasonIdx(idx >= 0 ? idx : 0);
      setNote(idx >= 0 ? existingRemark.note.split(' · ').slice(1).join(' · ') : '');
    }
  }, [visible]);
  const save = () => {
    const reason = NOT_DONE_REASONS[reasonIdx];
    const combinedNote = note.trim() ? `${reason.label} · ${note.trim()}` : reason.label;
    onSave({ emoji: reason.emoji, note: combinedNote });
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={rm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={rm.sheet}>
          <LinearGradient colors={[C.danger, '#FF8C42']} style={rm.sheetHeader}>
            <Text style={rm.sheetTitle}>😔 No worries</Text>
            <Text style={rm.sheetSub}>Why did you miss <Text style={{ fontWeight: '900' }}>{habitName}</Text>?</Text>
          </LinearGradient>
          <View style={rm.body}>
            <Text style={rm.label}>Quick reason</Text>
            <View style={nd.reasonGrid}>
              {NOT_DONE_REASONS.map((r, i) => (
                <TouchableOpacity key={r.label} onPress={() => { Haptics.selectionAsync(); setReasonIdx(i); }}
                  style={[nd.reasonBtn, reasonIdx === i && { backgroundColor: C.danger + '18', borderColor: C.danger, borderWidth: 2 }]}>
                  <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
                  <Text style={nd.reasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[rm.label, { marginTop: 16 }]}>Note (optional)</Text>
            <TextInput style={rm.noteInput} value={note} onChangeText={setNote} placeholder="Add more detail…" placeholderTextColor={C.textMuted} maxLength={100} multiline />
            <View style={rm.btnRow}>
              <TouchableOpacity onPress={onClose} style={rm.skipBtn}><Text style={rm.skipTxt}>Skip</Text></TouchableOpacity>
              <TouchableOpacity onPress={save} style={{ flex: 1 }}>
                <LinearGradient colors={[C.danger, '#FF8C42']} style={rm.saveBtn}>
                  <Text style={rm.saveTxt}>Save Reason</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function CelebrationModal({ visible, habit, streak, xpEarned, onClose }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const particles = useRef(
    Array.from({ length: 12 }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      op: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0); opacity.setValue(0);
    particles.forEach(p => { p.x.setValue(0); p.y.setValue(0); p.op.setValue(1); });
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    const angleStep = (2 * Math.PI) / particles.length;
    particles.forEach((p, i) => {
      const angle = angleStep * i;
      const dist = 110 + Math.random() * 60;
      Animated.parallel([
        Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 900, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: Math.sin(angle) * dist - 40, duration: 900, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(p.op, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start();
    });
    const t = setTimeout(onClose, 3800);
    return () => clearTimeout(t);
  }, [visible]);

  if (!habit) return null;

  const compliment =
    streak >= 30 ? `${streak} days straight. Truly legendary.`
    : streak >= 14 ? `${streak}-day streak! You're unstoppable.`
    : streak >= 7 ? `${streak} days strong. Keep this fire alive.`
    : streak >= 3 ? `${streak} days in a row. You're building something real.`
    : `You showed up today. That's what counts.`;

  const EMOJIS = ['⭐','✨','🎉','💫','🔥','💪','🌟','⚡','🏆','🎊','💥','❤️'];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}
        activeOpacity={1} onPress={onClose}>
        <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
          {particles.map((p, i) => (
            <Animated.Text
              key={i}
              style={{ position: 'absolute', fontSize: 22, transform: [{ translateX: p.x }, { translateY: p.y }], opacity: p.op }}>
              {EMOJIS[i % EMOJIS.length]}
            </Animated.Text>
          ))}
          <LinearGradient
            colors={[C.success, '#00A878']}
            style={{ borderRadius: 28, padding: 32, alignItems: 'center', minWidth: 280, maxWidth: 320 }}>
            <Text style={{ fontSize: 64, marginBottom: 8 }}>{habit.icon}</Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 10 }}>
              {habit.name}
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 99, paddingHorizontal: 20, paddingVertical: 6, marginBottom: 16 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>+{xpEarned} XP</Text>
            </View>
            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 22, fontWeight: '600' }}>
              {compliment}
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 20 }}>Tap anywhere to close</Text>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

function QuotesCard() {
  const [idx, setIdx] = useState(0);
  const tx = useRef(new Animated.Value(0)).current, op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setInterval(() => {
      Animated.parallel([
        Animated.timing(tx, { toValue: -30, duration: 350, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start(() => {
        tx.setValue(30);
        setIdx(i => (i + 1) % QUOTES.length);
        Animated.parallel([
          Animated.spring(tx, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }),
          Animated.timing(op, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);
  const q = QUOTES[idx];
  return (
    <LinearGradient colors={[C.primary, C.primaryLight]} style={st.quoteCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={st.quoteDecor}>"</Text>
      <Animated.View style={{ flex: 1, transform: [{ translateX: tx }], opacity: op }}>
        <Text style={st.quoteText}>{q.text}</Text>
        <Text style={st.quoteAuthor}>— {q.author}</Text>
      </Animated.View>
      <View style={st.quoteDots}>
        {QUOTES.map((_, i) => <View key={i} style={[st.dot, i === idx && st.dotActive]} />)}
      </View>
    </LinearGradient>
  );
}

function DateSelector({ selectedDate, onSelectDate, habits, logs }) {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { pct } = getDayCompletion(habits, logs, key);
    dates.push({ key, day: DAYS_SHORT[d.getDay()], date: d.getDate(), isToday: i === 0, pct });
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
        {dates.map(d => {
          const sel = selectedDate === d.key;
          const pctColor = d.pct === 100 ? C.success : d.pct > 0 ? (sel ? '#fff' : C.primary) : (sel ? 'rgba(255,255,255,0.6)' : C.textMuted);
          return (
            <TouchableOpacity key={d.key} onPress={() => onSelectDate(d.key)}
              style={[{ width: 52, paddingVertical: 10, borderRadius: 16, alignItems: 'center', backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, elevation: 1, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 }, sel && { backgroundColor: C.primary, borderColor: C.primary, elevation: 4, shadowOpacity: 0.20 }, d.isToday && !sel && { borderColor: C.primary }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: sel ? 'rgba(255,255,255,0.80)' : C.textMuted }}>{d.isToday ? 'TODAY' : d.day}</Text>
              <Text style={{ fontSize: 19, fontWeight: '900', color: sel ? '#fff' : C.text, marginTop: 2 }}>{d.date}</Text>
              <Text style={{ fontSize: 9, fontWeight: '800', color: pctColor, marginTop: 2 }}>{d.pct}%</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── HabitCard component (clean, no duplicate inline render) ───
function HabitCard({ h, logs, selectedDate, dayIdx, todos, todoLogs, remarks, user, expandedHabit, setExpandedHabit, addingTaskFor, setAddingTaskFor, newTaskText, setNewTaskText, toggle, toggleTodoLog, togglePin, deleteTodo, addTodo, getDailyTodos, onHabitDetail, setLogs, setUser }) {
  const status = logs[selectedDate]?.[h.id];
  const isCompleted = status === true;
  const isNotDone = status === 'notdone';
  const isRest = !!h.restDays?.includes(dayIdx);
  const streak = getStreak(logs, h.id);
  const bg = h.color || C.palette[0];
  const remark = remarks[`${selectedDate}_${h.id}`];
  const isMeasurable = h.habitType === 'measurable';
  const todayLog = logs[selectedDate]?.[h.id];
  const measurableCount = isMeasurable && typeof todayLog === 'number' ? todayLog : 0;
  const measurableTarget = h.dailyTarget || null;
  const measurableIncrement = h.increment || 1;
  const measurablePct = measurableTarget ? Math.min(measurableCount / measurableTarget, 1) : (measurableCount > 0 ? 1 : 0);

  const swipeX = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const toggleRef = useRef(toggle);
  const selectedDateRef = useRef(selectedDate);
  toggleRef.current = toggle;
  selectedDateRef.current = selectedDate;

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < 30,
    onPanResponderMove: (_, gs) => { if (gs.dx < 0) swipeX.setValue(gs.dx); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -80) {
        if (selectedDateRef.current > getTodayKey()) {
          // Can't mark a future day not-done yet
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
          return;
        }
        Animated.timing(swipeX, { toValue: -100, duration: 150, useNativeDriver: true }).start(() => {
          toggleRef.current(h, true);
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
        });
      } else {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  const handleMeasurableDelta = async (delta) => {
    if (isRest) return;
    const nl = { ...logs };
    if (!nl[selectedDate]) nl[selectedDate] = {};
    const prev = typeof nl[selectedDate][h.id] === 'number' ? nl[selectedDate][h.id] : 0;
    const next = Math.max(0, prev + delta);
    if (next === prev) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    nl[selectedDate][h.id] = next;
    const wasDone = measurableTarget ? prev >= measurableTarget : prev > 0;
    const nowDone = measurableTarget ? next >= measurableTarget : next > 0;
    const xpDelta = (!wasDone && nowDone) ? 10 : (wasDone && !nowDone) ? -10 : 0;
    const nu = { ...user, xp: Math.max(0, user.xp + xpDelta) };
    setLogs(nl); setUser(nu);
    await Store.set('logs', nl); await Store.set('user', nu);
    if (!wasDone && nowDone) { playTick(); }
  };

 const handleCheck = () => {
  if (isRest) return;
  const todayKey = getTodayKey();
  if (selectedDate === todayKey) {
    const habitTodos = getDailyTodos(h.id);
    const allTodosDone = habitTodos.length === 0 || habitTodos.every(t => todoLogs[todayKey]?.[t.id] === true);
    if (!allTodosDone) return;
  }
  Animated.sequence([
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }),
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200 }),
  ]).start();
  toggle(h);
};

  const todayKey = getTodayKey();

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
      <View style={{ position: 'relative' }}>
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, backgroundColor: C.danger, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>❌</Text>
          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>Not done</Text>
        </View>
        <Animated.View {...panResponder.panHandlers} style={[st.habitCard, { borderLeftWidth: 4, borderLeftColor: isNotDone ? C.danger : bg, backgroundColor: isNotDone ? '#F9F9F9' : C.card, opacity: isNotDone ? 0.75 : 1 }, { transform: [{ translateX: swipeX }, { scale: scaleAnim }] }]}>
          <View style={[st.habitIconWrap, { backgroundColor: bg + '22' }]}>
            <Text style={{ fontSize: 24 }}>{isNotDone ? '❌' : h.icon}</Text>
          </View>
          <TouchableOpacity style={{ flex: 1, marginLeft: 10 }} onPress={() => setExpandedHabit(expandedHabit === h.id ? null : h.id)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[st.habitName, isNotDone && { textDecorationLine: 'line-through', opacity: 0.7 }]}>{h.name}</Text>
              {h.highPriority && <Text style={{ fontSize: 11, color: '#FF9090', fontWeight: '900' }}>⚡</Text>}
              {getDailyTodos(h.id).length > 0 && (
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{expandedHabit === h.id ? '▲' : '▼'}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {isMeasurable && (
                <View style={{ backgroundColor: bg + '18', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: bg, fontWeight: '700' }}>{measurableCount}{h.unit || ''}{measurableTarget ? ` / ${measurableTarget}${h.unit || ''}` : ''}</Text>
                </View>
              )}
              {!isMeasurable && streak > 0 && !isNotDone && (
                <View style={{ backgroundColor: bg + '18', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: bg }}>🔥 {streak}d</Text>
                </View>
              )}
              {isNotDone && (
                <View style={{ backgroundColor: C.dangerPale, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: C.danger, fontWeight: '700' }}>❌ Not done</Text>
                </View>
              )}
              {h.alarms?.length > 0 && (
                <View style={{ backgroundColor: C.section, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>⏰ {fmtAlarm(h.alarms[0])}</Text>
                </View>
              )}
              {h.duration > 0 && (
                <View style={{ backgroundColor: C.section, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>⏱️ {h.duration}min</Text>
                </View>
              )}
              {isRest && (
                <View style={{ backgroundColor: C.section, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600' }}>😴 Rest</Text>
                </View>
              )}
              {remark && (
                <View style={{ backgroundColor: C.section, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>{remark.emoji}{remark.note ? ' · ' + remark.note : ''}</Text>
                </View>
              )}
            </View>
            {isMeasurable && measurableTarget && (
              <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, marginTop: 6, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${measurablePct * 100}%`, backgroundColor: '#fff', borderRadius: 99 }} />
              </View>
            )}
          </TouchableOpacity>
          {isMeasurable && !isRest && !isNotDone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <TouchableOpacity onPress={() => handleMeasurableDelta(-measurableIncrement)}
                disabled={measurableCount <= 0}
                style={{ backgroundColor: bg + '20', borderRadius: 12, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', opacity: measurableCount <= 0 ? 0.4 : 1 }}>
                <Text style={{ color: bg, fontWeight: '900', fontSize: 17 }}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleMeasurableDelta(measurableIncrement)}
                style={{ backgroundColor: bg + '20', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: bg, fontWeight: '900', fontSize: 13 }}>+{measurableIncrement}</Text>
                <Text style={{ color: bg, opacity: 0.8, fontSize: 9, fontWeight: '700' }}>{h.unit || 'unit'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            !isMeasurable && (
             // AFTER
<TouchableOpacity 
  onPress={handleCheck} 
  style={st.checkBtn} 
  disabled={isRest}
  onStartShouldSetResponder={() => true}
>
  <View style={[st.check, { borderColor: bg + '70' }, isCompleted && [st.checkDone, { backgroundColor: bg }], isNotDone && { backgroundColor: C.dangerPale, borderColor: C.danger }]}>
    {isCompleted && <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>✓</Text>}
    {isNotDone && <Text style={{ fontSize: 14, fontWeight: '900', color: C.danger }}>✕</Text>}
  </View>
</TouchableOpacity>
            )
          )}
        </Animated.View>
      </View>
      {expandedHabit === h.id && (
        <View style={{ backgroundColor: bg + '0C', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingHorizontal: 14, paddingBottom: 12, marginTop: -10, paddingTop: 16, borderWidth: 1, borderTopWidth: 0, borderLeftWidth: 4, borderColor: C.border, borderLeftColor: bg }}>
          <TouchableOpacity onPress={() => onHabitDetail(h)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700' }}>View Details →</Text>
          </TouchableOpacity>
          {getDailyTodos(h.id).length === 0 && addingTaskFor !== h.id && (
            <Text style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic', marginBottom: 8 }}>No tasks yet. Tap + to add one.</Text>
          )}
          {getDailyTodos(h.id).map(todo => {
            const checked = todoLogs[todayKey]?.[todo.id] || false;
            return (
              <View key={todo.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                <TouchableOpacity onPress={() => toggleTodoLog(h.id, todo.id)}
                  style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? h.color || C.primary : C.border, backgroundColor: checked ? h.color || C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {checked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                </TouchableOpacity>
                <Text style={{ flex: 1, fontSize: 14, color: checked ? C.textMuted : C.text, textDecorationLine: checked ? 'line-through' : 'none', fontWeight: '500' }}>{todo.text}</Text>
                <TouchableOpacity onPress={() => togglePin(h.id, todo.id)}>
                  <Text style={{ fontSize: 14, opacity: todo.pinned ? 1 : 0.3 }}>📌</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTodo(h.id, todo.id)}>
                  <Text style={{ fontSize: 12, color: C.danger, fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {addingTaskFor === h.id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: C.section, borderRadius: 10, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontSize: 14 }}
                value={newTaskText} onChangeText={setNewTaskText}
                placeholder="Task name…" placeholderTextColor={C.textMuted}
                autoFocus maxLength={60}
                onSubmitEditing={() => addTodo(h.id)}
              />
              <TouchableOpacity onPress={() => addTodo(h.id)} style={{ backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAddingTaskFor(null); setNewTaskText(''); }}>
                <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setAddingTaskFor(h.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>+ Add task</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function HomeScreen({ habits, logs, moods, user, remarks, todos, todoLogs, setTodos, setTodoLogs, setUser, setLogs, setMoods, setRemarks, setHabits, onAddHabit, onHabitDetail }) {
  const [selectedDate, setSelectedDate] = useState(getTodayKey());
  const today = getTodayKey();
  const selDate = new Date(selectedDate + 'T00:00:00');
  const dayIdx = selDate.getDay();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning,' : hour < 17 ? 'Afternoon,' : 'Evening,';
  const active = habits.filter(h => !h.restDays?.includes(dayIdx));
  const done = active.filter(h => {
    const tl = logs[selectedDate]?.[h.id];
    if (h.habitType === 'measurable') {
      const t = h.dailyTarget || null;
      return t ? (typeof tl === 'number' && tl >= t) : (typeof tl === 'number' && tl > 0);
    }
    return tl === true;
  }).length;
  const todayMood = moods[selectedDate] || null;
  const info = getLevelInfo(user.xp);
  const pct = active.length > 0 ? Math.round((done / active.length) * 100) : 0;
  const consistency7 = getConsistency(habits, logs, 7);
  const consistency30 = getConsistency(habits, logs, 30);

  const [expandedHabit, setExpandedHabit] = useState(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [addingTaskFor, setAddingTaskFor] = useState(null);
  const [remarkModal, setRemarkModal] = useState(false);
  const [remarkHabit, setRemarkHabit] = useState(null);
  const [notDoneModal, setNotDoneModal] = useState(false);
  const [notDoneHabit, setNotDoneHabit] = useState(null);

  const barAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(barAnim, { toValue: info.progress, duration: 900, useNativeDriver: false }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [user.xp]);

  const toggle = async (h, forceNotDone = false) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nl = { ...logs };
    if (!nl[selectedDate]) nl[selectedDate] = {};
    const was = nl[selectedDate][h.id];
    if (forceNotDone) { nl[selectedDate][h.id] = 'notdone'; }
    else if (nl[selectedDate][h.id] === 'notdone') { nl[selectedDate][h.id] = false; }
    else { nl[selectedDate][h.id] = !was; }
    const completing = !was && !forceNotDone && nl[selectedDate][h.id] === true;
    const undoing = was === true && !forceNotDone;
    const freshNotDone = forceNotDone && was !== 'notdone';
    const newXp = Math.max(0, user.xp + (completing ? 10 : undoing ? -10 : 0));
    const nu = { ...user, xp: newXp };
    setLogs(nl); setUser(nu);
    await Store.set('logs', nl); await Store.set('user', nu);
    if (completing) {
      playTick();
      const newDone = active.filter(hh => {
        const tl = nl[selectedDate]?.[hh.id];
        if (hh.habitType === 'measurable') {
          const t = hh.dailyTarget || null;
          return t ? (typeof tl === 'number' && tl >= t) : (typeof tl === 'number' && tl > 0);
        }
        return tl === true;
      }).length;
      if (newDone === active.length && active.length > 0) setTimeout(() => playApplause(), 300);
      setRemarkHabit(h); setRemarkModal(true);
    } else if (freshNotDone) {
      setNotDoneHabit(h); setNotDoneModal(true);
    }
  };

  const saveRemark = async (remark) => {
    if (!remarkHabit) return;
    const key = `${selectedDate}_${remarkHabit.id}`;
    const nr = { ...remarks, [key]: remark };
    setRemarks(nr);
    await Store.set('remarks', nr);
  };

  const saveNotDoneReason = async (remark) => {
    if (!notDoneHabit) return;
    const key = `${selectedDate}_${notDoneHabit.id}`;
    const nr = { ...remarks, [key]: remark };
    setRemarks(nr);
    await Store.set('remarks', nr);
  };

  const setMood = async (v) => {
    Haptics.selectionAsync();
    const nm = { ...moods, [selectedDate]: v };
    setMoods(nm);
    await Store.set('moods', nm);
  };

 // AFTER
const getDailyTodos = (habitId) => {
  const all = (todos && todos[habitId]) || [];
  return all.filter(t => {
    if (t.pinned) return true;
    const createdDate = new Date(parseInt(t.id.replace('t_', '')));
    const createdKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;
    return createdKey === selectedDate;  // ← selectedDate instead of key
  });
};
  const toggleTodoLog = async (habitId, todoId) => {
    Haptics.selectionAsync();
    const key = getTodayKey();
    const nl = { ...todoLogs };
    if (!nl[key]) nl[key] = {};
    nl[key][todoId] = !nl[key][todoId];
    setTodoLogs(nl);
    await Store.set('todologs', nl);
    const habitTodos = getDailyTodos(habitId);
    if (habitTodos.length > 0) {
      const allDone = habitTodos.every(t => nl[key][t.id] === true);
      const logs2 = { ...logs };
      if (!logs2[key]) logs2[key] = {};
      const wasAlreadyDone = logs2[key][habitId] === true;
      if (allDone && !wasAlreadyDone) {
        logs2[key][habitId] = true;
        const newXp = user.xp + 10;
        const nu = { ...user, xp: newXp };
        setLogs(logs2); setUser(nu);
        await Store.set('logs', logs2);
        await Store.set('user', nu);
        playTick();
        const activeHabits = habits.filter(h => !h.restDays?.includes(new Date().getDay()));
        const newDone = activeHabits.filter(h => {
          const tl = logs2[key]?.[h.id];
          if (h.habitType === 'measurable') {
            const t = h.dailyTarget || null;
            return t ? (typeof tl === 'number' && tl >= t) : (typeof tl === 'number' && tl > 0);
          }
          return tl === true;
        }).length;
        if (newDone === activeHabits.length && activeHabits.length > 0) {
          setTimeout(() => playApplause(), 300);
        }
      } else if (!allDone && wasAlreadyDone) {
        logs2[key][habitId] = false;
        const newXp = Math.max(0, user.xp - 10);
        const nu = { ...user, xp: newXp };
        setLogs(logs2); setUser(nu);
        await Store.set('logs', logs2);
        await Store.set('user', nu);
      }
    }
  };

  const addTodo = async (habitId) => {
    if (!newTaskText.trim()) return;
    const nt = { id: `t_${Date.now()}`, text: newTaskText.trim(), pinned: false };
    const nh = { ...todos, [habitId]: [...(todos[habitId] || []), nt] };
    setTodos(nh);
    await Store.set('todos', nh);
    setNewTaskText('');
    setAddingTaskFor(null);
  };

  const togglePin = async (habitId, todoId) => {
    Haptics.selectionAsync();
    const nh = { ...todos, [habitId]: (todos[habitId] || []).map(t => t.id === todoId ? { ...t, pinned: !t.pinned } : t) };
    setTodos(nh);
    await Store.set('todos', nh);
  };

  const deleteTodo = async (habitId, todoId) => {
    const nh = { ...todos, [habitId]: (todos[habitId] || []).filter(t => t.id !== todoId) };
    setTodos(nh);
    await Store.set('todos', nh);
  };

  // SVG ring
  const size = 80, stroke = 7, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const arc = circ * (1 - (pct / 100));
  const ringColor = pct === 100 ? C.success : C.primary;

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={st.header}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.textSub }}>Good {greeting}</Text>
            <Text style={st.greeting}>{user.name} 👋</Text>
            <Text style={st.dateTxt}>{getDateStr(selectedDate)}</Text>
          </View>
          <TouchableOpacity onPress={onAddHabit} style={st.fab}>
            <LinearGradient colors={[C.primary, C.primaryLight]} style={st.fabGrad}>
              <Text style={st.fabTxt}>＋</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <DateSelector selectedDate={selectedDate} onSelectDate={setSelectedDate} habits={habits} logs={logs} />
        {selectedDate !== today && (
          <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: '#FF8C4222', borderRadius: 12, padding: 10, borderWidth: 1.5, borderColor: '#FF8C42' }}>
            <Text style={{ color: '#FF8C42', fontWeight: '700', fontSize: 13, textAlign: 'center' }}>📅 Editing past day — Tap TODAY to return</Text>
          </View>
        )}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}><QuotesCard /></View>
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={st.levelStrip}>
            <View style={st.levelBadge}><Text style={st.levelNum}>{info.current.level}</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={st.levelTitle}>{info.current.title}</Text>
                <Text style={st.levelXP}>{user.xp} XP</Text>
              </View>
              <View style={st.barBg}>
                <Animated.View style={[st.barFill, { width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
              </View>
              {info.next && <Text style={st.levelNext}>{info.next.xp - user.xp} XP to {info.next.title}</Text>}
            </View>
          </View>
        </View>
        {/* ─── BUG FIX: SVG ring using top-level imported Svg/Circle, not require() ─── */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={st.progressCard}>
            <View style={st.ringWrap}>
              <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={size} height={size} style={{ position: 'absolute' }}>
                  <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.section} strokeWidth={stroke} fill="none" />
                  <Circle cx={size / 2} cy={size / 2} r={r} stroke={ringColor} strokeWidth={stroke} fill="none"
                    strokeDasharray={`${circ} ${circ}`}
                    strokeDashoffset={arc}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${size / 2},${size / 2}`}
                  />
                </Svg>
                <Text style={[st.ringPct, { color: ringColor }]}>{pct}%</Text>
                <Text style={st.ringLbl}>done</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.progressTitle}>Progress</Text>
              <Text style={st.progressSub}>{done} of {active.length} habits</Text>
              {pct === 100 && active.length > 0 && <View style={st.allDone}><Text style={st.allDoneTxt}>🎉 All done!</Text></View>}
            </View>
          </View>
        </View>
        {habits.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 }}>
            {[{ v: consistency7, l: '7-Day Consistency' }, { v: consistency30, l: '30-Day Consistency' }].map((x, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border, elevation: 2, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: x.v >= 80 ? C.success : x.v >= 50 ? C.gold : C.danger }}>{x.v}%</Text>
                <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2, fontWeight: '700' }}>{x.l}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={st.secTitle}>How are you feeling?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {[{ v: 1, e: '😞', c: C.mood1 }, { v: 2, e: '😕', c: C.mood2 }, { v: 3, e: '😐', c: C.mood3 }, { v: 4, e: '🙂', c: C.mood4 }, { v: 5, e: '😄', c: C.mood5 }].map(m => (
              <TouchableOpacity key={m.v} onPress={() => setMood(m.v)} style={[st.moodBtn, todayMood === m.v && { backgroundColor: m.c + '22', borderColor: m.c, borderWidth: 1.5 }]}>
                <Text style={{ fontSize: 24 }}>{m.e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={st.secTitle}>Habits</Text>
          <Text style={{ fontSize: 11, color: C.textMuted, marginTop: -6 }}>Swipe left to mark not done</Text>
        </View>
        {habits.length === 0 && (
          <TouchableOpacity onPress={onAddHabit} style={st.empty}>
            <Text style={{ fontSize: 52 }}>🌱</Text>
            <Text style={st.emptyTitle}>No habits yet!</Text>
            <Text style={st.emptySub}>Tap + to add your first habit</Text>
          </TouchableOpacity>
        )}
        {/* ─── BUG FIX: only one habits.map, using HabitCard component, no duplicate inline render ─── */}
        {habits.map(h => (
          <HabitCard
            key={h.id} h={h} logs={logs}
            selectedDate={selectedDate} dayIdx={dayIdx}
            todos={todos} todoLogs={todoLogs} remarks={remarks} user={user}
            expandedHabit={expandedHabit} setExpandedHabit={setExpandedHabit}
            addingTaskFor={addingTaskFor} setAddingTaskFor={setAddingTaskFor}
            newTaskText={newTaskText} setNewTaskText={setNewTaskText}
            toggle={toggle} toggleTodoLog={toggleTodoLog}
            togglePin={togglePin} deleteTodo={deleteTodo} addTodo={addTodo}
            getDailyTodos={getDailyTodos} onHabitDetail={onHabitDetail}
            setLogs={setLogs} setUser={setUser}
          />
        ))}
        <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 28, marginBottom: 8 }}>🌴</Text>
          <Text style={{ fontSize: 13, color: C.textMuted, fontWeight: '600' }}>Crafted with ❤️ in Kerala, India</Text>
          <Text style={{ fontSize: 11, color: C.border, marginTop: 4 }}>HabitAlarm © {new Date().getFullYear()}</Text>
        </View>
        <RemarkModal
          visible={remarkModal}
          habitName={remarkHabit?.name || ''}
          habitColor={remarkHabit?.color}
          existingRemark={remarkHabit ? remarks[`${selectedDate}_${remarkHabit.id}`] : null}
          onSave={saveRemark}
          onClose={() => { setRemarkModal(false); setRemarkHabit(null); }}
        />
        <NotDoneModal
          visible={notDoneModal}
          habitName={notDoneHabit?.name || ''}
          habitColor={notDoneHabit?.color}
          existingRemark={notDoneHabit ? remarks[`${selectedDate}_${notDoneHabit.id}`] : null}
          onSave={saveNotDoneReason}
          onClose={() => { setNotDoneModal(false); setNotDoneHabit(null); }}
        />
      </ScrollView>
    </Animated.View>
  );
}

function AddHabitScreen({ existing, onSave, onBack }) {
  const [step, setStep] = useState(1);
  const [habitType, setHabitType] = useState(existing?.habitType || 'checkmark');
  const [habitDirection, setHabitDirection] = useState(existing?.habitDirection || 'build');
  const [name, setName] = useState(existing?.name || '');
  const [icon, setIcon] = useState(existing?.icon || '💪');
  const [color, setColor] = useState(existing?.color || C.palette[0]);
  const [unit, setUnit] = useState(existing?.unit || 'km');
  const [customUnit, setCustomUnit] = useState(existing?.customUnit || '');
  const [dailyTarget, setDailyTarget] = useState(existing?.dailyTarget ? String(existing.dailyTarget) : '');
  const [increment, setIncrement] = useState(existing?.increment ? String(existing.increment) : '1');
  const [categories, setCategories] = useState(existing?.categories || []);
  const [restDays, setRestDays] = useState(existing?.restDays || []);
  const [reminderOn, setReminderOn] = useState(existing?.alarms?.length > 0);
  const [alarms, setAlarms] = useState(existing?.alarms || [{ hour: 9, minute: 0 }]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [highPriority, setHighPriority] = useState(existing?.highPriority || false);

  const HABIT_TYPES = [
    { id: 'checkmark', label: 'Checkmark', sub: 'Track yes or no per day', icon: '✅' },
    { id: 'measurable', label: 'Measurable', sub: 'Track numbers, distance, or time', icon: '📊' },
  ];
  const HABIT_DIRECTIONS = [
    { id: 'build', label: 'Build a Habit', icon: '📈', desc: 'Add a new positive routine. Daily completions build your streak.' },
    { id: 'quit', label: 'Quit a Habit', icon: '🚫', desc: 'Break a bad habit. Track the days you successfully avoid it.' },
  ];
  const UNITS = ['hr', 'min', 'km', 'mi', 'pages', 'glasses', 'reps', 'kcal', 'words', '$', 'Custom…'];
  const CATEGORIES = [
    { id: 'art', label: 'Art', icon: '🎨' }, { id: 'finances', label: 'Finances', icon: '💵' },
    { id: 'fitness', label: 'Fitness', icon: '🏋️' }, { id: 'health', label: 'Health', icon: '❤️' },
    { id: 'nutrition', label: 'Nutrition', icon: '🍽️' }, { id: 'social', label: 'Social', icon: '👥' },
    { id: 'study', label: 'Study', icon: '🎓' }, { id: 'work', label: 'Work', icon: '💼' },
    { id: 'morning', label: 'Morning', icon: '☀️' }, { id: 'day', label: 'Day', icon: '🌤️' },
    { id: 'evening', label: 'Evening', icon: '🌙' }, { id: 'other', label: 'Other', icon: '···' },
  ];

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 1) { onBack(); return true; }
      goBack(); return true;
    });
    return () => handler.remove();
  }, [step]);

  const goNext = () => {
    Haptics.selectionAsync();
    let next = step + 1;
    if (step === 2 && habitType === 'checkmark') next = 4;
    setStep(next);
  };
  const goBack = () => {
    Haptics.selectionAsync();
    if (step === 1) { onBack(); return; }
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
  const toggleRestDay = (idx) => {
    Haptics.selectionAsync();
    setRestDays(p => p.includes(idx) ? p.filter(x => x !== idx) : [...p, idx]);
  };
  const handleTimeChange = (event, date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed' || !date) return;
    setAlarms([{ hour: date.getHours(), minute: date.getMinutes() }]);
  };
  const save = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Enter a habit name.'); return; }
    setSaving(true);
    const finalAlarms = reminderOn ? alarms : [];
    const habit = {
      id: existing?.id || `h_${Date.now()}`,
      name: name.trim(), icon, color,
      habitType, habitDirection,
      unit: habitType === 'measurable' ? (unit === 'Custom…' ? customUnit : unit) : null,
      dailyTarget: habitType === 'measurable' ? (dailyTarget ? parseFloat(dailyTarget) : null) : null,
      increment: habitType === 'measurable' ? (increment ? parseFloat(increment) : 1) : null,
      categories: habitType === 'measurable' ? categories : [],
      restDays,
      duration: existing?.duration || 0,
      alarms: finalAlarms,
      highPriority,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    await cancelHabitAlarms(habit.id);
    for (const a of finalAlarms) await scheduleAlarm(habit, a);
    const habits = await Store.get('habits', []);
    if (existing) { await Store.set('habits', habits.map(h => h.id === existing.id ? habit : h)); }
    else { await Store.set('habits', [...habits, habit]); }
    setSaving(false);
    onSave();
  };

  const visualTotal = habitType === 'checkmark' ? 3 : 4;
  const visualCurrent = habitType === 'checkmark' && step === 4 ? 3 : step;
  const isLastStep = step === 4;

  const renderStep1 = () => (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: 120 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 24 }}>What kind of habit?</Text>
      {HABIT_TYPES.map(t => {
        const sel = habitType === t.id;
        return (
          <TouchableOpacity key={t.id} onPress={() => { Haptics.selectionAsync(); setHabitType(t.id); }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: sel ? C.primary + '15' : C.card, borderRadius: 16, borderWidth: 1.5, borderColor: sel ? C.primary : C.border, padding: 16, marginBottom: 10, gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: sel ? C.primary + '30' : C.section, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{t.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: sel ? C.primary : C.text, marginBottom: 2 }}>{t.label}</Text>
              <Text style={{ fontSize: 12, color: C.textMuted }}>{t.sub}</Text>
            </View>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: sel ? C.primary : C.border, alignItems: 'center', justifyContent: 'center' }}>
              {sel && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: C.primary }} />}
            </View>
          </TouchableOpacity>
        );
      })}
      {habitType === 'checkmark' && (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            {HABIT_DIRECTIONS.map(d => {
              const active = habitDirection === d.id;
              return (
                <TouchableOpacity key={d.id} onPress={() => { Haptics.selectionAsync(); setHabitDirection(d.id); }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primary + '15' : C.card }}>
                  <Text style={{ fontSize: 14, marginRight: 6 }}>{d.icon}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? C.primary : C.text }}>{d.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 }}>
            <Text style={{ fontSize: 13, marginRight: 6 }}>ℹ️</Text>
            <Text style={{ flex: 1, fontSize: 12, color: C.textSub, lineHeight: 18 }}>
              {HABIT_DIRECTIONS.find(d => d.id === habitDirection)?.desc}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: 120 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 24 }}>Name Your Habit</Text>
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: color + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Text style={{ fontSize: 38 }}>{icon}</Text>
        </View>
        <TextInput style={{ fontSize: 22, fontWeight: '800', color: C.text, width: '80%', textAlign: 'center' }}
          value={name} onChangeText={setName} placeholder="e.g. Morning Run"
          placeholderTextColor={C.textMuted} maxLength={40} autoFocus={!existing} />
        <View style={{ height: 1.5, width: '80%', backgroundColor: C.border, marginTop: 6 }} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Select Icon</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {ICONS.map(ic => (
          <TouchableOpacity key={ic} onPress={() => { Haptics.selectionAsync(); setIcon(ic); }}
            style={{ width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === ic ? color + '22' : C.card, borderWidth: 1.5, borderColor: icon === ic ? color : C.border }}>
            <Text style={{ fontSize: 24 }}>{ic}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Select Color</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {C.palette.map(c => (
          <TouchableOpacity key={c} onPress={() => { Haptics.selectionAsync(); setColor(c); }}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: color === c ? 3 : 0, borderColor: '#fff' }}>
            {color === c && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderStep3 = () => (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: 120 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 24 }}>How do you track it?</Text>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Unit</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {UNITS.map(u => {
          const sel = unit === u;
          return (
            <TouchableOpacity key={u} onPress={() => { Haptics.selectionAsync(); setUnit(u); }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: sel ? C.primary : C.border, backgroundColor: sel ? C.primary + '20' : C.card }}>
              <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: sel ? C.primary : C.text }}>{u}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {unit === 'Custom…' && (
        <TextInput style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 16, paddingVertical: 12, color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 10 }}
          value={customUnit} onChangeText={setCustomUnit} placeholder="Enter custom unit…" placeholderTextColor={C.textMuted} maxLength={20} />
      )}
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 }}>Daily target (optional)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <TextInput style={{ width: 120, backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 12, color: C.text, fontSize: 18, fontWeight: '700' }}
          value={dailyTarget} onChangeText={setDailyTarget} placeholder="0"
          placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={8} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.primary }}>{unit === 'Custom…' ? (customUnit || 'unit') : unit}</Text>
      </View>
      <Text style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic', marginBottom: 20 }}>Leave empty to log any positive value.</Text>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 }}>Button Increment</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <TextInput
          style={{ width: 120, backgroundColor: C.card, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 12, color: C.text, fontSize: 18, fontWeight: '700' }}
          value={increment} onChangeText={setIncrement} placeholder="1"
          placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={6} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.primary }}>{unit === 'Custom…' ? (customUnit || 'unit') : unit}</Text>
      </View>
      <Text style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic', marginBottom: 20 }}>How much each tap of the + button adds.</Text>
      <View style={{ height: 1, backgroundColor: C.border, marginBottom: 20 }} />
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Categories</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map(cat => {
          const sel = categories.includes(cat.id);
          return (
            <TouchableOpacity key={cat.id} onPress={() => toggleCategory(cat.id)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: sel ? C.primary : C.border, backgroundColor: sel ? C.primary + '18' : C.card }}>
              <Text style={{ fontSize: 13, marginRight: 4 }}>{cat.icon}</Text>
              <Text style={{ fontSize: 12, fontWeight: sel ? '700' : '600', color: sel ? C.primary : C.textSub }}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderStep4 = () => {
    const reminderTime = alarms[0] || { hour: 9, minute: 0 };
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: C.text, flex: 1 }}>Set a Daily Reminder</Text>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setReminderOn(p => !p); }}
            style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: reminderOn ? C.primary : C.section, justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: reminderOn ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 13, color: C.textMuted, fontStyle: 'italic', marginBottom: 32, lineHeight: 20 }}>
          People who set reminders are 3× more likely to stick with their habits.
        </Text>
        {reminderOn && (
          <>
            <TouchableOpacity onPress={() => { const d = new Date(); d.setHours(reminderTime.hour, reminderTime.minute, 0); setPickerDate(d); setShowPicker(true); }}
              style={{ alignItems: 'center', backgroundColor: C.card, borderRadius: 20, padding: 28, marginBottom: 14, borderWidth: 1.5, borderColor: C.border }}>
              <Text style={{ fontSize: 52, fontWeight: '900', color: C.primary, letterSpacing: -1 }}>{fmtAlarm(reminderTime)}</Text>
              <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Tap to change</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { const d = new Date(); d.setHours(reminderTime.hour, reminderTime.minute, 0); setPickerDate(d); setShowPicker(true); }}
              style={{ borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.primary }}>+ Set This Time</Text>
            </TouchableOpacity>
            {showPicker && <DateTimePicker value={pickerDate} mode="time" is24Hour={false} onChange={handleTimeChange} />}
            <Text style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', fontStyle: 'italic', marginTop: 24 }}>
              More reminders can be added later from the habit settings.
            </Text>
          </>
        )}
        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 28 }} />
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.text, marginBottom: 6 }}>😴 Rest Days</Text>
        <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, lineHeight: 19 }}>
          Days you don't need to do this habit. They won't count against your streak or completion rate.
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DAYS_SHORT.map((d, idx) => {
            const sel = restDays.includes(idx);
            return (
              <TouchableOpacity key={idx} onPress={() => toggleRestDay(idx)}
                style={[st.dayBtn, sel && { backgroundColor: C.primary + '18', borderColor: C.primary }]}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? C.primary : C.textSub }}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 1, backgroundColor: C.border, marginVertical: 28 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: C.text }}>⚡ High Priority</Text>
            <Text style={{ fontSize: 13, color: C.textMuted, marginTop: 4, lineHeight: 19 }}>
              Sends an urgent notification with "Done Now" and "Skip" buttons. Skipping costs 15 XP and triggers a 10pm follow-up.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); setHighPriority(p => !p); }}
            style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: highPriority ? '#FF6B6B' : C.section, justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: highPriority ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
        {highPriority && (
          <View style={{ backgroundColor: '#FF6B6B14', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1.5, borderColor: '#FF6B6B40' }}>
            <Text style={{ fontSize: 13, color: '#FF6B6B', fontWeight: '700', lineHeight: 20 }}>
              ⚡ Alarm will include action buttons. Complete it for +20 XP (2× bonus). Skip and lose 15 XP — plus a 10pm reminder to stay accountable.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 10, paddingHorizontal: 16, gap: 12 }}>
        <TouchableOpacity onPress={goBack} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{step === 1 ? '✕' : '←'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: visualTotal }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.section, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: i < visualCurrent ? '100%' : '0%', borderRadius: 3, backgroundColor: C.primary }} />
            </View>
          ))}
        </View>
      </View>
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 20, paddingTop: 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border }}>
        <TouchableOpacity onPress={isLastStep ? save : goNext} disabled={!canContinue() || saving}
          style={{ borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: canContinue() ? C.primary : C.section, opacity: canContinue() ? 1 : 0.5 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: canContinue() ? '#fff' : C.textMuted }}>
            {isLastStep ? (saving ? 'Saving…' : 'Save Habit') : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Landscape habit x day-of-month matrix, styled for printing/physical review.
function buildMonthMatrixHtml(habits, logs, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = `${MONTHS[month]} ${year}`;
  const dayCols = Array.from({ length: daysInMonth }, (_, i) => `<th>${i + 1}</th>`).join('');
  const rows = habits.map(h => {
    const cells = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayIdx = new Date(key + 'T00:00:00').getDay();
      const isRest = !!h.restDays?.includes(dayIdx);
      const status = logs[key]?.[h.id];
      const isMeas = h.habitType === 'measurable';
      let content = '';
      let cls = 'blank';
      if (isRest) { content = '&#128564;'; cls = 'rest'; }
      else if (isMeas) {
        if (typeof status === 'number' && status > 0) {
          const done = h.dailyTarget ? status >= h.dailyTarget : true;
          content = String(status);
          cls = done ? 'done' : 'partial';
        } else if (status === 'notdone') { content = '&#10007;'; cls = 'notdone'; }
      } else if (status === true) { content = '&#10003;'; cls = 'done'; }
      else if (status === 'notdone') { content = '&#10007;'; cls = 'notdone'; }
      return `<td class="${cls}">${content}</td>`;
    }).join('');
    return `<tr><td class="habit">${h.icon || ''} ${h.name}</td>${cells}</tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: Helvetica, Arial, sans-serif; padding: 24px; color: #1A1040; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { font-size: 11px; color: #6B6490; margin-bottom: 16px; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      th, td { border: 1px solid #E2DCF8; text-align: center; font-size: 9px; padding: 4px 2px; }
      th { background: #EDE9FF; color: #6B6490; font-weight: 700; }
      td.habit { text-align: left; font-weight: 700; font-size: 10px; width: 150px; word-wrap: break-word; overflow-wrap: break-word; }
      td.done { background: #0B7A4B; color: #FFFFFF; font-weight: 900; }
      td.notdone { background: #A3231C; color: #FFFFFF; font-weight: 900; }
      td.partial { background: #B4590A; color: #FFFFFF; font-weight: 900; }
      td.rest { background: #4B5264; color: #FFFFFF; font-weight: 900; font-size: 8px; }
      .footer { margin-top: 16px; font-size: 9px; color: #B0A8CC; text-align: center; }
    </style></head>
    <body>
      <h1>Hadbit — ${monthLabel}</h1>
      <div class="sub">Habit completion matrix · exported ${getDateStr(getTodayKey())}</div>
      <table>
        <thead><tr><th style="text-align:left; width:150px;">Habit</th>${dayCols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Generated by Hadbit</div>
    </body></html>`;
}

async function exportMonthMatrixPdf(habits, logs, year, month) {
  const html = buildMonthMatrixHtml(habits, logs, year, month);
  // A4 landscape at 72 PPI (width/height swapped from the portrait default)
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Hadbit ${MONTHS[month]} ${year}`, UTI: 'com.adobe.pdf' });
  }
  return uri;
}

function MonthlyCalendarScreen({ habits, logs, onBack }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const today = getTodayKey();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const getDayKey = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const getDayStatus = (day) => {
    const key = getDayKey(day);
    const dayLogs = logs[key] || {};
    const total = habits.length;
    if (total === 0) return 'none';
    const done = habits.filter(h => dayLogs[h.id] === true).length;
    if (done === 0) return 'none';
    if (done === total) return 'perfect';
    return 'partial';
  };
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => handler.remove();
  }, []);
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (habits.length === 0) { Alert.alert('No habits yet', 'Add a habit before exporting.'); return; }
    setExporting(true);
    try {
      await exportMonthMatrixPdf(habits, logs, year, month);
    } catch (e) {
      Alert.alert('Export failed', 'Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient colors={[C.primary, C.primaryLight]} style={st.screenHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <TouchableOpacity onPress={onBack}><Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 15 }}>← Back</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleExport} disabled={exporting}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, opacity: exporting ? 0.6 : 1 }}>
            <Text style={{ fontSize: 13 }}>📄</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{exporting ? 'Exporting…' : 'Export PDF'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={st.screenHeaderTitle}>📆 Monthly Calendar</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <TouchableOpacity onPress={prevMonth} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>‹</Text></TouchableOpacity>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, flex: 1, textAlign: 'center' }}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>›</Text></TouchableOpacity>
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16, justifyContent: 'center' }}>
          {[{ c: C.success, l: 'Perfect' }, { c: C.gold, l: 'Partial' }, { c: C.section, l: 'None' }].map((x, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: x.c }} />
              <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '600' }}>{x.l}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          {DAYS_SHORT.map(d => (<Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: C.textMuted }}>{d}</Text>))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((day, i) => {
            if (!day) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
            const key = getDayKey(day);
            const status = getDayStatus(day);
            const isToday = key === today;
            const isFuture = new Date(year, month, day) > new Date();
            const bg = status === 'perfect' ? C.success : status === 'partial' ? C.gold : C.section;
            return (
              <View key={day} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                <View style={[{ flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: isFuture ? 'transparent' : bg }, isToday && { borderWidth: 2, borderColor: C.primary }]}>
                  <Text style={{ fontSize: 12, fontWeight: isToday ? '900' : '700', color: status !== 'none' && !isFuture ? '#fff' : C.textSub }}>{day}</Text>
                  {status === 'perfect' && !isFuture && <Text style={{ fontSize: 8 }}>⭐</Text>}
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: 20, backgroundColor: C.card, borderRadius: 20, padding: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 12 }}>Month Summary</Text>
          {(() => {
            let perfect = 0, partial = 0, missed = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const s = getDayStatus(d);
              const isFuture = new Date(year, month, d) > new Date();
              if (!isFuture) { if (s === 'perfect') perfect++; else if (s === 'partial') partial++; else missed++; }
            }
            return (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[{ v: perfect, l: 'Perfect', c: C.success }, { v: partial, l: 'Partial', c: C.gold }, { v: missed, l: 'Missed', c: C.danger }].map((x, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: x.c + '20', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: x.c }}>{x.v}</Text>
                    <Text style={{ fontSize: 11, color: x.c, fontWeight: '700' }}>{x.l}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </View>
  );
}

function StatsScreen({ habits, logs, moods, onMonthly }) {
  const matrixRef = useRef(null);
  const totalDone = Object.values(logs).reduce((a, d) => a + Object.values(d).filter(v => v === true).length, 0);
  const bestStreak = habits.reduce((b, h) => { const s = getStreak(logs, h.id); return s > b ? s : b; }, 0);
  const mv = Object.values(moods);
  const avgMood = mv.length > 0 ? (mv.reduce((a, b) => a + b, 0) / mv.length).toFixed(1) : '—';
  const totalMinutes = habits.reduce((acc, h) => { const done = Object.values(logs).filter(d => d[h.id] === true).length; return acc + (done * (h.duration || 0)); }, 0);
  const totalHours = totalMinutes > 0 ? (totalMinutes / 60).toFixed(1) : 0;
  const dayKeys = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayKeys.push({ key, label: DAYS_SHORT[d.getDay()], date: d.getDate(), isToday: i === 0 });
  }
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => false); return () => handler.remove(); }, []);
  useEffect(() => { setTimeout(() => matrixRef.current?.scrollToEnd({ animated: false }), 300); }, []);
  const last7 = dayKeys.slice(-7);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
      <LinearGradient colors={[C.primary, C.primaryLight]} style={st.screenHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={st.screenHeaderTitle}>📊 Statistics</Text>
        <Text style={st.screenHeaderSub}>Your habit insights</Text>
        <TouchableOpacity onPress={onMonthly} style={st.headerAddBtn}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>📆 Monthly View</Text></TouchableOpacity>
      </LinearGradient>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginBottom: 16 }}>
        {[{ v: totalDone, l: 'Total Done', bg: '#4F8EF7' }, { v: `🔥${bestStreak}`, l: 'Best Streak', bg: C.gold }, { v: avgMood, l: 'Avg Mood', bg: C.success }, { v: `${totalHours}h`, l: 'Time Invested', bg: '#9B5DE5' }].map((x, i) => (
          <View key={i} style={[st.overviewCard, { backgroundColor: x.bg, width: '47%' }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff' }}>{x.v}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: '700', textAlign: 'center' }}>{x.l}</Text>
          </View>
        ))}
      </View>
      {habits.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: C.card, borderRadius: 20, padding: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>📅 30-Day Matrix</Text>
          <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>Today on right →</Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: 100 }}>
              <View style={{ height: 40 }}><Text style={{ fontSize: 10, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', alignSelf: 'flex-end', paddingBottom: 4 }}>Habit</Text></View>
              {habits.map(h => (
                <View key={h.id} style={{ height: 36, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={{ fontSize: 14 }}>{h.icon}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, flex: 1 }} numberOfLines={1}>{h.name}</Text>
                </View>
              ))}
            </View>
            <ScrollView ref={matrixRef} horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', height: 40, alignItems: 'flex-end', paddingBottom: 4 }}>
                  {dayKeys.map(dk => (
                    <View key={dk.key} style={[{ width: 36, alignItems: 'center' }, dk.isToday && { backgroundColor: C.primaryPale, borderRadius: 6 }]}>
                      <Text style={{ fontSize: 8, color: dk.isToday ? C.primary : C.textMuted, fontWeight: '700' }}>{dk.label}</Text>
                      <Text style={{ fontSize: 11, color: dk.isToday ? C.primary : C.textSub, fontWeight: dk.isToday ? '900' : '700' }}>{dk.date}</Text>
                    </View>
                  ))}
                </View>
                {habits.map(h => (
                  <View key={h.id} style={{ flexDirection: 'row', height: 36, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border }}>
                    {dayKeys.map(dk => {
                      const isRest = !!h.restDays?.includes(new Date(dk.key + 'T00:00:00').getDay());
                      const status = logs[dk.key]?.[h.id];
                      const isMeas = h.habitType === 'measurable';
                      const done = isMeas
                        ? (typeof status === 'number' && (h.dailyTarget ? status >= h.dailyTarget : status > 0))
                        : status === true;
                      const notdone = status === 'notdone';
                      const measCount = isMeas && typeof status === 'number' ? status : null;
                      const cellColor = isRest ? C.textMuted + '33' : done ? (h.color || C.primary) : notdone ? C.danger + '44' : C.section;
                      return (
                        <View key={dk.key} style={{ width: 36, alignItems: 'center' }}>
                          <View style={[{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: cellColor }, dk.isToday && !done && !notdone && !isRest && { borderWidth: 1.5, borderColor: C.primary + '50' }]}>
                            {isRest
                              ? <Text style={{ fontSize: 10 }}>😴</Text>
                              : isMeas && measCount !== null && measCount > 0
                                ? <Text style={{ fontSize: 9, color: done ? '#fff' : C.textSub, fontWeight: '900' }}>{measCount >= 1000 ? `${(measCount / 1000).toFixed(1)}k` : measCount}</Text>
                                : done ? <Text style={{ fontSize: 12, color: '#fff', fontWeight: '900' }}>✓</Text>
                                  : notdone ? <Text style={{ fontSize: 12, color: C.danger, fontWeight: '900' }}>✕</Text>
                                    : null
                            }
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
      )}
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={st.secTitle}>Habit Breakdown</Text>
        {habits.length === 0 && <Text style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 20 }}>No habits yet</Text>}
        {habits.map(h => {
          const streak = getStreak(logs, h.id);
          const r7 = getRate(logs, h.id, 7);
          const r30 = getRate(logs, h.id, 30);
          const totalHabitMin = Object.values(logs).filter(d => d[h.id] === true).length * (h.duration || 0);
          return (
            <View key={h.id} style={st.breakdownCard}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: h.color || C.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{h.icon}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, flex: 1 }}>{h.name}</Text>
                    {h.habitDirection === 'quit' && (
                      <View style={{ backgroundColor: C.dangerPale, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, color: C.danger, fontWeight: '800' }}>QUIT HABIT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: h.habitDirection === 'quit' ? C.danger : C.gold, fontWeight: '700' }}>
                    {h.habitDirection === 'quit' ? `🚫 ${streak}d clean` : `🔥 ${streak}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4, marginVertical: 6 }}>
                  {last7.map(dk => {
                    const isRest = !!h.restDays?.includes(new Date(dk.key + 'T00:00:00').getDay());
                    const status = logs[dk.key]?.[h.id];
                    const isMeas = h.habitType === 'measurable';
                    const done = isMeas
                      ? (typeof status === 'number' && (h.dailyTarget ? status >= h.dailyTarget : status > 0))
                      : status === true;
                    const notdone = status === 'notdone';
                    const cellColor = isRest ? C.textMuted + '33' : done ? (h.color || C.primary) : notdone ? C.danger + '55' : C.section;
                    return <View key={dk.key} style={{ flex: 1, height: 16, borderRadius: 4, backgroundColor: cellColor }} />;
                  })}
                </View>
                <Text style={{ fontSize: 11, color: C.textSub }}>7d: {r7}% · 30d: {r30}%{totalHabitMin > 0 ? ` · ⏱️ ${(totalHabitMin / 60).toFixed(1)}h` : ''}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function GoalsScreen({ goals, setGoals }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('30');
  const [reward, setReward] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const GEMOJIS = ['🎯', '💪', '📚', '🏃', '💧', '🧘', '💰', '❤️', '🏆', '🌟'];
  const RCHIPS = [{ e: '🎬', l: 'Movie night' }, { e: '🍕', l: 'Cheat meal' }, { e: '🛍️', l: 'Shopping' }, { e: '☕', l: 'Coffee' }, { e: '🎮', l: 'Gaming' }];
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => false); return () => handler.remove(); }, []);
  const add = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Enter goal name.'); return; }
    const g = { id: `g_${Date.now()}`, title: title.trim(), target: parseInt(target) || 30, current: 0, reward, emoji };
    const u = [...goals, g];
    setGoals(u); await Store.set('goals', u);
    setTitle(''); setTarget('30'); setReward(''); setEmoji('🎯'); setShowAdd(false);
  };
  const inc = async (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const u = goals.map(g => g.id === id ? { ...g, current: Math.min(g.current + 1, g.target) } : g);
    setGoals(u); await Store.set('goals', u);
  };
  const del = async (id) => {
    Alert.alert('Delete', 'Remove this goal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { const u = goals.filter(g => g.id !== id); setGoals(u); await Store.set('goals', u); } },
    ]);
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
      <LinearGradient colors={['#FF6B9D', '#FF8C42']} style={st.screenHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={st.screenHeaderTitle}>🎯 Goals & Rewards</Text>
        <Text style={st.screenHeaderSub}>Set goals, earn rewards</Text>
        <TouchableOpacity onPress={() => setShowAdd(v => !v)} style={st.headerAddBtn}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{showAdd ? '✕ Cancel' : '＋ New Goal'}</Text>
        </TouchableOpacity>
      </LinearGradient>
      {showAdd && (
        <View style={{ margin: 16, backgroundColor: C.card, borderRadius: 20, padding: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 12 }}>Create Goal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {GEMOJIS.map(e => (
              <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[{ width: 44, height: 44, borderRadius: 10, backgroundColor: C.section, alignItems: 'center', justifyContent: 'center' }, emoji === e && { backgroundColor: C.primaryPale, borderWidth: 2, borderColor: C.primary }]}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={st.inputFull} value={title} onChangeText={setTitle} placeholder="Goal name" placeholderTextColor={C.textMuted} />
          <TextInput style={st.inputFull} value={target} onChangeText={setTarget} placeholder="Target count" placeholderTextColor={C.textMuted} keyboardType="numeric" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSub, marginBottom: 8 }}>🏆 Reward</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {RCHIPS.map(r => (
              <TouchableOpacity key={r.l} onPress={() => setReward(r.l)} style={[{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.section, borderRadius: 99 }, reward === r.l && { backgroundColor: C.goldPale, borderWidth: 1.5, borderColor: C.gold }]}>
                <Text style={{ fontSize: 12, color: C.textSub, fontWeight: '600' }}>{r.e} {r.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={st.inputFull} value={reward} onChangeText={setReward} placeholder="Custom reward…" placeholderTextColor={C.textMuted} />
          <TouchableOpacity onPress={add}>
            <LinearGradient colors={[C.primary, C.primaryLight]} style={{ borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Create Goal 🚀</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ paddingHorizontal: 16 }}>
        {goals.length === 0 && !showAdd && (
          <View style={st.empty}>
            <Text style={{ fontSize: 52 }}>🏆</Text>
            <Text style={st.emptyTitle}>No goals yet</Text>
            <Text style={st.emptySub}>Tap + New Goal to get started</Text>
          </View>
        )}
        {goals.map(g => {
          const pct = Math.min(g.current / g.target, 1);
          const done = g.current >= g.target;
          return (
            <View key={g.id} style={[st.goalCard, done && { borderColor: C.success + '60' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.primaryPale, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28 }}>{g.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{g.title}</Text>
                  {g.reward ? <Text style={{ fontSize: 12, color: C.gold, marginTop: 2 }}>🏆 {g.reward}</Text> : null}
                </View>
                {!done && (
                  <TouchableOpacity onPress={() => inc(g.id)} style={{ backgroundColor: C.primaryPale, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                    <Text style={{ color: C.primary, fontWeight: '900', fontSize: 14 }}>+1</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => del(g.id)} style={{ backgroundColor: C.dangerPale, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                  <Text style={{ color: C.danger, fontWeight: '700', fontSize: 14 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 8, backgroundColor: C.section, borderRadius: 99, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: done ? C.success : C.primary, borderRadius: 99 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: C.textSub, fontWeight: '700' }}>{g.current} / {g.target}</Text>
                <Text style={{ fontSize: 12, color: C.primary, fontWeight: '800' }}>{Math.round(pct * 100)}%</Text>
              </View>
              {done && (
                <View style={{ backgroundColor: C.successPale, borderRadius: 10, padding: 10, marginTop: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: C.success, fontWeight: '700' }}>🎉 Goal achieved! Enjoy: {g.reward || 'your reward'}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function MacroBar({ label, value, target, color }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const over = target > 0 && value > target;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.text }}>{label}</Text>
        <Text style={{ fontSize: 12, color: over ? C.danger : C.textSub, fontWeight: '700' }}>{Math.round(value)}g / {target}g{over ? ' ⚠️' : ''}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: C.section, borderRadius: 99, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: over ? C.danger : color, borderRadius: 99 }} />
      </View>
    </View>
  );
}

function BodyProfileForm({ existing, onSave, onCancel }) {
  const [sex, setSex] = useState(existing?.sex || 'male');
  const [age, setAge] = useState(existing?.age ? String(existing.age) : '');
  const [heightCm, setHeightCm] = useState(existing?.heightCm ? String(existing.heightCm) : '');
  const [weightKg, setWeightKg] = useState(existing?.weightKg ? String(existing.weightKg) : '');
  const [activityLevel, setActivityLevel] = useState(existing?.activityLevel || 'light');
  const [goal, setGoal] = useState(existing?.goal || 'maintain');
  const valid = age && heightCm && weightKg && parseFloat(age) > 0 && parseFloat(heightCm) > 0 && parseFloat(weightKg) > 0;
  const save = () => {
    if (!valid) { Alert.alert('Missing details', 'Enter your age, height and weight to calculate your targets.'); return; }
    onSave({ sex, age: parseFloat(age), heightCm: parseFloat(heightCm), weightKg: parseFloat(weightKg), activityLevel, goal });
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
      <LinearGradient colors={['#43AA8B', '#4CC9F0']} style={st.screenHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={st.screenHeaderTitle}>🍎 Body Details</Text>
        <Text style={st.screenHeaderSub}>Used to calculate your daily calorie & macro targets</Text>
      </LinearGradient>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={st.label}>Sex</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          {['male', 'female'].map(s => (
            <TouchableOpacity key={s} onPress={() => setSex(s)}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: sex === s ? C.primary : C.border, backgroundColor: sex === s ? C.primary + '15' : C.card }}>
              <Text style={{ fontWeight: '700', color: sex === s ? C.primary : C.text, textTransform: 'capitalize' }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>Age</Text>
            <TextInput style={st.inputFull} value={age} onChangeText={setAge} placeholder="e.g. 28" placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>Height (cm)</Text>
            <TextInput style={st.inputFull} value={heightCm} onChangeText={setHeightCm} placeholder="e.g. 170" placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>Weight (kg)</Text>
            <TextInput style={st.inputFull} value={weightKg} onChangeText={setWeightKg} placeholder="e.g. 65" placeholderTextColor={C.textMuted} keyboardType="numeric" maxLength={5} />
          </View>
        </View>
        <Text style={st.label}>Activity Level</Text>
        <View style={{ marginBottom: 18 }}>
          {ACTIVITY_LEVELS.map(a => (
            <TouchableOpacity key={a.id} onPress={() => setActivityLevel(a.id)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: activityLevel === a.id ? C.primary : C.border, backgroundColor: activityLevel === a.id ? C.primary + '15' : C.card, marginBottom: 8 }}>
              <View>
                <Text style={{ fontWeight: '700', color: activityLevel === a.id ? C.primary : C.text }}>{a.label}</Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{a.desc}</Text>
              </View>
              {activityLevel === a.id && <Text style={{ color: C.primary, fontWeight: '900' }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={st.label}>Goal</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
          {NUTRITION_GOALS.map(g => (
            <TouchableOpacity key={g.id} onPress={() => setGoal(g.id)}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: goal === g.id ? C.primary : C.border, backgroundColor: goal === g.id ? C.primary + '15' : C.card }}>
              <Text style={{ fontWeight: '700', fontSize: 12, color: goal === g.id ? C.primary : C.text, textAlign: 'center' }}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={save}>
          <LinearGradient colors={[C.primary, C.primaryLight]} style={{ borderRadius: 14, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Calculate My Targets</Text>
          </LinearGradient>
        </TouchableOpacity>
        {existing && (
          <TouchableOpacity onPress={onCancel} style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: C.textMuted, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function AddFoodModal({ visible, onClose, onAdd }) {
  const [mode, setMode] = useState('search');
  const [meal, setMeal] = useState('breakfast');
  const [search, setSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [multiplier, setMultiplier] = useState('1');
  const [customName, setCustomName] = useState('');
  const [customCal, setCustomCal] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFiber, setCustomFiber] = useState('');

  useEffect(() => {
    if (visible) {
      setMode('search'); setSearch(''); setSelectedFood(null); setMultiplier('1');
      setCustomName(''); setCustomCal(''); setCustomProtein(''); setCustomFat(''); setCustomCarbs(''); setCustomFiber('');
    }
  }, [visible]);

  const results = search.trim() ? FOOD_DB.filter(f => f.name.toLowerCase().includes(search.trim().toLowerCase())) : FOOD_DB;

  const add = () => {
    if (mode === 'search') {
      if (!selectedFood) return;
      const m = parseFloat(multiplier) || 1;
      onAdd({
        id: `f_${Date.now()}`, meal,
        name: `${selectedFood.name}${m !== 1 ? ` (×${m})` : ''}`,
        cal: selectedFood.cal * m, protein: selectedFood.protein * m,
        fat: selectedFood.fat * m, carbs: selectedFood.carbs * m, fiber: selectedFood.fiber * m,
      });
    } else {
      if (!customName.trim() || !customCal) { Alert.alert('Missing info', 'Enter at least a name and calories.'); return; }
      onAdd({
        id: `f_${Date.now()}`, meal, name: customName.trim(),
        cal: parseFloat(customCal) || 0, protein: parseFloat(customProtein) || 0,
        fat: parseFloat(customFat) || 0, carbs: parseFloat(customCarbs) || 0, fiber: parseFloat(customFiber) || 0,
      });
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={rm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[rm.sheet, { maxHeight: '85%' }]}>
          <LinearGradient colors={['#43AA8B', '#4CC9F0']} style={rm.sheetHeader}>
            <Text style={rm.sheetTitle}>🍽️ Add Food</Text>
          </LinearGradient>
          <ScrollView style={{ padding: 20 }} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {MEALS.map(m => (
                <TouchableOpacity key={m.id} onPress={() => setMeal(m.id)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: meal === m.id ? C.primary : C.border, backgroundColor: meal === m.id ? C.primary + '15' : C.card }}>
                  <Text style={{ fontSize: 16 }}>{m.icon}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: meal === m.id ? C.primary : C.textSub, marginTop: 2 }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[{ id: 'search', l: '🔍 Search Food' }, { id: 'custom', l: '✏️ Custom Entry' }].map(t => (
                <TouchableOpacity key={t.id} onPress={() => setMode(t.id)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: mode === t.id ? C.primary : C.border, backgroundColor: mode === t.id ? C.primary + '15' : C.card }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: mode === t.id ? C.primary : C.text }}>{t.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {mode === 'search' ? (
              <>
                <TextInput style={st.inputFull} value={search} onChangeText={setSearch} placeholder="Search foods…" placeholderTextColor={C.textMuted} />
                <View style={{ maxHeight: 220 }}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {results.map(f => {
                      const oil = getOilLevel(f.cal, f.fat);
                      return (
                        <TouchableOpacity key={f.name} onPress={() => { Haptics.selectionAsync(); setSelectedFood(f); }}
                          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: selectedFood?.name === f.name ? C.primary + '15' : C.section, marginBottom: 6, borderWidth: selectedFood?.name === f.name ? 1.5 : 0, borderColor: C.primary }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{f.name}</Text>
                            <Text style={{ fontSize: 11, color: C.textMuted }}>{f.serving} · {f.cal} kcal · P{f.protein} F{f.fat} C{f.carbs} · Fi{f.fiber}</Text>
                            {oil && <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{oil.emoji} {oil.label} ({oil.pct}% of kcal)</Text>}
                          </View>
                          {selectedFood?.name === f.name && <Text style={{ color: C.primary, fontWeight: '900' }}>✓</Text>}
                        </TouchableOpacity>
                      );
                    })}
                    {results.length === 0 && <Text style={{ color: C.textMuted, textAlign: 'center', padding: 12 }}>No matches — try Custom Entry</Text>}
                  </ScrollView>
                </View>
                {selectedFood && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={st.label}>Servings (×{selectedFood.serving})</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['0.5', '1', '1.5', '2', '3'].map(v => (
                        <TouchableOpacity key={v} onPress={() => setMultiplier(v)}
                          style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: multiplier === v ? C.primary : C.border, backgroundColor: multiplier === v ? C.primary + '15' : C.card }}>
                          <Text style={{ fontWeight: '700', color: multiplier === v ? C.primary : C.text }}>×{v}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </>
            ) : (
              <>
                <TextInput style={st.inputFull} value={customName} onChangeText={setCustomName} placeholder="Food name" placeholderTextColor={C.textMuted} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[st.inputFull, { flex: 1 }]} value={customCal} onChangeText={setCustomCal} placeholder="Calories" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                  <TextInput style={[st.inputFull, { flex: 1 }]} value={customProtein} onChangeText={setCustomProtein} placeholder="Protein g" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[st.inputFull, { flex: 1 }]} value={customFat} onChangeText={setCustomFat} placeholder="Fat g" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                  <TextInput style={[st.inputFull, { flex: 1 }]} value={customCarbs} onChangeText={setCustomCarbs} placeholder="Carbs g" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                  <TextInput style={[st.inputFull, { flex: 1 }]} value={customFiber} onChangeText={setCustomFiber} placeholder="Fiber g" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                </View>
              </>
            )}
            <TouchableOpacity onPress={add} style={{ marginTop: 10 }}>
              <LinearGradient colors={['#43AA8B', '#4CC9F0']} style={{ borderRadius: 12, padding: 15, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add to Log</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function NutritionScreen({ foodLog, setFoodLog, bodyProfile, setBodyProfile }) {
  const [date, setDate] = useState(getTodayKey());
  const [editingProfile, setEditingProfile] = useState(false);
  const [showAddFood, setShowAddFood] = useState(false);
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => false); return () => handler.remove(); }, []);

  const saveProfile = async (profile) => {
    setBodyProfile(profile);
    await Store.set('bodyProfile', profile);
    setEditingProfile(false);
  };

  if (!bodyProfile || editingProfile) {
    return <BodyProfileForm existing={bodyProfile} onSave={saveProfile} onCancel={() => setEditingProfile(false)} />;
  }

  const targets = calcNutritionTargets(bodyProfile);
  const entries = foodLog[date] || [];
  const consumed = sumNutrition(entries);
  const remaining = { cal: targets.calories - consumed.cal, protein: targets.protein - consumed.protein, fat: targets.fat - consumed.fat, carbs: targets.carbs - consumed.carbs, fiber: targets.fiber - consumed.fiber };
  const overCal = consumed.cal > targets.calories;
  const calPct = targets.calories > 0 ? Math.min(consumed.cal / targets.calories, 1) : 0;

  const suggestions = (() => {
    if (remaining.cal <= 50) return [];
    return FOOD_DB
      .filter(f => f.cal > 0 && f.cal <= remaining.cal + 30)
      .map(f => ({ ...f, score: (remaining.protein > 0 ? (f.protein / f.cal) * 100 : 0) + (remaining.fiber > 0 ? (f.fiber / f.cal) * 40 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  })();

  const addFood = async (entry) => {
    const nf = { ...foodLog, [date]: [...(foodLog[date] || []), entry] };
    setFoodLog(nf);
    await Store.set('foodLog', nf);
  };
  const deleteFood = async (id) => {
    const nf = { ...foodLog, [date]: (foodLog[date] || []).filter(e => e.id !== id) };
    setFoodLog(nf);
    await Store.set('foodLog', nf);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <LinearGradient colors={['#43AA8B', '#4CC9F0']} style={st.screenHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={st.screenHeaderTitle}>🍎 Nutrition</Text>
              <Text style={st.screenHeaderSub}>{getDateStr(date)}</Text>
            </View>
            <TouchableOpacity onPress={() => setEditingProfile(true)} style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: 10 }}>
              <Text style={{ fontSize: 16 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity onPress={() => setDate(addDaysKey(date, -1))} style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>‹ Prev</Text>
            </TouchableOpacity>
            {date !== getTodayKey() && (
              <TouchableOpacity onPress={() => setDate(getTodayKey())} style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Today</Text>
              </TouchableOpacity>
            )}
            {date < getTodayKey() && (
              <TouchableOpacity onPress={() => setDate(addDaysKey(date, 1))} style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Next ›</Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 16, backgroundColor: C.card, borderRadius: 20, padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
            <View>
              <Text style={{ fontSize: 28, fontWeight: '900', color: overCal ? C.danger : C.text }}>{Math.round(consumed.cal)}</Text>
              <Text style={{ fontSize: 12, color: C.textSub }}>of {targets.calories} kcal</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '800', color: overCal ? C.danger : C.success }}>
              {overCal ? `+${Math.round(consumed.cal - targets.calories)} over` : `${Math.round(targets.calories - consumed.cal)} left`}
            </Text>
          </View>
          <View style={{ height: 10, backgroundColor: C.section, borderRadius: 99, overflow: 'hidden', marginBottom: 16 }}>
            <View style={{ height: '100%', width: `${calPct * 100}%`, backgroundColor: overCal ? C.danger : '#43AA8B', borderRadius: 99 }} />
          </View>
          <MacroBar label="Protein" value={consumed.protein} target={targets.protein} color="#4F8EF7" />
          <MacroBar label="Fat" value={consumed.fat} target={targets.fat} color={C.gold} />
          <MacroBar label="Carbs" value={consumed.carbs} target={targets.carbs} color="#9B5DE5" />
          <MacroBar label="Fiber" value={consumed.fiber} target={targets.fiber} color="#43AA8B" />
        </View>
        {suggestions.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: C.successPale, borderRadius: 16, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.success, marginBottom: 8 }}>💡 Best to eat next</Text>
            {suggestions.map(f => {
              const oil = getOilLevel(f.cal, f.fat);
              return (
                <Text key={f.name} style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>• {f.name} ({f.serving}) — {f.cal} kcal, {f.protein}g protein{oil ? ` · ${oil.emoji} ${oil.label}` : ''}</Text>
              );
            })}
          </View>
        )}
        {overCal && (
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: C.dangerPale, borderRadius: 16, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.danger }}>⚠️ You're over your calorie budget today</Text>
            <Text style={{ fontSize: 12, color: C.text, marginTop: 4 }}>Consider a lighter, high-fiber meal for the rest of the day, or a short walk to balance it out.</Text>
          </View>
        )}
        <View style={{ paddingHorizontal: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.secTitle}>Food Log</Text>
          <TouchableOpacity onPress={() => setShowAddFood(true)} style={{ backgroundColor: C.primary, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>＋ Add Food</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          {entries.length === 0 && (
            <View style={st.empty}>
              <Text style={{ fontSize: 44 }}>🍽️</Text>
              <Text style={st.emptySub}>No food logged for this day yet</Text>
            </View>
          )}
          {MEALS.map(m => {
            const mealEntries = entries.filter(e => e.meal === m.id);
            if (mealEntries.length === 0) return null;
            return (
              <View key={m.id} style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.textMuted, marginBottom: 6, textTransform: 'uppercase' }}>{m.icon} {m.label}</Text>
                {mealEntries.map(e => {
                  const oil = getOilLevel(e.cal, e.fat);
                  return (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{e.name}</Text>
                      <Text style={{ fontSize: 11, color: C.textMuted }}>{Math.round(e.cal)} kcal · P{Math.round(e.protein)} F{Math.round(e.fat)} C{Math.round(e.carbs)} Fi{Math.round(e.fiber)}</Text>
                      {oil && <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{oil.emoji} {oil.label} ({oil.pct}% of kcal)</Text>}
                    </View>
                    <TouchableOpacity onPress={() => deleteFood(e.id)} style={{ backgroundColor: C.dangerPale, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: C.danger, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <AddFoodModal visible={showAddFood} onClose={() => setShowAddFood(false)} onAdd={addFood} />
    </View>
  );
}

function ProfileScreen({ user, setUser, habits, logs, moods, setHabits, setLogs, setMoods, foodLog, bodyProfile }) {
  const [editName, setEditName] = useState(false);
  const [tmpName, setTmpName] = useState('');
  const [showInsights, setShowInsights] = useState(false);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash');
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [editingAiKey, setEditingAiKey] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');
  useEffect(() => {
    Store.get('aiSettings', null).then(s => {
      if (s?.apiKey) { setAiApiKey(s.apiKey); setAiModel(s.model || 'gemini-2.0-flash'); }
      else setEditingAiKey(true);
    });
  }, []);
  const saveAiKey = async () => {
    if (!aiKeyInput.trim()) return;
    const settings = { apiKey: aiKeyInput.trim(), model: aiModel };
    await Store.set('aiSettings', settings);
    setAiApiKey(settings.apiKey);
    setEditingAiKey(false);
    setAiKeyInput('');
  };
  const askAiCoach = async () => {
    setAiLoading(true); setAiError(''); setAiResult('');
    try {
      const prompt = buildAICoachPrompt(habits, logs, moods, foodLog, bodyProfile);
      const text = await callGemini(aiApiKey, aiModel, prompt);
      setAiResult(text);
    } catch (e) {
      setAiError(e.message || 'Something went wrong talking to Gemini.');
    } finally {
      setAiLoading(false);
    }
  };
  const info = getLevelInfo(user.xp);
  const bestStreak = habits.reduce((b, h) => { const s = getStreak(logs, h.id); return s > b ? s : b; }, 0);
  const totalDone = Object.values(logs).reduce((a, d) => a + Object.values(d).filter(v => v === true).length, 0);
  const insights = generateInsights(habits, logs, moods);
  useEffect(() => { const handler = BackHandler.addEventListener('hardwareBackPress', () => false); return () => handler.remove(); }, []);
  const BADGES = [
    { e: '🌱', l: 'First Habit', d: 'Create first habit', ok: () => habits.length >= 1 },
    { e: '🔥', l: 'Week Warrior', d: '7-day streak', ok: () => habits.some(h => getStreak(logs, h.id) >= 7) },
    { e: '⚡', l: 'Monthly Master', d: '30-day streak', ok: () => habits.some(h => getStreak(logs, h.id) >= 30) },
    { e: '💪', l: 'Full Stack', d: '5+ habits', ok: () => habits.length >= 5 },
    { e: '⭐', l: 'Perfect Day', d: 'All habits done today', ok: () => { const k = getTodayKey(), dl = logs[k] || {}; return habits.length > 0 && habits.every(h => dl[h.id] === true); } },
    { e: '🏆', l: 'Level 5', d: 'Reach Level 5', ok: () => info.current.level >= 5 },
    { e: '💎', l: 'Diamond', d: 'Earn 500 XP', ok: () => user.xp >= 500 },
    { e: '😄', l: 'Mood Tracker', d: 'Log mood 7 days', ok: () => { for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (!moods[k]) return false; } return true; } },
  ];
  const saveName = async () => {
    if (!tmpName.trim()) return;
    const u = { ...user, name: tmpName.trim() };
    setUser(u); await Store.set('user', u); setEditName(false);
  };
  const reset = () => Alert.alert('Reset All', 'Delete all data?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Reset', style: 'destructive', onPress: async () => {
        await Promise.all([Store.set('habits', []), Store.set('logs', {}), Store.set('moods', {}), Store.set('user', { xp: 0, name: user.name }), Store.set('remarks', {}), Store.set('goals', [])]);
        setHabits([]); setLogs({}); setMoods({}); setUser({ xp: 0, name: user.name });
      }
    },
  ]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
      <LinearGradient colors={[C.primary, '#4CC9F0']} style={[st.screenHeader, { alignItems: 'center', paddingBottom: 30 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)', padding: 3, marginBottom: 12 }}>
          <View style={{ flex: 1, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff' }}>{(user.name || 'C')[0].toUpperCase()}</Text>
          </View>
        </View>
        {editName
          ? <TextInput style={st.nameInput} value={tmpName} onChangeText={setTmpName} autoFocus onBlur={saveName} onSubmitEditing={saveName} maxLength={20} />
          : <TouchableOpacity onPress={() => { setTmpName(user.name); setEditName(true); }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 }}>{user.name} ✏️</Text>
          </TouchableOpacity>
        }
        <View style={{ backgroundColor: 'rgba(255,255,255,0.20)', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>⚡ Level {info.current.level} · {info.current.title}</Text>
        </View>
      </LinearGradient>
      <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: C.card, borderRadius: 20, overflow: 'hidden' }}>
        <TouchableOpacity onPress={() => setShowInsights(v => !v)} style={{ padding: 16 }}>
          <LinearGradient colors={[C.primary, C.primaryLight]} style={{ borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>🧠 Quick Insights</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)', marginTop: 2 }}>Instant, offline habit personality read</Text>
            </View>
            <Text style={{ fontSize: 24 }}>{showInsights ? '▲' : '▼'}</Text>
          </LinearGradient>
        </TouchableOpacity>
        {showInsights && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {insights.map((insight, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 12, backgroundColor: C.section, borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 13, color: C.text, flex: 1, lineHeight: 20 }}>{insight}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: C.card, borderRadius: 20, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>🤖 AI Coach</Text>
          <View style={{ backgroundColor: '#43AA8B22', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, color: '#43AA8B', fontWeight: '800' }}>GEMINI · FREE</Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Real AI advice on what to do and avoid, based on your actual habits, mood & food data.</Text>
        {editingAiKey ? (
          <View>
            <Text style={{ fontSize: 12, color: C.textSub, lineHeight: 18, marginBottom: 10 }}>
              Get a free API key from Google AI Studio, then paste it below. It's stored only on this device and used to call Gemini directly.
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://aistudio.google.com/apikey')} style={{ marginBottom: 10 }}>
              <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }}>🔗 Open Google AI Studio to get a key</Text>
            </TouchableOpacity>
            <TextInput style={st.inputFull} value={aiKeyInput} onChangeText={setAiKeyInput} placeholder="Paste your Gemini API key" placeholderTextColor={C.textMuted} secureTextEntry autoCapitalize="none" />
            <TouchableOpacity onPress={saveAiKey} style={{ backgroundColor: '#43AA8B', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Save Key</Text>
            </TouchableOpacity>
            {aiApiKey ? (
              <TouchableOpacity onPress={() => setEditingAiKey(false)} style={{ padding: 10, alignItems: 'center' }}>
                <Text style={{ color: C.textMuted, fontWeight: '700', fontSize: 12 }}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View>
            <TouchableOpacity onPress={askAiCoach} disabled={aiLoading} style={{ backgroundColor: '#43AA8B', borderRadius: 12, padding: 14, alignItems: 'center', opacity: aiLoading ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{aiLoading ? 'Thinking…' : '✨ Get Today’s AI Advice'}</Text>
            </TouchableOpacity>
            {aiError ? (
              <View style={{ backgroundColor: C.dangerPale, borderRadius: 12, padding: 12, marginTop: 10 }}>
                <Text style={{ color: C.danger, fontSize: 12, fontWeight: '600' }}>{aiError}</Text>
              </View>
            ) : null}
            {aiResult ? (
              <View style={{ backgroundColor: C.section, borderRadius: 12, padding: 14, marginTop: 10 }}>
                <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>{aiResult}</Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={() => { setAiKeyInput(''); setEditingAiKey(true); }} style={{ padding: 10, alignItems: 'center' }}>
              <Text style={{ color: C.textMuted, fontWeight: '700', fontSize: 12 }}>Change API key</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: C.card, borderRadius: 20, padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.primary }}>{user.xp} XP</Text>
          {info.next && <Text style={{ fontSize: 11, color: C.textSub, alignSelf: 'flex-end' }}>→ {info.next.title} ({info.next.xp} XP)</Text>}
        </View>
        <View style={{ height: 10, backgroundColor: C.section, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
          <View style={{ height: '100%', width: `${info.progress * 100}%`, backgroundColor: C.primary, borderRadius: 99 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {LEVELS.map(l => (
            <View key={l.level} style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.section, alignItems: 'center', justifyContent: 'center' }, user.xp >= l.xp && { backgroundColor: C.primary }]}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: user.xp >= l.xp ? '#fff' : C.text }}>{l.level}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 }}>
        {[{ v: habits.length, l: 'Habits', c: '#4F8EF7' }, { v: `🔥${bestStreak}`, l: 'Streak', c: C.gold }, { v: totalDone, l: 'Total Done', c: C.success }, { v: BADGES.filter(b => b.ok()).length, l: 'Badges', c: '#FF6B9D' }].map((x, i) => (
          <View key={i} style={[st.statCard, { borderTopColor: x.c, borderTopWidth: 4 }]}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: x.c }}>{x.v}</Text>
            <Text style={{ fontSize: 9, color: C.textSub, marginTop: 2, fontWeight: '700', textAlign: 'center' }}>{x.l}</Text>
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <Text style={st.secTitle}>🏅 Badges</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {BADGES.map((b, i) => {
            const ok = b.ok();
            return (
              <View key={i} style={[{ width: '47%', backgroundColor: C.card, borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1.5 }, ok ? { borderColor: C.primaryPale } : { borderColor: C.border }]}>
                <Text style={{ fontSize: 30, marginBottom: 6, opacity: ok ? 1 : 0.2 }}>{b.e}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: ok ? C.text : C.textMuted, textAlign: 'center' }}>{b.l}</Text>
                <Text style={{ fontSize: 10, color: C.textMuted, textAlign: 'center', marginTop: 2 }}>{b.d}</Text>
                {ok && <Text style={{ fontSize: 11, color: C.success, fontWeight: '700', marginTop: 6 }}>✓ Earned</Text>}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={reset} style={{ backgroundColor: C.dangerPale, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: C.danger + '40' }}>
          <Text style={{ color: C.danger, fontWeight: '700', fontSize: 14 }}>🗑️ Reset All Data</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function HabitDetailScreen({ habit, logs, remarks, onBack, onEdit, onDelete }) {
  const streak = getStreak(logs, habit.id);
  const r7 = getRate(logs, habit.id, 7);
  const r30 = getRate(logs, habit.id, 30);
  const color = habit.color || C.primary;
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => handler.remove();
  }, []);
  const days = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const remark = remarks[`${key}_${habit.id}`];
    const status = logs[key]?.[habit.id];
    const isRest = !!habit.restDays?.includes(d.getDay());
    days.push({ key, date: d.getDate(), done: status === true, notdone: status === 'notdone', isRest, isToday: i === 0, remark });
  }
  const remarkDays = days.filter(d => d.remark && (d.done || d.notdone)).reverse().slice(0, 10);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
      <LinearGradient colors={[color, color + 'BB']} style={[st.screenHeader, { alignItems: 'center' }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <TouchableOpacity onPress={onBack} style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 15 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 56, marginBottom: 8 }}>{habit.icon}</Text>
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 8 }}>{habit.name}</Text>
        {habit.duration > 0 && <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.80)', marginBottom: 8 }}>⏱️ {habit.duration} min per session</Text>}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>🔥 {streak} day{streak !== 1 ? 's' : ''} streak</Text>
        </View>
      </LinearGradient>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 }}>
        {[{ v: `${r7}%`, l: '7-day rate' }, { v: `${r30}%`, l: '30-day rate' }, { v: streak, l: 'Streak' }].map((x, i) => (
          <View key={i} style={[st.statCard, { borderTopColor: color, borderTopWidth: 4 }]}>
            <Text style={{ fontSize: 18, fontWeight: '900', color }}>{x.v}</Text>
            <Text style={{ fontSize: 10, color: C.textSub, marginTop: 4, fontWeight: '600', textAlign: 'center' }}>{x.l}</Text>
          </View>
        ))}
      </View>
      {habit.alarms?.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={st.secTitle}>⏰ Alarms</Text>
          {habit.alarms.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 6 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color }}>{fmtAlarm(a)}</Text>
              <Text style={{ fontSize: 12, color: C.textMuted }}>Repeats daily</Text>
            </View>
          ))}
        </View>
      )}
      {habit.restDays?.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={st.secTitle}>😴 Rest Days</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {habit.restDays.map(d => (
              <View key={d} style={{ backgroundColor: C.section, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, color: C.textSub, fontWeight: '700' }}>{DAYS[d]}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <Text style={st.secTitle}>📅 Last 35 Days</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          {days.map((d, i) => (
            <View key={i} style={[{ width: 38, height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, d.done && { backgroundColor: color }, d.notdone && !d.isRest && { backgroundColor: C.danger + '44' }, !d.done && !d.notdone && !d.isRest && { backgroundColor: C.section }, d.isRest && { backgroundColor: C.textMuted + '33' }, d.isToday && { borderWidth: 2, borderColor: color }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: d.done ? '#fff' : d.isRest ? C.textMuted : d.notdone ? C.danger : C.textSub }}>{d.date}</Text>
              {d.isRest ? <Text style={{ fontSize: 9 }}>😴</Text> : <>
                {d.done && <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>}
                {d.notdone && <Text style={{ fontSize: 9, color: C.danger, fontWeight: '900' }}>✕</Text>}
              </>}
              {d.remark && <Text style={{ fontSize: 9 }}>{d.remark.emoji}</Text>}
            </View>
          ))}
        </View>
      </View>
      {remarkDays.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={st.secTitle}>💬 Recent Remarks</Text>
          {remarkDays.map((d, i) => (
            <View key={i} style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 28 }}>{d.remark.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: '600' }}>{getDateStr(d.key)}</Text>
                  {d.remark.note
                    ? <Text style={{ fontSize: 14, color: C.text, marginTop: 2, fontWeight: '500' }}>{d.remark.note}</Text>
                    : <Text style={{ fontSize: 13, color: C.textSub, marginTop: 2, fontStyle: 'italic' }}>No note added</Text>
                  }
                </View>
                <View style={{ backgroundColor: d.done ? C.successPale : C.dangerPale, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: d.done ? C.success : C.danger, fontWeight: '700' }}>{d.done ? '✓ Done' : '✕ Missed'}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <TouchableOpacity onPress={onEdit}>
          <LinearGradient colors={[color, color + 'CC']} style={{ borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>✏️ Edit Habit</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{ backgroundColor: C.dangerPale, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: C.danger + '40' }}>
          <Text style={{ color: C.danger, fontWeight: '700', fontSize: 14 }}>🗑️ Delete Habit</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function FullScreenAlarmModal({ visible, habitData, onDone, onSkip }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(60)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const soundRef = useRef(null);
  const pulseLoop = useRef(null);
  const ringLoop = useRef(null);

  useEffect(() => {
    if (!visible) return;

    slideUp.setValue(60);
    fadeIn.setValue(0);
    ring1.setValue(0); ring2.setValue(0); ring3.setValue(0);
    pulseAnim.setValue(1);

    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
    ]).start();

    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();

    const launchRing = (anim, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.delay(200),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    ringLoop.current = Animated.parallel([
      launchRing(ring1, 0),
      launchRing(ring2, 450),
      launchRing(ring3, 900),
    ]);
    ringLoop.current.start();

    const loadSound = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
        const { sound } = await Audio.Sound.createAsync(
          require('./assets/tick.mp3'),
          { isLooping: true, volume: 1.0 }
        );
        soundRef.current = sound;
        await sound.playAsync();
      } catch (e) {}
    };
    loadSound();

    return () => {
      pulseLoop.current?.stop();
      ringLoop.current?.stop();
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {}).then(() => soundRef.current?.unloadAsync().catch(() => {}));
        soundRef.current = null;
      }
    };
  }, [visible]);

  const stopAndCall = (cb) => {
    pulseLoop.current?.stop();
    ringLoop.current?.stop();
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {}).then(() => soundRef.current?.unloadAsync().catch(() => {}));
      soundRef.current = null;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cb();
  };

  if (!habitData) return null;
  const { habit } = habitData;
  const isHigh = !!habit.highPriority;
  const bg1 = isHigh ? '#2D0010' : '#0D0030';
  const bg2 = isHigh ? '#5C0020' : '#1A0060';
  const bg3 = isHigh ? '#FF1744' : '#6C3CE1';
  const ringSize = width * 2.6;

  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent onRequestClose={() => stopAndCall(onSkip)}>
      <StatusBar style="light" />
      <LinearGradient colors={[bg1, bg2, bg3]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
        {[ring1, ring2, ring3].map((r, i) => (
          <Animated.View key={i} style={{
            position: 'absolute',
            width: ringSize, height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: 1.5,
            borderColor: `rgba(255,255,255,${0.12 - i * 0.03})`,
            transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1.1] }) }],
            opacity: r.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.9, 0.4, 0] }),
          }} />
        ))}

        <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideUp }], alignItems: 'center', width: '100%', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 30, padding: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>
              {isHigh ? '⚡ High Priority Alarm' : '⏰ Habit Alarm'}
            </Text>
          </View>

          <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 20 }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.30)' }}>
              <Text style={{ fontSize: 64 }}>{habit.icon}</Text>
            </View>
          </Animated.View>

          <Text style={{ fontSize: 30, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 10, letterSpacing: -0.5 }}>{habit.name}</Text>
          <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.70)', textAlign: 'center', marginBottom: 48, fontWeight: '600' }}>
            {isHigh ? 'Your priority habit is calling. Act now!' : 'Time to build your habit. Keep the streak going! 🔥'}
          </Text>

          <TouchableOpacity
            onPress={() => stopAndCall(onDone)}
            activeOpacity={0.85}
            style={{ width: '100%', borderRadius: 20, overflow: 'hidden', marginBottom: 14, elevation: 8, shadowColor: '#00D68F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14 }}>
            <LinearGradient colors={['#00C853', '#00A878']} style={{ paddingVertical: 20, alignItems: 'center', borderRadius: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 0.3 }}>✅  Done Now</Text>
              {isHigh && <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.80)', marginTop: 3, fontWeight: '700' }}>+20 XP bonus</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => stopAndCall(onSkip)}
            activeOpacity={0.7}
            style={{ width: '100%', paddingVertical: 16, alignItems: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: 'rgba(255,255,255,0.75)' }}>😔  Skip Today</Text>
            {isHigh && <Text style={{ fontSize: 11, color: 'rgba(255,100,100,0.85)', marginTop: 3, fontWeight: '700' }}>-15 XP</Text>}
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [screen, setScreen] = useState('main');
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState({});
  const [moods, setMoods] = useState({});
  const [user, setUser] = useState({ xp: 0, name: 'Champion' });
  const [goals, setGoals] = useState([]);
  const [remarks, setRemarks] = useState({});
  const [todos, setTodos] = useState({});
  const [todoLogs, setTodoLogs] = useState({});
  const [foodLog, setFoodLog] = useState({});
  const [bodyProfile, setBodyProfile] = useState(null);
  const [editHabit, setEditHabit] = useState(null);
  const [detailHabit, setDetailHabit] = useState(null);
  const [tab, setTab] = useState('home');
  const [celebration, setCelebration] = useState(null);
  const [alarmModal, setAlarmModal] = useState(null);
  const habitsRef = useRef([]);
  const logsRef = useRef({});
  const userRef = useRef({ xp: 0, name: 'Champion' });
  const handledNotificationIds = useRef(new Set());

  useEffect(() => {
    setupNotifications();
    Promise.all([
      Store.get('habits', []),
      Store.get('logs', {}),
      Store.get('moods', {}),
      Store.get('user', { xp: 0, name: 'Champion' }),
      Store.get('goals', []),
      Store.get('remarks', {}),
      Store.get('todos', {}),
      Store.get('todologs', {}),
      Store.get('onboarded', false),
      Store.get('foodLog', {}),
      Store.get('bodyProfile', null),
    ]).then(async ([h, l, m, u, g, r, td, tl, onboarded, fl, bp]) => {
      setHabits(h); setLogs(l); setMoods(m); setUser(u); setGoals(g); setRemarks(r); setTodos(td); setTodoLogs(tl);
      setFoodLog(fl); setBodyProfile(bp);
      habitsRef.current = h;
      if (!onboarded) setShowOnboarding(true);

      reconcileAlarms(h);
      const backfilled = await backfillMissedDays(h, l);
      if (backfilled) { setLogs(backfilled); logsRef.current = backfilled; }

      // Show alarm modal if app was cold-started by tapping the notification
      notifee.getInitialNotification().then((initial) => {
        if (!initial) return;
        const notifId = initial.notification?.id;
        const habitId = initial.notification?.data?.habitId;
        if (!habitId || (notifId && handledNotificationIds.current.has(notifId))) return;
        if (notifId) handledNotificationIds.current.add(notifId);
        const habit = h.find(x => x.id === habitId);
        if (habit) setAlarmModal({ habit });
      });
    });
  }, []);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showMonthly) { setShowMonthly(false); return true; }
      if (screen === 'addHabit' || screen === 'habitDetail') { setScreen('main'); setEditHabit(null); setDetailHabit(null); return true; }
      return false;
    });
    return () => handler.remove();
  }, [screen, showMonthly]);

  useEffect(() => { habitsRef.current = habits; }, [habits]);
  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Handle URL callbacks from AlarmActivity: hadbit://alarm?action=done&habitId=xxx
  useEffect(() => {
    async function handleAlarmUrl(url) {
      if (!url || !url.startsWith('hadbit://alarm')) return;
      try {
        // Manual parse — new URL() doesn't reliably handle custom schemes in RN
        const qIdx = url.indexOf('?');
        if (qIdx === -1) return;
        const params = {};
        url.slice(qIdx + 1).split('&').forEach(pair => {
          const eq = pair.indexOf('=');
          if (eq === -1) return;
          params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
        });
        const { action, habitId } = params;
        if (!action || !habitId) return;

        // Read from Store directly — avoids race with state loading on cold start
        const [habits, logs, user] = await Promise.all([
          Store.get('habits', []),
          Store.get('logs', {}),
          Store.get('user', { xp: 0 }),
        ]);
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return;

        if (action === 'done') {
          const todayKey = getTodayKey();
          if (logs[todayKey]?.[habitId] === true) return;
          if (!logs[todayKey]) logs[todayKey] = {};
          logs[todayKey][habitId] = true;
          const xpEarned = habit.highPriority ? 20 : 10;
          user.xp = (user.xp || 0) + xpEarned;
          await Promise.all([Store.set('logs', logs), Store.set('user', user)]);
          setLogs(l => ({ ...l, ...logs }));
          setUser(u => ({ ...u, xp: user.xp }));
        } else if (action === 'skip') {
          user.xp = Math.max(0, (user.xp || 0) - 5);
          await Store.set('user', user);
          setUser(u => ({ ...u, xp: user.xp }));
        }
      } catch (e) {}
    }
    Linking.getInitialURL().then(handleAlarmUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleAlarmUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Foreground event: notification arrives while app is open → show full-screen alarm
    const unsub = notifee.onForegroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;
      const habitId = notification?.data?.habitId;
      if (!habitId) return;
      const habit = habitsRef.current.find(h => h.id === habitId);
      if (!habit) return;

      if (type === EventType.DELIVERED) {
        const notifId = notification?.id;
        if (notifId) {
          if (handledNotificationIds.current.has(notifId)) return;
          handledNotificationIds.current.add(notifId);
        }
        setAlarmModal({ habit });
        return;
      }

      if (type === EventType.PRESS && !pressAction?.id) {
        setAlarmModal({ habit });
        return;
      }

      if (type === EventType.ACTION_PRESS) {
        const todayKey = getTodayKey();
        if (pressAction?.id === 'done_now') {
          if (logsRef.current[todayKey]?.[habitId] === true) return;
          const nl = { ...logsRef.current };
          if (!nl[todayKey]) nl[todayKey] = {};
          nl[todayKey][habitId] = true;
          const xpEarned = habit.highPriority ? 20 : 10;
          const nu = { ...userRef.current, xp: userRef.current.xp + xpEarned };
          setLogs(nl); setUser(nu);
          await Store.set('logs', nl); await Store.set('user', nu);
          const streak = getStreak(nl, habitId);
          setCelebration({ habit, streak, xpEarned });
          playApplause();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await notifee.cancelNotification(notification.id);
        } else if (pressAction?.id === 'skip_today') {
          if (habit.highPriority) {
            const nu = { ...userRef.current, xp: Math.max(0, userRef.current.xp - 15) };
            setUser(nu);
            await Store.set('user', nu);
            await scheduleFollowUpReminder(habit.name);
          }
          await notifee.cancelNotification(notification.id);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleAlarmDone = async () => {
    if (!alarmModal) return;
    const { habit } = alarmModal;
    setAlarmModal(null);
    const todayKey = getTodayKey();
    if (logsRef.current[todayKey]?.[habit.id] === true) return;
    const nl = { ...logsRef.current };
    if (!nl[todayKey]) nl[todayKey] = {};
    nl[todayKey][habit.id] = true;
    const xpEarned = habit.highPriority ? 20 : 10;
    const nu = { ...userRef.current, xp: userRef.current.xp + xpEarned };
    setLogs(nl); setUser(nu);
    await Store.set('logs', nl); await Store.set('user', nu);
    const streak = getStreak(nl, habit.id);
    playApplause();
    setCelebration({ habit, streak, xpEarned });
  };

  const handleAlarmSkip = async () => {
    if (!alarmModal) return;
    const { habit } = alarmModal;
    setAlarmModal(null);
    if (!habit.highPriority) return;
    const nu = { ...userRef.current, xp: Math.max(0, userRef.current.xp - 15) };
    setUser(nu);
    await Store.set('user', nu);
    await scheduleFollowUpReminder(habit.name);
  };

  const reloadHabits = async () => { const h = await Store.get('habits', []); setHabits(h); };
  const deleteHabit = (id) => {
    Alert.alert('Delete', 'Remove this habit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await cancelHabitAlarms(id);
          const nh = habits.filter(h => h.id !== id);
          setHabits(nh); await Store.set('habits', nh);
          setScreen('main'); setDetailHabit(null);
        }
      },
    ]);
  };

  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  if (showOnboarding) return <OnboardingScreen onDone={async () => { await Store.set('onboarded', true); setShowOnboarding(false); }} />;
  if (showMonthly) return <MonthlyCalendarScreen habits={habits} logs={logs} onBack={() => setShowMonthly(false)} />;

  const renderScreen = () => {
    if (screen === 'addHabit') return (
      <AddHabitScreen existing={editHabit} onBack={() => { setScreen('main'); setEditHabit(null); }} onSave={async () => { await reloadHabits(); setScreen('main'); setEditHabit(null); }} />
    );
    if (screen === 'habitDetail' && detailHabit) return (
      <HabitDetailScreen habit={detailHabit} logs={logs} remarks={remarks} onBack={() => { setScreen('main'); setDetailHabit(null); }} onEdit={() => { setEditHabit(detailHabit); setScreen('addHabit'); }} onDelete={() => deleteHabit(detailHabit.id)} />
    );
    return (
      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeScreen habits={habits} logs={logs} moods={moods} user={user} remarks={remarks}
            todos={todos} todoLogs={todoLogs} setTodos={setTodos} setTodoLogs={setTodoLogs}
            setUser={setUser} setLogs={setLogs} setMoods={setMoods} setRemarks={setRemarks}
            setHabits={setHabits}
            onAddHabit={() => { setEditHabit(null); setScreen('addHabit'); }}
            onHabitDetail={(h) => { setDetailHabit(h); setScreen('habitDetail'); }}
          />
        )}
        {tab === 'stats' && <StatsScreen habits={habits} logs={logs} moods={moods} onMonthly={() => setShowMonthly(true)} />}
        {tab === 'goals' && <GoalsScreen goals={goals} setGoals={setGoals} />}
        {tab === 'food' && <NutritionScreen foodLog={foodLog} setFoodLog={setFoodLog} bodyProfile={bodyProfile} setBodyProfile={setBodyProfile} />}
        {tab === 'profile' && <ProfileScreen user={user} setUser={setUser} habits={habits} logs={logs} moods={moods} setHabits={setHabits} setLogs={setLogs} setMoods={setMoods} foodLog={foodLog} bodyProfile={bodyProfile} />}
        <View style={st.tabBar}>
          {[{ id: 'home', e: '🏠', l: 'Today' }, { id: 'stats', e: '📊', l: 'Stats' }, { id: 'goals', e: '🎯', l: 'Goals' }, { id: 'food', e: '🍎', l: 'Food' }, { id: 'profile', e: '⚡', l: 'Profile' }].map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={st.tabBtn}>
              <View style={[st.tabInner, tab === t.id && st.tabInnerActive]}>
                <Text style={{ fontSize: 18 }}>{t.e}</Text>
                {tab === t.id && <Text style={st.tabLabel}>{t.l}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      {renderScreen()}
      <CelebrationModal
        visible={!!celebration}
        habit={celebration?.habit}
        streak={celebration?.streak || 0}
        xpEarned={celebration?.xpEarned || 20}
        onClose={() => setCelebration(null)}
      />
      <FullScreenAlarmModal
        visible={!!alarmModal}
        habitData={alarmModal}
        onDone={handleAlarmDone}
        onSkip={handleAlarmSkip}
      />
    </View>
  );
}
