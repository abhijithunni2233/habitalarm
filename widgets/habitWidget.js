import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlexWidget, TextWidget, ListWidget, requestWidgetUpdate } from 'react-native-android-widget';

// Home-screen widget: today's habits with a one-tap "done" button each.
// It runs in a headless JS task, so it reads and writes AsyncStorage directly
// instead of going through the app's state. The app reloads logs/user when it
// comes back to the foreground, and backs up on open because we set the dirty flag.

export const WIDGET_NAME = 'HabitsToday';
const PRIMARY = '#6C3CE1';

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function read(key, def) {
  try {
    const r = await AsyncStorage.getItem(key);
    return r ? JSON.parse(r) : def;
  } catch { return def; }
}

function isDone(h, val) {
  if (h.habitType === 'measurable') {
    const t = h.dailyTarget || null;
    return t ? (typeof val === 'number' && val >= t) : (typeof val === 'number' && val > 0);
  }
  return val === true;
}

// Same rule as the Today screen: a habit with today's checklist can only be
// ticked once every item is done, so those open the app instead.
function hasOpenTodos(habitId, todos, todoLogs, today) {
  const list = ((todos && todos[habitId]) || []).filter(t => {
    if (t.pinned) return true;
    const c = new Date(parseInt(t.id.replace('t_', ''), 10));
    const key = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
    return key === today;
  });
  return list.length > 0 && !list.every(t => todoLogs?.[today]?.[t.id] === true);
}

async function loadToday() {
  const today = getTodayKey();
  const [habits, logs, todos, todoLogs] = await Promise.all([
    read('habits', []), read('logs', {}), read('todos', {}), read('todologs', {}),
  ]);
  const dayIdx = new Date().getDay();
  const active = habits.filter(h => !h.restDays?.includes(dayIdx)
    && !(h.createdAt && h.createdAt.slice(0, 10) > today));
  const rows = active.map(h => {
    const val = logs[today]?.[h.id];
    return {
      h, val,
      done: isDone(h, val),
      notDone: val === 'notdone',
      locked: h.habitType !== 'measurable' && hasOpenTodos(h.id, todos, todoLogs, today),
      // Steps and sleep fill themselves from Health Connect when the app opens
      auto: h.autoTrack === 'steps' || h.autoTrack === 'sleep',
    };
  });
  const doneCount = rows.filter(r => r.done).length;
  const pct = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;
  return { rows, doneCount, pct };
}

// Tap on a habit: yes/no habits toggle done, measurable ones add one step.
// XP follows the Today screen (+10 on reaching done, -10 on undoing).
async function tapHabit(habitId) {
  const today = getTodayKey();
  const [habits, logs, user] = await Promise.all([
    read('habits', []), read('logs', {}), read('user', { xp: 0, name: 'Champion' }),
  ]);
  const h = habits.find(x => x.id === habitId);
  if (!h) return;
  const nl = { ...logs, [today]: { ...(logs[today] || {}) } };
  const prev = nl[today][h.id];
  let next;
  if (h.habitType === 'measurable') {
    next = (typeof prev === 'number' ? prev : 0) + (h.increment || 1);
  } else {
    next = prev !== true;
  }
  nl[today][h.id] = next;
  const wasDone = isDone(h, prev), nowDone = isDone(h, next);
  const xpDelta = (!wasDone && nowDone) ? 10 : (wasDone && !nowDone) ? -10 : 0;
  const nu = { ...user, xp: Math.max(0, (user.xp || 0) + xpDelta) };
  await AsyncStorage.multiSet([
    ['logs', JSON.stringify(nl)],
    ['user', JSON.stringify(nu)],
    ['cloud:dirty', '1'],
  ]);
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function HabitRow({ row }) {
  const { h, val, done, notDone, locked, auto } = row;
  const measurable = h.habitType === 'measurable';
  const count = typeof val === 'number' ? val : 0;
  const sub = measurable
    ? `${fmtNum(count)}${h.dailyTarget ? ` / ${fmtNum(h.dailyTarget)}` : ''} ${h.unit || ''}`.trim()
    : locked ? 'Finish checklist in app' : notDone ? 'Marked not done' : null;
  const opens = (locked || auto) && !done;
  const btnText = done ? '✓' : auto ? 'Sync' : locked ? 'Open' : measurable ? `+${fmtNum(h.increment || 1)}` : 'Done';
  return (
    <FlexWidget
      style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 }}
      clickAction={locked || auto ? 'OPEN_APP' : 'TOGGLE_HABIT'}
      clickActionData={{ habitId: h.id }}
    >
      <TextWidget text={notDone && !done ? '❌' : (h.icon || '⭐')} style={{ fontSize: 20, marginRight: 10 }} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text={h.name} maxLines={1} truncate="END"
          style={{ fontSize: 14, fontWeight: 'bold', color: done ? '#9A94B0' : '#1E1B2E' }} />
        {sub ? <TextWidget text={sub} maxLines={1} style={{ fontSize: 11, color: '#7A7590' }} /> : null}
      </FlexWidget>
      <FlexWidget style={{
        height: 32, width: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
        backgroundColor: done ? '#2EC4B6' : opens ? '#E6E1F5' : (h.color || PRIMARY),
      }}>
        <TextWidget text={btnText}
          style={{ fontSize: 13, fontWeight: 'bold', color: opens ? PRIMARY : '#FFFFFF' }} />
      </FlexWidget>
    </FlexWidget>
  );
}

export function HabitsWidget({ rows, doneCount, pct }) {
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', backgroundColor: '#FFFFFF', borderRadius: 22 }}>
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
          backgroundGradient: { from: '#4B1FC4', to: '#7B3FF2', orientation: 'LEFT_RIGHT' },
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
        }}
      >
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text="Hadbit · Today" style={{ fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' }} />
          <TextWidget text={rows.length ? `${doneCount} of ${rows.length} done` : 'Rest day'}
            style={{ fontSize: 11, color: '#E4DCFF' }} />
        </FlexWidget>
        <TextWidget text={`${pct}%`} style={{ fontSize: 22, fontWeight: 'bold', color: '#FFFFFF' }} />
      </FlexWidget>
      {rows.length ? (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {rows.map(row => <HabitRow key={row.h.id} row={row} />)}
        </ListWidget>
      ) : (
        <FlexWidget clickAction="OPEN_APP"
          style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
          <TextWidget text="No habits for today. Tap to open Hadbit." style={{ fontSize: 13, color: '#7A7590' }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

async function renderNow() {
  return <HabitsWidget {...(await loadToday())} />;
}

export async function widgetTaskHandler({ widgetAction, clickAction, clickActionData, renderWidget }) {
  if (widgetAction === 'WIDGET_DELETED') return;
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'TOGGLE_HABIT' && clickActionData?.habitId) {
    await tapHabit(clickActionData.habitId);
  }
  renderWidget(await renderNow());
}

// Called by the app after habits or logs change, so the widget stays in step.
export function refreshHabitWidget() {
  requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: renderNow }).catch(() => {});
}
