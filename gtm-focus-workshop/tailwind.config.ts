import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        proof: { DEFAULT: '#F5C518', text: '#5C4A00' },
        uncertain: { DEFAULT: '#3FB8AF', text: '#0B3B37' },
        risk: { DEFAULT: '#F06060', text: '#5C0E0E' },
        commitment: { DEFAULT: '#A4D65E', text: '#2B4A0E' },
      },
    },
  },
  plugins: [],
};

export default config;
