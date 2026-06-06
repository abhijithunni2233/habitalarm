const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withNotificationColor(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const valuesDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'values'
      );
      const colorsPath = path.join(valuesDir, 'colors.xml');

      if (!fs.existsSync(valuesDir)) {
        fs.mkdirSync(valuesDir, { recursive: true });
      }

      if (fs.existsSync(colorsPath)) {
        let content = fs.readFileSync(colorsPath, 'utf8');
        if (!content.includes('notification_icon_color')) {
          content = content.replace(
            '</resources>',
            '    <color name="notification_icon_color">#6C3CE1</color>\n</resources>'
          );
          fs.writeFileSync(colorsPath, content);
        }
      } else {
        fs.writeFileSync(
          colorsPath,
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="notification_icon_color">#6C3CE1</color>\n</resources>`
        );
      }

      return config;
    },
  ]);
};
