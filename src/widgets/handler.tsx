import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { readWidgetData } from './snapshot';
import { QuickThoughtWidget, TodoWidget } from './widgets';

/** Called by Android when a widget is added, resized or due a refresh. Taps open the app directly. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const data = readWidgetData();
  if (widgetInfo.widgetName === 'Todo') renderWidget(<TodoWidget {...data} />);
  else renderWidget(<QuickThoughtWidget dark={data.dark} />);
}
