/**
 * Two quick ways into Engram from outside the app, both plain Android features:
 *
 *  - a Quick Settings tile ("New thought") that opens engram://tile, which goes
 *    on to a voice note or a new note as chosen in Settings;
 *  - app shortcuts on the launcher icon (hold the icon): voice note, new note, to-dos.
 *
 * Neither runs anything in the background or needs a permission.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withStringsXml, AndroidConfig } = require('expo/config-plugins');

const ICON = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M12,3a9,9 0,1 0,0 18a9,9 0,0 0,0 -18zM13,13h4v-2h-4V7h-2v4H7v2h4v4h2z"/>
</vector>
`;

const service = (pkg) => `package ${pkg}

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService

/** The "New thought" Quick Settings tile. Tapping it opens Engram at engram://tile and closes the shade. */
class QuickTileService : TileService() {
  override fun onClick() {
    super.onClick()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("engram://tile")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    } else {
      @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
      startActivityAndCollapse(intent)
    }
  }
}
`;

const SHORTCUTS = [
  { id: 'voice', label: 'engram_shortcut_voice', text: 'Voice note', url: 'engram://voice?from=shortcut' },
  { id: 'note', label: 'engram_shortcut_note', text: 'New note', url: 'engram://compose?from=shortcut' },
  { id: 'todo', label: 'engram_shortcut_todo', text: 'To do', url: 'engram://todo' },
];

const shortcutsXml = (pkg) => `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${SHORTCUTS.map(
  (s) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true" android:icon="@drawable/engram_quick" android:shortcutShortLabel="@string/${s.label}">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="${pkg}" android:data="${s.url}" />
  </shortcut>`,
).join('\n')}
</shortcuts>
`;

module.exports = function withQuickCapture(config, { tileLabel = 'New thought' } = {}) {
  config = withStringsXml(config, (c) => {
    const set = (name, value) => {
      c.modResults = AndroidConfig.Strings.setStringItem([{ $: { name, translatable: 'false' }, _: value }], c.modResults);
    };
    set('engram_tile_label', tileLabel);
    for (const s of SHORTCUTS) set(s.label, s.text);
    return c;
  });

  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.service = (app.service || []).filter((s) => s.$['android:name'] !== '.QuickTileService');
    app.service.push({
      $: {
        'android:name': '.QuickTileService',
        'android:exported': 'true',
        'android:label': '@string/engram_tile_label',
        'android:icon': '@drawable/engram_quick',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
    });
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    main['meta-data'] = (main['meta-data'] || []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    main['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/engram_shortcuts' } });
    return c;
  });

  return withDangerousMod(config, [
    'android',
    (c) => {
      const pkg = c.android?.package;
      if (!pkg) throw new Error('withQuickCapture needs expo.android.package');
      const main = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main');
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      };
      write(path.join(main, 'java', ...pkg.split('.'), 'QuickTileService.kt'), service(pkg));
      write(path.join(main, 'res', 'drawable', 'engram_quick.xml'), ICON);
      write(path.join(main, 'res', 'xml', 'engram_shortcuts.xml'), shortcutsXml(pkg));
      return c;
    },
  ]);
};
