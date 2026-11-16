/**
 * Lets Engram see whether the named apps are installed (Android hides other apps
 * by default). Used to offer "Chat with Claude" or "Chat with ChatGPT" only when
 * that app is on the phone. Nothing is read from those apps.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAppQueries(config, { packages = [] } = {}) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.queries = manifest.queries || [];
    manifest.queries.push({ package: packages.map((name) => ({ $: { 'android:name': name } })) });
    return c;
  });
};
