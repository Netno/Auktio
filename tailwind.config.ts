import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FBF8F6",
          100: "#F5F0EB",
          200: "#E8E0D6",
          300: "#D4C8B8",
          400: "#B8A48C",
          500: "#9C8264",
          600: "#7D6548",
          700: "#5E4A34",
          800: "#3F3024",
          900: "#1A1A18",
          950: "#0D0D0C",
        },
        accent: {
          DEFAULT: "#C45D3E",
          50: "#FDF2EE",
          100: "#F9E1D9",
          200: "#F0C0AE",
          300: "#E4977D",
          400: "#D67856",
          500: "#C45D3E",
          600: "#A84D32",
          700: "#8A3F2A",
          800: "#6C3222",
          900: "#4E241A",
        },
        gold: {
          DEFAULT: "#B8963E",
          50: "#FBF5E8",
          100: "#F5E8C8",
          200: "#E8D09A",
          300: "#D4B366",
          400: "#C4A04E",
          500: "#B8963E",
          600: "#967A32",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(26,26,24,0.04), 0 1px 2px rgba(26,26,24,0.02)",
        elevated: "0 4px 16px rgba(26,26,24,0.06)",
        "elevated-lg": "0 12px 40px rgba(26,26,24,0.1)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
