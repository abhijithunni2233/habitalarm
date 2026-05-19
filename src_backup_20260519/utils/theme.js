export const COLORS = {
  bg: '#F0EEFF',
  bgCard: '#FFFFFF',
  bgElevated: '#F8F6FF',
  bgSection: '#EAE6FF',
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
  habitPalette: ['#4F8EF7','#FF8C42','#9B5DE5','#FF6B9D','#06D6A0','#F4A021','#4CC9F0','#F72585','#43AA8B','#E76F51'],
  mood1:'#FF6B6B', mood2:'#FF8C42', mood3:'#FFD93D', mood4:'#8BCE6C', mood5:'#06D6A0',
};
export const SHADOW = {
  sm: { shadowColor:'#6C3CE1', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:8, elevation:3 },
  md: { shadowColor:'#6C3CE1', shadowOffset:{width:0,height:4}, shadowOpacity:0.12, shadowRadius:16, elevation:6 },
  card: { shadowColor:'#6C3CE1', shadowOffset:{width:0,height:6}, shadowOpacity:0.10, shadowRadius:20, elevation:5 },
};
export const SPACING = { xs:4, sm:8, md:16, lg:24, xl:32 };
export const RADIUS = { sm:8, md:12, lg:16, xl:20, xxl:28, full:999 };
export const HABIT_ICONS = ['💪','🏃','📚','💧','🧘','🎯','💤','🥗','🎵','✍️','🧠','❤️','🌅','🚴','🏋️','🎨','📱','💊','🌿','☕','🦷','🧹','💰','🙏'];
export const MOTIVATIONAL_QUOTES = [
  {text:"Small daily improvements lead to stunning results.",author:"Robin Sharma"},
  {text:"We are what we repeatedly do. Excellence is a habit.",author:"Aristotle"},
  {text:"Motivation gets you started. Habit keeps you going.",author:"Jim Ryun"},
  {text:"The secret of your future is hidden in your daily routine.",author:"Mike Murdock"},
  {text:"Habits are the compound interest of self-improvement.",author:"James Clear"},
  {text:"Do something today that your future self will thank you for.",author:"Sean Patrick Flanery"},
];
export const XP_PER_HABIT = 10;
export const LEVELS = [
  {level:1,xp:0,title:'Beginner'},{level:2,xp:100,title:'Apprentice'},
  {level:3,xp:250,title:'Practitioner'},{level:4,xp:500,title:'Journeyman'},
  {level:5,xp:900,title:'Expert'},{level:6,xp:1400,title:'Master'},
  {level:7,xp:2000,title:'Champion'},{level:8,xp:3000,title:'Legend'},
  {level:9,xp:5000,title:'Mythic'},{level:10,xp:8000,title:'Transcendent'},
];
export function getLevelInfo(xp) {
  let current=LEVELS[0],next=LEVELS[1];
  for(let i=LEVELS.length-1;i>=0;i--){ if(xp>=LEVELS[i].xp){current=LEVELS[i];next=LEVELS[i+1]||null;break;} }
  const progress=next?(xp-current.xp)/(next.xp-current.xp):1;
  return {current,next,progress,xp};
}
