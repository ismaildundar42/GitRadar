/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "!./src/**/node_modules/**",
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          dark: '#0B192C',
          navy: '#0B1320',
          card: '#111C2E',
          blue: '#1E3E62',
        },
        brand: {
          red: '#C8102E',
          hover: '#A60D24',
        },
        panel: {
          dark: '#111C2E',
          neutral: '#F8FAFC',
        },
      },
    },
  },
  plugins: [],
};
