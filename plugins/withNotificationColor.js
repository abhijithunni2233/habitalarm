const { withAndroidColors } = require('@expo/config-plugins');

module.exports = function withNotificationColor(config) {
  return withAndroidColors(config, (config) => {
    const colors = config.modResults.resources.color || [];
    if (!colors.find(c => c.$?.name === 'notification_icon_color')) {
      colors.push({ $: { name: 'notification_icon_color' }, _: '#6C3CE1' });
    }
    config.modResults.resources.color = colors;
    return config;
  });
};
