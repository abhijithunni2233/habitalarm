import { Platform, Linking } from 'react-native';
import {
  getSdkStatus,
  initialize,
  requestPermission,
  getGrantedPermissions,
  readRecords,
  aggregateRecord,
  openHealthConnectSettings,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

// "Home Workout - No Equipment" by Leap Fitness. It has no API of its own,
// but it writes finished workouts to Health Connect, which we read here.
export const HOME_WORKOUT_PACKAGE = 'homeworkout.homeworkouts.noequipment';
const HC_PACKAGE = 'com.google.android.apps.healthdata';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  // Android 14+: lets the background task read while Hadbit is closed
  { accessType: 'read', recordType: 'BackgroundAccessPermission' },
];

// Health Connect's ExerciseSegmentType ids → names, for apps that record
// individual exercises with rep counts inside a session.
const SEGMENT_NAMES = {
  1: 'Arm Curl', 2: 'Back Extension', 3: 'Ball Slam', 4: 'Shoulder Press', 5: 'Bench Press',
  6: 'Bench Sit-up', 9: 'Burpees', 10: 'Crunches', 11: 'Deadlift', 12: 'Triceps Extension',
  13: 'Dumbbell Curl (L)', 14: 'Dumbbell Curl (R)', 15: 'Dumbbell Front Raise', 16: 'Dumbbell Lateral Raise',
  17: 'Dumbbell Row', 22: 'Forward Twist', 23: 'Front Raise', 25: 'Hip Thrust', 27: 'Jumping Jacks',
  28: 'Jump Rope', 29: 'Kettlebell Swing', 30: 'Lateral Raise', 31: 'Lat Pull-down', 32: 'Leg Curl',
  33: 'Leg Extension', 34: 'Leg Press', 35: 'Leg Raise', 36: 'Lunges', 37: 'Mountain Climbers',
  40: 'Plank', 41: 'Pull-ups', 42: 'Punch', 43: 'Shoulder Press', 44: 'Single-arm Triceps Extension',
  45: 'Sit-ups', 46: 'Squats', 47: 'Upper Twist',
};

let initialized = false;

async function ensureInit() {
  if (Platform.OS !== 'android') return false;
  if (initialized) return true;
  try {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    initialized = await initialize();
    return initialized;
  } catch { return false; }
}

export const Health = {
  // 'unsupported' (iOS / old Android), 'needs-install', or 'available'
  async status() {
    if (Platform.OS !== 'android') return 'unsupported';
    try {
      const s = await getSdkStatus();
      if (s === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
      if (s === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs-install';
      return 'unsupported';
    } catch { return 'unsupported'; }
  },

  installHealthConnect() {
    Linking.openURL(`market://details?id=${HC_PACKAGE}`)
      .catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${HC_PACKAGE}`));
  },

  openSettings() {
    try { openHealthConnectSettings(); } catch {}
  },

  // recordType: 'ExerciseSession' (default), 'Steps' or 'SleepSession'
  async hasPermission(recordType = 'ExerciseSession') {
    if (!(await ensureInit())) return false;
    try {
      const granted = await getGrantedPermissions();
      return granted.some(p => p.recordType === recordType && p.accessType === 'read');
    } catch { return false; }
  },

  async hasBackgroundAccess() {
    return Health.hasPermission('BackgroundAccessPermission');
  },

  // Asks for everything Hadbit reads at once; the user can untick any of them.
  async requestAccess(recordType = 'ExerciseSession') {
    if (!(await ensureInit())) return false;
    try {
      const granted = await requestPermission(PERMISSIONS);
      return granted.some(p => p.recordType === recordType && p.accessType === 'read');
    } catch { return false; }
  },

  // Exercise sessions from every app, as total minutes per day in [start, end).
  async readWorkoutMinutesByDay(start, end) {
    if (!(await ensureInit())) return {};
    const timeRangeFilter = { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
    const { records } = await readRecords('ExerciseSession', { timeRangeFilter });
    const out = {};
    records.forEach(r => {
      const key = dayKey(new Date(r.startTime));
      const mins = Math.max(1, Math.round((new Date(r.endTime) - new Date(r.startTime)) / 60000));
      out[key] = (out[key] || 0) + mins;
    });
    return out;
  },

  // Step count per day for the last `days` days including today. Health
  // Connect's aggregate removes overlap when phone and watch both count.
  async readStepsByDay(days) {
    if (!(await ensureInit())) return {};
    const out = {};
    for (let i = 0; i < days; i++) {
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - i);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      try {
        const r = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() } });
        if (r.COUNT_TOTAL > 0) out[dayKey(from)] = Math.round(r.COUNT_TOTAL);
      } catch {}
    }
    return out;
  },

  // Hours slept per day, counting the night that ends that morning
  // (6 pm the day before to 6 pm that day), rounded to 0.1 h.
  async readSleepHoursByDay(days) {
    if (!(await ensureInit())) return {};
    const out = {};
    for (let i = 0; i < days; i++) {
      const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
      const from = new Date(day); from.setHours(-6);
      const to = new Date(day); to.setHours(18);
      try {
        const r = await aggregateRecord({ recordType: 'SleepSession', timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() } });
        if (r.SLEEP_DURATION_TOTAL > 0) out[dayKey(day)] = Math.round(r.SLEEP_DURATION_TOTAL / 360) / 10;
      } catch {}
    }
    return out;
  },

  // Home Workout sessions that started in [start, end), with calories and any
  // per-exercise segments the app recorded.
  async readHomeWorkoutSessions(start, end) {
    if (!(await ensureInit())) return [];
    const timeRangeFilter = { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
    const dataOriginFilter = [HOME_WORKOUT_PACKAGE];
    const { records } = await readRecords('ExerciseSession', { timeRangeFilter, dataOriginFilter });

    const sessions = [];
    for (const r of records) {
      const s = new Date(r.startTime), e = new Date(r.endTime);
      const calories = await readCalories(r.startTime, r.endTime);
      sessions.push({
        hcId: r.metadata?.id || `${r.startTime}`,
        title: r.title || 'Home Workout',
        startTime: r.startTime,
        endTime: r.endTime,
        minutes: Math.max(1, Math.round((e - s) / 60000)),
        calories,
        exercises: segmentsToExercises(r.segments || []),
      });
    }
    return sessions;
  },
};

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Prefers active calories; falls back to total. Returns kcal rounded, or null.
async function readCalories(startTime, endTime) {
  const timeRangeFilter = { operator: 'between', startTime, endTime };
  const dataOriginFilter = [HOME_WORKOUT_PACKAGE];
  for (const type of ['ActiveCaloriesBurned', 'TotalCaloriesBurned']) {
    try {
      const { records } = await readRecords(type, { timeRangeFilter, dataOriginFilter });
      const kcal = records.reduce((sum, r) => sum + (r.energy?.inKilocalories || 0), 0);
      if (kcal > 0) return Math.round(kcal);
    } catch {}
  }
  return null;
}

// Consecutive segments of the same exercise become sets of one exercise.
function segmentsToExercises(segments) {
  const out = [];
  segments
    .filter(sg => sg.segmentType && SEGMENT_NAMES[sg.segmentType])
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .forEach((sg, i) => {
      const name = SEGMENT_NAMES[sg.segmentType];
      const set = { reps: sg.repetitions ? String(sg.repetitions) : '', weight: '' };
      const last = out[out.length - 1];
      if (last && last.name === name) last.sets.push(set);
      else out.push({ id: `x_${Date.parse(sg.startTime) || i}_${i}`, name, sets: [set] });
    });
  return out;
}
