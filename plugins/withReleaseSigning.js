/**
 * Signs release builds with Engram's own key when one is supplied, so the same
 * build can go to GitHub and Google Play. The key never lives in the repository:
 * CI writes it from secrets and sets these environment variables.
 *
 *   ENGRAM_KEYSTORE_PATH       path to the .jks / .keystore file
 *   ENGRAM_KEYSTORE_PASSWORD   store password
 *   ENGRAM_KEY_ALIAS           key alias
 *   ENGRAM_KEY_PASSWORD        key password
 *
 * With any of them missing, the build keeps the template's debug signing, so
 * local builds and builds from forks still work. Set ENGRAM_REQUIRE_RELEASE_KEY=1
 * (CI does this for store builds) to make a missing key an error instead.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// engram-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let gradle = c.modResults.contents;
    if (gradle.includes(MARK)) return c;

    const have = process.env.ENGRAM_KEYSTORE_PATH && process.env.ENGRAM_KEYSTORE_PASSWORD && process.env.ENGRAM_KEY_ALIAS && process.env.ENGRAM_KEY_PASSWORD;
    if (!have) {
      if (process.env.ENGRAM_REQUIRE_RELEASE_KEY === '1') {
        throw new Error('ENGRAM_REQUIRE_RELEASE_KEY is set but the release keystore variables are missing.');
      }
      return c;
    }

    const signing = `        ${MARK}
        release {
            storeFile file(System.getenv("ENGRAM_KEYSTORE_PATH"))
            storePassword System.getenv("ENGRAM_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ENGRAM_KEY_ALIAS")
            keyPassword System.getenv("ENGRAM_KEY_PASSWORD")
        }
`;
    // Add a release config beside the template's debug one.
    gradle = gradle.replace(/(signingConfigs\s*\{\s*\n)/, `$1${signing}`);
    // Point the release build type at it (the template points it at debug).
    gradle = gradle.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    c.modResults.contents = gradle;
    return c;
  });
};
