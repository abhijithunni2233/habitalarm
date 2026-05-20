import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
      sound: true,
      enableVibrate: true,
      showBadge: true,
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleHabitAlarm(habit, alarmTime) {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;
    const identifier = `${habit.id}_${alarmTime.hour}_${alarmTime.minute}`;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    const id = await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `${habit.icon} ${habit.name}`,
        body: "Time for your habit! Let's keep that streak going 🔥",
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        data: { habitId: habit.id },
      },
      trigger: {
        type: 'calendar',
        repeats: true,
        hour: alarmTime.hour,
        minute: alarmTime.minute,
        second: 0,
        channelId: 'habit-alarms',
      },
    });
    return id;
  } catch (e) {
    console.error('scheduleHabitAlarm error:', e);
    return null;
  }
}

export async function cancelAlarm(identifier) {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (e) {
    console.error('cancelAlarm error:', e);
  }
}

export async function cancelAllHabitAlarms(habitId) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = scheduled.filter(n => n.identifier.startsWith(habitId));
    await Promise.all(toCancel.map(n =>
      Notifications.cancelScheduledNotificationAsync(n.identifier)
    ));
  } catch (e) {
    console.error('cancelAllHabitAlarms error:', e);
  }
}
