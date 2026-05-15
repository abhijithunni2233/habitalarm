// src/utils/notifications.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export async function requestNotificationPermissions() {
  if (!Device.isDevice) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habit-alarms', {
      name: 'Habit Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
      sound: 'alarm.wav',
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleHabitAlarm(habit, alarmTime) {
  // alarmTime: { hour: 7, minute: 30 }
  const identifier = `habit_${habit.id}_${alarmTime.hour}_${alarmTime.minute}`;

  // Cancel existing alarm with same id
  await cancelAlarm(identifier);

  const trigger = {
    hour: alarmTime.hour,
    minute: alarmTime.minute,
    repeats: true,
  };

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `⏰ ${habit.icon} ${habit.name}`,
      body: `Time for your habit! Keep the streak going 🔥`,
      sound: 'alarm.wav',
      priority: 'max',
      vibrate: [0, 500, 200, 500],
      data: { habitId: habit.id },
      categoryIdentifier: 'habit-alarm',
      color: habit.color || '#7C3AED',
    },
    trigger,
  });

  return identifier;
}

export async function cancelAlarm(identifier) {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (e) {}
}

export async function cancelAllHabitAlarms(habitId) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(`habit_${habitId}`)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function rescheduleAllAlarms(habits) {
  for (const habit of habits) {
    if (!habit.alarms || habit.restDays?.includes(new Date().getDay())) continue;
    for (const alarm of habit.alarms) {
      await scheduleHabitAlarm(habit, alarm);
    }
  }
}
