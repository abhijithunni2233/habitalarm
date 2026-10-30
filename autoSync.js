import { Health } from './health';

// Shared by the app and the background task in backgroundSync.js.

export function autoSourceOf(h) {
  if (!h) return null;
  return h.autoTrack !== undefined ? h.autoTrack : (h.linkHomeWorkout ? 'homeworkout' : null);
}

// Fills steps, sleep and any-app workout habits for the last week from Health
// Connect. Values only ever go up, so a manual entry above the reading stays.
export async function syncAutoHabits(habits, logs) {
  const want = new Set(habits.map(autoSourceOf).filter(id => id && id !== 'homeworkout'));
  if (!want.size) return { logs: null, xp: 0 };
  const start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
  const data = {
    steps: want.has('steps') && await Health.hasPermission('Steps') ? await Health.readStepsByDay(7) : {},
    sleep: want.has('sleep') && await Health.hasPermission('SleepSession') ? await Health.readSleepHoursByDay(7) : {},
    workout: want.has('workout') && await Health.hasPermission() ? await Health.readWorkoutMinutesByDay(start, new Date()) : {},
  };

  const nl = { ...logs };
  let changed = false, xp = 0;
  habits.forEach(h => {
    const src = autoSourceOf(h);
    if (!data[src]) return;
    Object.entries(data[src]).forEach(([key, raw]) => {
      if (h.restDays?.includes(new Date(key + 'T00:00:00').getDay())) return;
      if (h.createdAt && h.createdAt.slice(0, 10) > key) return;
      const cur = nl[key]?.[h.id];
      let next;
      if (h.habitType === 'measurable') {
        next = src === 'workout' && h.unit === 'hr' ? Math.round(raw / 6) / 10 : raw;
        if (typeof cur === 'number' && cur >= next) return;
      } else {
        const goal = src === 'steps' ? 8000 : src === 'sleep' ? 7 : 1;
        if (raw < goal || cur === true) return;
        next = true;
      }
      const goal = h.habitType === 'measurable' ? h.dailyTarget : null;
      const wasDone = h.habitType === 'measurable' ? (typeof cur === 'number' && (goal ? cur >= goal : cur > 0)) : cur === true;
      const nowDone = h.habitType === 'measurable' ? (goal ? next >= goal : next > 0) : true;
      nl[key] = { ...(nl[key] || {}), [h.id]: next };
      changed = true;
      if (!wasDone && nowDone) xp += h.highPriority ? 20 : 10;
    });
  });
  return { logs: changed ? nl : null, xp };
}
