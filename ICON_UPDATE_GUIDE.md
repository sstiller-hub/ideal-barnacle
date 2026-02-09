# Akt Icon Integration Guide

## Updated Icons

The Akt app icon features three concentric rings with strategic gaps positioned to form a lowercase "a" shape, combining activity tracking aesthetics with clear brand identity.

### Design Concept
- **Lowercase 'a' letterform** created from ring gaps and vertical stem
- **Three layered rings** representing Volume (outer), Intensity (middle), and Frequency (inner)
- **Activity ring-style gaps** positioned at top-right to create the 'a' opening
- **Vertical stem** on the right side completing the lowercase 'a' silhouette
- **Fully greyscale** with light to dark gradient maintaining A24-inspired aesthetic
- **Matte dark background** (#12121A to #0D0D0F)
- **Circular, flowing geometry** with training progression metaphor

## Files Updated

### 1. `/akt-app-icon.svg`
Main app icon file (1024x1024) with the new training ring design.

### 2. `/src/app/components/AktIcon.tsx`
React component for the app icon with background (for use in UI).

### 3. `/src/app/components/AktTabIcon.tsx` (NEW)
Simplified version for tab bar without background, just the rings.

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
- Matches the glassmorphic tab bar aesthetic
- Scales properly at 20px for tab bar

## Notes

- All icons maintain the brutalist, greyscale Akt aesthetic
- No gradients or colors outside of greyscale spectrum
- Matte finish with subtle depth from overlapping rings
- Works well at all sizes from 16px to 1024px
