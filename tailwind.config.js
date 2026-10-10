/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        // Ported from the portfolio admin: JetBrains Mono for anything numeric,
        // so digits align in a column and a value changing from 999 to 1,000
        // does not shift the column beside it.
        mono: ["ui-monospace", "JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
