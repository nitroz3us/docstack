/** @type {import('tailwindcss').Config} */
export default {
    blocklist: ['!button'],
    content: [
        './web/index.html',
        './web/js/**/*.js',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
            },
        },
    },
};
