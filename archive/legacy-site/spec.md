# Adplix Media — Huge Inc Inspired Redesign Specification

## Design Principles
- **Bold typography** — Hero: clamp(64px, 14vw, 140px); Sections: 64-96px
- **Editorial layout** — Asymmetric grids, split layouts, full-bleed media, whitespace as design element
- **Minimal UI** — ≤1 primary button per view; text+arrow secondary; no pill buttons
- **Monochrome + 1 accent** — Neutral palette + single red accent on primary actions
- **Large media** — Full-viewport hero; project images 60-80vw; editorial photography feel
- **Purposeful motion** — Entrance choreography, scroll reveals, subtle hover (scale 1.01-1.02)
- **Strong hierarchy** — Clear visual path: what → why → how → who → contact

## Color System
```css
:root {
  --neutral-950: hsl(0 30% 4%);
  --neutral-900: hsl(0 30% 8%);
  --neutral-700: hsl(0 15% 35%);
  --neutral-500: hsl(0 12% 50%);
  --neutral-300: hsl(0 10% 75%);
  --neutral-100: hsl(0 8% 92%);
  --neutral-50: hsl(0 5% 97%);
  --white: #ffffff;
  --primary: hsl(0 84% 50%);
  --primary-glow: hsl(8 100% 60%);
  --primary-deep: hsl(0 75% 32%);
}
```

## Typography Scale
```css
:root {
  --text-display-hero: clamp(64px, 14vw, 140px);
  --text-display-xl: clamp(48px, 10vw, 96px);
  --text-display-lg: clamp(40px, 8vw, 72px);
  --text-display-md: clamp(32px, 6vw, 56px);
  --text-display-sm: clamp(24px, 4vw, 40px);
  --text-body-lg: clamp(18px, 2.5vw, 22px);
  --text-body: clamp(16px, 1.5vw, 18px);
  --text-body-sm: clamp(14px, 1.25vw, 16px);
  --text-caption: clamp(12px, 1vw, 14px);
}
```

## Spacing Scale (4px base)
```css
:root {
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px; --space-20: 80px; --space-24: 96px;
  --space-32: 128px; --space-40: 160px;
}
```

## Container & Grid
```css
:root {
  --container-max: 1280px;
  --container-padding: clamp(24px, 5vw, 64px);
  --grid-columns-desktop: 12;
  --grid-columns-tablet: 8;
  --grid-columns-mobile: 4;
}
```

## Section Structure (Final)
1. **Navigation** — Minimal bar, logo left, 5 links (Work, Solutions, Approach, Company, Ideas), CTA right
2. **Hero** — Full-bleed image, oversized headline, single sentence, one primary CTA, scroll indicator
3. **Work** — Editorial showcase: 3 featured projects (alternating image/content), "View all →"
4. **Solutions** — 6 numbered solutions (Strategy, Creative, Performance, Technology, Brand, Growth)
5. **Process** — Vertical timeline, 6 steps, connecting line, scroll-triggered reveals
6. **About** — Pull-quote story, editorial founder portraits (full-width, text overlay)
7. **Insights** — Article-style testimonials, large quotes, horizontal scroll mobile
8. **Newsletter** — Full-width, "Stay in the loop", inline email + submit
9. **Contact** — Large headline, minimal form (4 fields), text-link contact info
10. **Footer** — 4-col: Brand+social | Company | Contact | Legal

## Motion Principles
- Entrance: Hero stagger (0, 100, 200, 300, 400ms)
- Scroll reveals: Section headers → content (stagger 100ms)
- Image reveals: clip-path (1.2s ease-out-expo)
- Hover: scale 1.01-1.02, translateY -2px, 200ms ease-out-expo
- Magnetic buttons: spring physics (x*0.15, y*0.15)
- Reduced motion: All non-essential animation disabled

## Breakpoints
- Mobile: 320-767px (4-col grid)
- Tablet: 768-1023px (8-col grid)
- Desktop: 1024-1439px (12-col grid)
- Wide: 1440px+ (12-col, max 1280px content)

## Assets to Use
- hero_bg.png → Hero background (optimize to WebP)
- IMG_0281.PNG, IMG_3074.JPG.jpeg → Founder portraits (WebP)
- Dr Shabnam's Logo.png, Ever_Glow_Logo.png, SK.png, nyo_cafe.jpg, wwk.jpg → Project logos (WebP)
- 5 MP4 videos → Project videos (compress, add WebM, poster images)

## Reduced Motion Handling
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .marquee-track { animation-play-state: paused; }
  .marquee-track:hover { animation-play-state: running; }
}
```