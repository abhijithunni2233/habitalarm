import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createClient } from '@supabase/supabase-js';

// Supabase → Project Settings → API. The publishable/anon key is safe to ship
// in the app; row level security keeps each user to their own backup.
const SUPABASE_URL = 'https://tamrjrcwoeeoxngxudaz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TMnFv6Rlj-wFRkHKGJ9tog_AedxT9up';

export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

// Everything worth keeping if the phone is lost. aiSettings is left out on
// purpose: it holds the user's own Gemini API key.
export const BACKUP_KEYS = [
  'user', 'habits', 'logs', 'moods', 'goals', 'remarks', 'todos', 'todologs',
  'foodLog', 'bodyProfile', 'onboarded', 'lastBackfillDate', 'workoutLog', 'workoutSync',
];

// Local-only bookkeeping (never backed up)
const LINKED_KEY = 'cloud:linkedUser';   // user id this phone is allowed to upload for
const LAST_KEY = 'cloud:lastBackup';
const DIRTY_KEY = 'cloud:dirty';         // a change hasn't reached the cloud yet

const supabase = cloudConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  })
  : null;

let timer = null;
let restoring = false;

async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
}

async function snapshot() {
  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const data = {};
  pairs.forEach(([k, v]) => { if (v != null) { try { data[k] = JSON.parse(v); } catch {} } });
  return data;
}

export const Cloud = {
  getUser,

  async getLastBackup() {
    return AsyncStorage.getItem(LAST_KEY);
  },

  // Uploads the whole local snapshot. Only runs once this phone has been
  // linked to the signed-in account, so a fresh install can never overwrite
  // an existing backup before the user chooses what to keep.
  async backupNow() {
    const user = await getUser();
    if (!user || restoring) return null;
    if ((await AsyncStorage.getItem(LINKED_KEY)) !== user.id) return null;
    const updated_at = new Date().toISOString();
    try {
      const { error } = await supabase.from('hadbit_backups')
        .upsert({ user_id: user.id, data: await snapshot(), updated_at });
      if (error) throw error;
      await AsyncStorage.multiSet([[LAST_KEY, updated_at], [DIRTY_KEY, '']]);
      return updated_at;
    } catch (e) {
      await AsyncStorage.setItem(DIRTY_KEY, '1');
      throw e;
    }
  },

  // Called after every local write; batches bursts of edits into one upload.
  scheduleBackup(key) {
    if (!supabase || restoring || !BACKUP_KEYS.includes(key)) return;
    AsyncStorage.setItem(DIRTY_KEY, '1').catch(() => {});
    clearTimeout(timer);
    timer = setTimeout(() => { Cloud.backupNow().catch(() => {}); }, 4000);
  },

  async flushIfDirty() {
    clearTimeout(timer);
    if (await AsyncStorage.getItem(DIRTY_KEY)) await Cloud.backupNow().catch(() => {});
  },

  async fetchBackup() {
    const user = await getUser();
    if (!user) return null;
    const { data, error } = await supabase.from('hadbit_backups')
      .select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  },

  // Replaces this phone's data with the cloud copy.
  async restore(backup) {
    restoring = true;
    try {
      const pairs = BACKUP_KEYS.filter(k => k in backup.data).map(k => [k, JSON.stringify(backup.data[k])]);
      await AsyncStorage.multiSet(pairs);
      await AsyncStorage.multiSet([[LAST_KEY, backup.updated_at], [DIRTY_KEY, '']]);
    } finally {
      restoring = false;
    }
  },

  // True once this phone finished signing in. Kept locally so the app
  // opens offline even if the saved session can't be refreshed yet.
  async isLinked() {
    return !!(await AsyncStorage.getItem(LINKED_KEY));
  },

  async link() {
    const user = await getUser();
    if (user) await AsyncStorage.setItem(LINKED_KEY, user.id);
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  // Returns null when the project requires email confirmation first.
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut() {
    await Cloud.flushIfDirty();
    await supabase.auth.signOut();
    await AsyncStorage.multiRemove([LINKED_KEY, LAST_KEY, DIRTY_KEY]);
  },
};

if (supabase) {
  // Refresh tokens only while the app is open. Back up in full every time
  // the app is opened or the phone gets back online, and push unsent
  // changes when the app goes to the background.
  supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') { supabase.auth.startAutoRefresh(); Cloud.backupNow().catch(() => {}); }
    else { supabase.auth.stopAutoRefresh(); if (s === 'background') Cloud.flushIfDirty(); }
  });

  let online = null;
  NetInfo.addEventListener(({ isConnected, isInternetReachable }) => {
    const now = !!isConnected && isInternetReachable !== false;
    if (online === false && now) Cloud.backupNow().catch(() => {});
    online = now;
  });
}
