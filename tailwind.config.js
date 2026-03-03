/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './options.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00f3ff',
          purple: '#bc13fe',
          pink: '#ff00ff',
        },
      },
    },
  },
  plugins: [],
};
