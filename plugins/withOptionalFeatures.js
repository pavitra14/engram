/**
 * Marks hardware features Engram does not need as optional, so Google Play does
 * not hide the app from devices without them.
 *
 * Neither is declared by Engram. The build tools imply them: the portrait lock
 * (`orientation: portrait`) implies a portrait screen, and the ACCESS_WIFI_STATE
 * permission that react-native-blob-util (a peer of react-native-executorch)
 * declares implies Wi-Fi hardware. An explicit `required="false"` overrides that.
 * The portrait lock itself stays.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

module.exports = function withOptionalFeatures(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    const features = (manifest['uses-feature'] = manifest['uses-feature'] || []);
    for (const name of OPTIONAL) {
      const existing = features.find((f) => f.$ && f.$['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return c;
  });
};
