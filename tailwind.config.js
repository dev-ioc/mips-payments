/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        primary: "#2259B2", // bleu Tailwind 500
        secondary: "#b0b2b4",
        success: "#7ad03a",
        info: "#a00",
        warning: "#ffba00",
        error: "#ff0000",
      },
    },
  },
  plugins: [],
};
