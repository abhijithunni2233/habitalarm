const { withProjectBuildGradle } = require('@expo/config-plugins');

// react-native-health-connect 3.4 (background reads) needs compileSdk 35, but
// Expo 51's expo-modules-core doesn't compile against 35. Keep the project on
// 34 and raise only the app and the Health Connect module. It must sit above
// the React Native root plugin, which evaluates :app as soon as it's applied.
const MARKER = '// hadbit: compileSdk 35 for health connect';
const ROOT_PLUGIN = 'apply plugin: "com.facebook.react.rootproject"';

const SNIPPET = `
${MARKER}
subprojects { p ->
  if (p.name == 'app' || p.name == 'react-native-health-connect') {
    p.afterEvaluate { p.android.compileSdkVersion 35 }
  }
}
`;

module.exports = function withHealthConnectSdk35(config) {
  return withProjectBuildGradle(config, (config) => {
    const src = config.modResults.contents;
    if (!src.includes(MARKER)) {
      config.modResults.contents = src.includes(ROOT_PLUGIN)
        ? src.replace(ROOT_PLUGIN, `${SNIPPET.trim()}\n\n${ROOT_PLUGIN}`)
        : src + SNIPPET;
    }
    return config;
  });
};
