// The app's entry point. The screens come from expo-router; the one extra job is
// telling Android how to draw the home-screen widgets, which has to be registered
// before anything renders.
import 'expo-router/entry';

import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widgets/handler';

registerWidgetTaskHandler(widgetTaskHandler);
