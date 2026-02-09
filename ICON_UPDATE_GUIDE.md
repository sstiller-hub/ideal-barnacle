# Akt Icon Integration Guide

## Updated Icons

The Akt app icon is inspired by the distinctive plate visualization bars from the active workout interface - the most recognizable and unique visual element of the Akt training experience.

### Design Concept
- **Plate visualization bars** exactly as shown in the workout set cards
- **Progressive loading pattern** showing three sets with decreasing plate counts (5 plates → 3 plates → 1 plate)
- **Greyscale gradient** representing different plate weights (light = smaller plates, dark = larger plates)
- **Minimalist bar chart aesthetic** - pure data visualization, no decoration
- **Subtle exercise label** at the top suggesting the workout card header
- **Base line** anchoring the visualization
- **Matte dark background** (#12121A to #0D0D0F)
- **Brutalist data-first design** - the icon IS the interface

### Visual Language
- Outer plates (lightest): #E5E5E5 - Small change plates
- Middle plates (medium): #C0C0C0 - Medium weight plates  
- Inner plates (darkest): #8A8A8A - Heavy loading plates
- Pattern shows progressive overload across multiple sets

## Files Updated

### 1. `/akt-app-icon.svg`
Main app icon file (1024x1024) with the plate visualization design.

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

This icon is the purest representation of Akt's identity:
- **Data is the design**: The visualization bars ARE the app
- **Instant recognition**: Users see this exact pattern during every workout
- **Progressive overload**: Shows the training methodology visually
- **No metaphor needed**: It's not inspired by training, it IS training
- **A24 aesthetic**: Matte surfaces, brutal honesty, zero decoration
- **Functional purity**: Form follows data

The icon doesn't represent the app - it's a direct screenshot of the core experience. Anyone who has logged a set in Akt will immediately recognize these bars.

## Notes

- All icons maintain the brutalist, greyscale Akt aesthetic
- No gradients or colors outside of greyscale spectrum
- Matte finish with subtle depth from varying opacities
- Works well at all sizes from 16px to 1024px
- Directly extracted from the plate visualization in set cards
- The most distinctive and ownable visual element of Akt
