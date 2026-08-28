/** @type {import('tailwindcss').Config} */
const {
  default: flattenColorPalette,
} = require('tailwindcss/lib/util/flattenColorPalette');
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        retro: ['Courier New', 'ui-monospace', 'monospace'],
        supercell: ['Arial', 'ui-sans-serif', 'sans-serif'],
        mono: ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [
    function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          'game-pixel-container-clickable': (value) => {
            return {
              border: '3px solid rgba(255, 255, 255, 0.28)',
              'margin-bottom': '6px !important',
              'box-shadow': `0px 6px ${value} !important`,
              'background-color': value,
              'clip-path': 'var(--pixel-container-clickable-clip-path)',
              'min-width': '48px !important',
              'min-height': '48px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-pixel-container': (value) => {
            return {
              border: '3px solid rgba(255, 255, 255, 0.22)',
              'clip-path': 'var(--pixel-container-clip-path)',
              'background-color': value,
              'min-width': '48px !important',
              'min-height': '48px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-pixel-container-slot': (value) => {
            return {
              border: '3px solid rgba(255, 255, 255, 0.18)',
              'clip-path': 'var(--pixel-container-slot-clip-path)',
              'background-color': value,
              'min-width': '24px !important',
              'min-height': '24px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-pixel-container-progress-fill': (value) => {
            return {
              border: '2px solid rgba(255, 255, 255, 0.18)',
              'clip-path': 'var(--pixel-container-progress-fill-clip-path)',
              'background-color': value,
              'min-width': '18px !important',
              'min-height': '18px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container': (value) => {
            return {
              border: '2px solid rgba(255, 255, 255, 0.24)',
              'clip-path':
                'rect(0px 100% calc(100% + 3px) 0px round 12px) !important',
              'background-color': value,
              'box-shadow': `0px 3px ${value} !important`,
              'margin-bottom': '3px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container-clickable': (value) => {
            return {
              border: '2px solid rgba(255, 255, 255, 0.3)',
              'clip-path':
                'rect(0px 100% calc(100% + 6px) 0px round 12px) !important',
              'box-shadow': `0px 6px ${value} !important`,
              'background-color': value,
              'margin-bottom': '6px !important',
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container-slot': (value) => {
            return {
              border: '2px solid rgba(255, 255, 255, 0.16)',
              'clip-path': 'rect(0px 100% 100% 0px round 12px) !important',
              'background-color': value,
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );

      matchUtilities(
        {
          'game-3d-container-progress-fill': (value) => {
            return {
              border: '2px solid rgba(255, 255, 255, 0.18)',
              'clip-path': 'rect(0px 100% 100% 0px round 12px) !important',
              'background-color': value,
            };
          },
        },
        {
          values: flattenColorPalette(theme('colors')),
        },
      );
    },
  ],
};
