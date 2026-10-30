import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import App from './App';
import { widgetTaskHandler } from './widgets/habitWidget';
import './backgroundSync';

registerRootComponent(App);
registerWidgetTaskHandler(widgetTaskHandler);
