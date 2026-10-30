import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { syncAutoHabits } from './autoSync';
import { refreshHabitWidget } from './widgets/habitWidget';
import { Cloud } from './cloud';

// Fills steps, sleep and workout habits from Health Connect about every 30
// minutes while Hadbit is closed, then redraws the widget and backs up.
// Android decides the exact timing and may wait longer to save battery.

const TASK = 'hadbit-health-sync';

async function read(key, def) {
  try {
    const r = await AsyncStorage.getItem(key);
    return r ? JSON.parse(r) : def;
  } catch { return def; }
}

TaskManager.defineTask(TASK, async () => {
  // While the app is open it syncs itself, and its state would overwrite ours
  if (AppState.currentState === 'active') return BackgroundFetch.BackgroundFetchResult.NoData;
  try {
    const [habits, logs, user] = await Promise.all([
      read('habits', []), read('logs', {}), read('user', { xp: 0, name: 'Champion' }),
    ]);
    const r = await syncAutoHabits(habits, logs);
    if (!r.logs) return BackgroundFetch.BackgroundFetchResult.NoData;
    await AsyncStorage.multiSet([
      ['logs', JSON.stringify(r.logs)],
      ['user', JSON.stringify({ ...user, xp: (user.xp || 0) + r.xp })],
      ['cloud:dirty', '1'],
    ]);
    refreshHabitWidget();
    await Cloud.backupNow().catch(() => {});
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Safe to call on every launch; does nothing once registered.
export async function registerBackgroundSync() {
  if (Platform.OS !== 'android') return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
    await BackgroundFetch.registerTaskAsync(TASK, {
      minimumInterval: 30 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {}
}
