// src/utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  HABITS: 'habitalarm_habits',
  LOGS: 'habitalarm_logs',
  MOOD: 'habitalarm_mood',
  USER: 'habitalarm_user',
  GOALS: 'habitalarm_goals',
};

export const Storage = {
  async getHabits() {
    const raw = await AsyncStorage.getItem(KEYS.HABITS);
    return raw ? JSON.parse(raw) : [];
  },
  async saveHabits(habits) {
    await AsyncStorage.setItem(KEYS.HABITS, JSON.stringify(habits));
  },
  async getLogs() {
    const raw = await AsyncStorage.getItem(KEYS.LOGS);
    return raw ? JSON.parse(raw) : {};
  },
  async saveLogs(logs) {
    await AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(logs));
  },
  async getMoods() {
    const raw = await AsyncStorage.getItem(KEYS.MOOD);
    return raw ? JSON.parse(raw) : {};
  },
  async saveMoods(moods) {
    await AsyncStorage.setItem(KEYS.MOOD, JSON.stringify(moods));
  },
  async getUser() {
    const raw = await AsyncStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : { xp: 0, name: 'Champion' };
  },
  async saveUser(user) {
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  },
  async getGoals() {
    const raw = await AsyncStorage.getItem(KEYS.GOALS);
    return raw ? JSON.parse(raw) : [];
  },
  async saveGoals(goals) {
    await AsyncStorage.setItem(KEYS.GOALS, JSON.stringify(goals));
  },
};

export function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getStreakCount(logs, habitId) {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (logs[key] && logs[key][habitId]) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

export function getCompletionRate(logs, habitId, days = 7) {
  let count = 0;
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (logs[key] && logs[key][habitId]) count++;
  }
  return Math.round((count / days) * 100);
}
