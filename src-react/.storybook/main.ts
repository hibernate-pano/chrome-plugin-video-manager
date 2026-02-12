import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import path from 'path';

const config: StorybookConfig = {
  stories: [
    '../**/*.stories.@(js|jsx|ts|tsx)',
    '../**/*.mdx',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../'),
          '@/components': path.resolve(__dirname, '../shared/components'),
          '@/lib': path.resolve(__dirname, '../shared/lib'),
          '@/hooks': path.resolve(__dirname, '../shared/hooks'),
          '@/options': path.resolve(__dirname, '../options'),
          '@/content': path.resolve(__dirname, '../content'),
          '@/shared': path.resolve(__dirname, '../shared'),
          '@/background': path.resolve(__dirname, '../background'),
        },
      },
    });
  },
};

export default config;
