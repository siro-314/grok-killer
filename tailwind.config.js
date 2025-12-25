/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        'claude-light': '#FAF9F5',
        'claude-dark': '#1A1A1A',
      },
    },
  },
  plugins: [],
}
