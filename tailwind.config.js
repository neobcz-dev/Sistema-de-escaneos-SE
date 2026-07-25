/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de marca Servicio Empresarial
        navy: {
          DEFAULT: '#0B2C4D', // Azul marino corporativo (principal)
          dark: '#082238',
          light: '#13456F',
        },
        celeste: {
          DEFAULT: '#3EA6DD', // Azul claro / celeste (acentos e interacción)
          light: '#6FC0E8',
          dark: '#2A86BA',
        },
        anthracite: '#2E3A46', // Gris oscuro / antracita (texto de cuerpo)
        mist: '#F5F8FB', // Fondo claro de soporte
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(11, 44, 77, 0.25)',
      },
    },
  },
  plugins: [],
}
