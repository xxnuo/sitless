import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SitLess',
    description: '久坐提醒插件',
    permissions: ['alarms', 'notifications', 'storage'],
  },
});
