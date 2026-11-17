import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { readWidgetData } from './snapshot';
import { MemoryWidget, noteForNow, QuickThoughtWidget, TodoWidget } from './widgets';

/** Called by Android when a widget is added, resized or due a refresh. Taps open the app directly. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const data = readWidgetData();
  if (widgetInfo.widgetName === 'Todo') renderWidget(<TodoWidget {...data} />);
  else if (widgetInfo.widgetName === 'Memory') renderWidget(<MemoryWidget dark={data.dark} note={noteForNow(data.older)} />);
  else renderWidget(<QuickThoughtWidget dark={data.dark} />);
}
