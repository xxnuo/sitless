import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDesc__',
    permissions: ['alarms', 'storage', 'notifications'],
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
