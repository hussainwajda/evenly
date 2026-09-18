import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Source: public/logo.png — a full-bleed square with the mark already inside the maskable safe zone,
// so no extra padding; any exposed background uses the logo's own navy.
const LOGO_BACKGROUND = '#09152E'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    transparent: { ...preset.transparent, padding: 0 },
    maskable: { ...preset.maskable, padding: 0, resizeOptions: { background: LOGO_BACKGROUND } },
    apple: { ...preset.apple, padding: 0, resizeOptions: { background: LOGO_BACKGROUND } },
  },
  images: ['public/logo.png'],
})
