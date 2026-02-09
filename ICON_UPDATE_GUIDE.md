# Akt Icon Integration Guide

## Updated Icons

The Akt app icon is inspired by the active workout flow, featuring a minimalist barbell plate visualization that represents progressive loading and workout tracking.

### Design Concept
- **Barbell plate visualization** from the workout interface, viewed from the front
- **Progressive loading layers** showing three stacked plates on each side (outer, middle, inner)
- **Greyscale gradient** from light (#E5E5E5) to dark (#8A8A8A) representing weight progression
- **Timer indicator dots** at the top representing the active workout timer
- **Rep counter marks** at the bottom showing set tracking
- **Collar clips** adding technical detail and realism
- **Matte dark background** (#12121A to #0D0D0F)
- **Brutalist, functional aesthetic** directly inspired by the core workout tracking experience

### Visual Hierarchy
- Outer plates: Lightest (#E5E5E5) - Maximum weight/intensity
- Middle plates: Medium (#C0C0C0) - Moderate weight
- Inner plates: Darkest (#8A8A8A) - Warm-up weight
- Central bar: Bright (#E5E5E5) - The constant, the foundation

## Files Updated

### 1. `/akt-app-icon.svg`
Main app icon file (1024x1024) with the barbell plate design.

### 2. `/src/app/components/AktIcon.tsx`
React component for the app icon with background (for use in UI).

### 3. `/src/app/components/AktTabIcon.tsx`
Simplified version for tab bar without background, reduced detail for small size.

### 4. `/src/app/components/BottomNav.tsx`
Updated to use `AktTabIcon` for the Home tab instead of generic Home icon.

## For Production (Next.js) Integration

### Add to your `app/layout.tsx` or `pages/_app.tsx`:

```tsx
import Head from 'next/head'

// In your root layout:
<Head>
  <link rel="icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <meta name="theme-color" content="#0D0D0F" />
</Head>
```

### Generate Icon Files from SVG

1. Copy `/akt-app-icon.svg` to your production repo
2. Use a tool like ImageMagick or an online converter to generate:
   - `apple-touch-icon.png` (180x180)
   - `favicon-32x32.png` (32x32)
   - `favicon-16x16.png` (16x16)
   - `favicon.ico` (multi-size ICO file)

### ImageMagick Commands (if available):

```bash
# From akt-app-icon.svg, generate:
convert akt-app-icon.svg -resize 180x180 apple-touch-icon.png
convert akt-app-icon.svg -resize 32x32 favicon-32x32.png
convert akt-app-icon.svg -resize 16x16 favicon-16x16.png
convert akt-app-icon.svg -resize 16x16 -resize 32x32 -resize 48x48 favicon.ico
```

### Place Generated Files In:
```
/public/
  ├── apple-touch-icon.png
  ├── favicon.ico
  ├── favicon-32x32.png
  └── favicon-16x16.png
```

## Tab Bar Icon

The Home tab in the bottom navigation now uses the custom `AktTabIcon` component:
- Automatically adjusts opacity based on active state
- Uses `currentColor` to inherit text color from parent
- Simplified detail level optimized for 20px size
- Matches the glassmorphic tab bar aesthetic

## Design Philosophy

This icon directly represents the core Akt experience:
- **Progressive overload**: Layered plates showing weight progression
- **Data tracking**: Timer and rep counter indicators
- **Technical precision**: Collar clips and symmetrical balance
- **Functional focus**: No decoration, pure training visualization
- **A24 aesthetic**: Matte surfaces, brutalist geometry, restrained confidence

The icon is a window into the active workout flow - instantly recognizable to anyone who has tracked a set in Akt.

## Notes

- All icons maintain the brutalist, greyscale Akt aesthetic
- No gradients or colors outside of greyscale spectrum
- Matte finish with subtle depth from overlapping elements
- Works well at all sizes from 16px to 1024px
- Directly inspired by the plate visualization in active workouts
