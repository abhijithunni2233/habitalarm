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

export async function requestNotificationPermissions(){
  if(!Device.isDevice) return false;
  if(Platform.OS==='android'){
    await Notifications.setNotificationChannelAsync('habit-alarms',{
      name:'Habit Alarms',
      importance:Notifications.AndroidImportance.MAX,
      vibrationPattern:[0,250,250,250],
      lightColor:'#6C3CE1',
      bypassDnd:true,
    });
  }
  const {status:existing}=await Notifications.getPermissionsAsync();
  if(existing==='granted') return true;
  const {status}=await Notifications.requestPermissionsAsync();
  return status==='granted';
}

export async function scheduleHabitAlarm(habit,alarmTime){
  const identifier=`habit_${habit.id}_${alarmTime.hour}_${alarmTime.minute}`;
  await cancelAlarm(identifier);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content:{
      title:`⏰ ${habit.icon} ${habit.name}`,
      body:`Time for your habit! Keep the streak going 🔥`,
      priority:'max',
      vibrate:[0,500,200,500],
      data:{habitId:habit.id},
      color:habit.color||'#6C3CE1',
    },
    trigger:{hour:alarmTime.hour,minute:alarmTime.minute,repeats:true},
  });
  return identifier;
}

export async function cancelAlarm(identifier){
  try{await Notifications.cancelScheduledNotificationAsync(identifier);}catch(e){}
}

export async function cancelAllHabitAlarms(habitId){
  const scheduled=await Notifications.getAllScheduledNotificationsAsync();
  for(const n of scheduled){
    if(n.identifier.startsWith(`habit_${habitId}`)){
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}
