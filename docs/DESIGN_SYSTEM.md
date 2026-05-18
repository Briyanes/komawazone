# 🎨 Design System Documentation

Complete design specifications for Manga Zone platform.

## Table of Contents
- [Colors](#colors)
- [Typography](#typography)
- [Spacing](#spacing)
- [Components](#components)
- [Mobile UX](#mobile-ux)
- [Accessibility](#accessibility)

---

## Colors

### Light Mode Palette

```
Primary (Orange):
  Primary:       #FF6B35 → Used for CTAs, highlights
  Hover:         #E85A28 → Button hover state
  Active:        #D64B1E → Button pressed state

Secondary (Purple):
  Secondary:     #7B68EE → Accent color
  Hover:         #6A56D1 → Hover state

Surface/Background:
  Primary (White):      #FFFFFF → Main background
  Secondary (Light):    #F5F5F7 → Cards, sections
  Tertiary (Lighter):   #F0F0F5 → Hover state
  Inverse (Dark):       #1A1A1A → Contrast

Text:
  Primary:       #1A1A1A → Main text
  Secondary:     #666666 → Secondary text
  Tertiary:      #999999 → Disabled/hint text
  Inverse:       #FFFFFF → On dark backgrounds

Borders:
  Light:         #E5E5E7 → Subtle borders
  Medium:        #D0D0D5 → Normal borders
  Dark:          #A9A9B3 → Emphasis borders

Semantic:
  Success:       #10B981 → Positive actions
  Warning:       #F59E0B → Warnings
  Error:         #EF4444 → Errors/destructive
  Info:          #3B82F6 → Information
```

### Dark Mode Palette

```
Same primaries, adjusted surfaces:

Surface/Background:
  Primary (Dark):       #1A1A1A → Main background
  Secondary (Darker):   #2D2D2D → Cards, sections
  Tertiary (Lightest):  #3A3A3A → Hover state
  Inverse (Light):      #FFFFFF → Contrast

Text:
  Primary:       #FFFFFF → Main text
  Secondary:     #CCCCCC → Secondary text
  Tertiary:      #999999 → Disabled/hint text
  Inverse:       #1A1A1A → On light backgrounds

Borders:
  Light:         #3A3A3A → Subtle borders
  Medium:        #4A4A4A → Normal borders
  Dark:          #5A5A5A → Emphasis borders
```

### CSS Variables

```css
/* Light mode (default) */
:root {
  --color-primary: #FF6B35;
  --color-primary-hover: #E85A28;
  --color-primary-active: #D64B1E;
  --color-secondary: #7B68EE;
  
  --color-surface-primary: #FFFFFF;
  --color-surface-secondary: #F5F5F7;
  --color-surface-tertiary: #F0F0F5;
  
  --color-text-primary: #1A1A1A;
  --color-text-secondary: #666666;
  --color-text-tertiary: #999999;
  
  --color-border-light: #E5E5E7;
  --color-border-medium: #D0D0D5;
  --color-border-dark: #A9A9B3;
  
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;
  
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* Dark mode */
[data-theme="dark"] {
  --color-primary: #FF6B35;
  --color-primary-hover: #FF7A4D;
  --color-primary-active: #E85A28;
  --color-secondary: #8B7AFF;
  
  --color-surface-primary: #1A1A1A;
  --color-surface-secondary: #2D2D2D;
  --color-surface-tertiary: #3A3A3A;
  
  --color-text-primary: #FFFFFF;
  --color-text-secondary: #CCCCCC;
  --color-text-tertiary: #999999;
  
  --color-border-light: #3A3A3A;
  --color-border-medium: #4A4A4A;
  --color-border-dark: #5A5A5A;
  
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
}
```

---

## Typography

### Font Families
- **Headings:** Serif (e.g., Georgia, Garamond) - Manga vibe
- **Body:** Sans-serif (e.g., -apple-system, system-ui, Segoe UI)
- **Code:** Monospace (e.g., Menlo, Monaco, Courier New)

### Font Sizes & Weights

```
Headings (Serif):
  H1:  3.2rem (51px)   | 700 weight | Line height 1.2
  H2:  2.4rem (38px)   | 700 weight | Line height 1.3
  H3:  1.8rem (29px)   | 600 weight | Line height 1.4
  H4:  1.5rem (24px)   | 600 weight | Line height 1.4

Body (Sans-serif):
  Large:   1.125rem (18px) | 400 weight | Line height 1.6
  Medium:  1rem (16px)     | 400 weight | Line height 1.6
  Small:   0.875rem (14px) | 400 weight | Line height 1.5
  XSmall:  0.75rem (12px)  | 400 weight | Line height 1.4

Special:
  Caption: 0.75rem (12px)  | 500 weight | gray text
  Label:   0.875rem (14px) | 600 weight
  Button:  1rem (16px)     | 600 weight
```

### Responsive Typography

```
Mobile (<640px):
  H1: 2rem
  H2: 1.5rem
  H3: 1.25rem
  Body Large: 1rem

Tablet (640px-1024px):
  H1: 2.4rem
  H2: 1.8rem
  H3: 1.5rem
  Body Large: 1.125rem

Desktop (>1024px):
  H1: 3.2rem
  H2: 2.4rem
  H3: 1.8rem
  Body Large: 1.125rem
```

---

## Spacing

### Spacing Scale

```
xs:    0.25rem (4px)
sm:    0.5rem  (8px)
md:    1rem    (16px)
lg:    1.5rem  (24px)
xl:    2rem    (32px)
2xl:   2.5rem  (40px)
3xl:   3rem    (48px)
```

### Common Layouts

```
Padding:
  Card padding:       md (16px)
  Section padding:    lg (24px)
  Page padding:       xl (32px) on desktop, lg (24px) on mobile

Margins:
  Between sections:   2xl (40px)
  Between items:      md (16px)
  Between list items: sm (8px)

Gap (Grid/Flex):
  Component gap:      sm (8px)
  Grid gap:           md (16px)
  Large layout gap:   lg (24px)
```

---

## Shadows

### Shadow Elevations

```
Shadow SM:  0 1px 2px 0 rgba(0,0,0, 0.05)
Shadow MD:  0 4px 6px -1px rgba(0,0,0, 0.1)
Shadow LG:  0 10px 15px -3px rgba(0,0,0, 0.1)
Shadow XL:  0 20px 25px -5px rgba(0,0,0, 0.1)

Dark Mode (darker shadows):
Shadow SM:  0 1px 2px 0 rgba(0,0,0, 0.3)
Shadow MD:  0 4px 6px -1px rgba(0,0,0, 0.3)
Shadow LG:  0 10px 15px -3px rgba(0,0,0, 0.3)
Shadow XL:  0 20px 25px -5px rgba(0,0,0, 0.3)

Usage:
- No shadow:      Default flat elements
- Shadow SM:      Subtle elevation (inputs, cards)
- Shadow MD:      Elevated elements (buttons, active cards)
- Shadow LG:      Modals, dropdowns, floating elements
- Shadow XL:      Top layer (tooltips, menus)
```

### Border Radius

```
none:   0
sm:     0.25rem (4px)   - Small elements
md:     0.5rem  (8px)   - Buttons, inputs
lg:     0.75rem (12px)  - Cards, containers
xl:     1rem    (16px)  - Large containers
full:   9999px          - Circles, pills
```

---

## Components

### Button

```
Sizes:
  SM: 32px height, 12px padding, small text
  MD: 40px height, 16px padding, medium text
  LG: 48px height, 24px padding, large text

Variants:
  Primary:    Background: primary, Text: white
  Secondary:  Background: surface-secondary, Text: primary
  Ghost:      Background: transparent, Text: primary
  Danger:     Background: error, Text: white

States:
  Default:    Normal state
  Hover:      Background darker, scale 1.02
  Active:     Background active color, scale 0.98
  Disabled:   Opacity 0.5, cursor not-allowed
  Loading:    Show spinner, disable interaction

Min touch target: 44px (mobile), 40px (desktop)
```

### Input Fields

```
Sizes:
  SM: 32px height
  MD: 40px height (default)
  LG: 48px height

States:
  Default:    Border: border-light, bg: surface-primary
  Focus:      Border: primary, shadow: focus-ring
  Error:      Border: error, show error icon + message
  Disabled:   Opacity 0.5, cursor not-allowed
  Loading:    Show spinner inside

Padding:
  Horizontal: md (16px)
  Vertical:   calculated to height

Focus Ring:
  Outline: 2px solid primary with offset
  Not visible by default (only on focus)
```

### Manga Card

```
Layout:
  Container: fixed width, rounded-lg shadow-md
  Image:     aspect-ratio 3:4, cover, rounded-lg
  Content:   title (max 2 lines), author, status, rating

Sizes:
  Mobile (1 col):   Full width - 16px padding = 100% - 32px
  Tablet (2 col):   50% width - half gap = calc(50% - 4px)
  Desktop (4 col):  25% width - gap = calc(25% - 12px)

Hover State:
  Scale: 1.02
  Shadow: md → lg
  Show "View" overlay button
  Smooth transition: 200ms

Responsive Heights:
  Mobile:  h-48
  Desktop: h-56
```

### Responsive Grid

```
Breakpoints:
  Mobile (<640px):     1 column, full width
  Tablet (640-1024):   2 columns, 50% width
  Desktop (>1024px):   3-4 columns, 25-33% width

Implementation:
  grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-md
```

---

## Mobile UX

### Touch Targets

```
Minimum size: 44px × 44px
Recommended:  48px × 48px
Spacing:      8px minimum between targets
Critical:     All interactive elements (buttons, links)
```

### Navigation

**Mobile (<640px):**
- Hamburger menu (top-left)
- Uses bottom sheet (not dropdown)
- Icons at bottom for quick access

**Desktop (>1024px):**
- Horizontal navigation (top bar)
- Dropdowns for submenus
- Hover effects visible

### Reader Controls

**Mobile:**
- Full-width images (scrollable)
- Tap top → hide controls
- Tap bottom → show next/prev buttons
- Swipe left → next page
- Swipe right → previous page

**Desktop:**
- Image on center
- Sidebar on right (ads + comments)
- Previous/Next buttons on bottom

### Forms

```
Mobile Optimizations:
  - Larger inputs (48px height)
  - Larger buttons (48px minimum)
  - One input per line (no side-by-side)
  - Clear error messages below field
  - Autocomplete for common fields
  - Number pad for numeric inputs
  - Date picker for dates

Focus & Errors:
  - Clear visual focus (colored border + shadow)
  - Error message immediately below input
  - Error icon inside input (right side)
  - Positive feedback on correct input
```

---

## Accessibility

### Color Contrast

```
WCAG AA (minimum):
  Large text:  3:1 ratio
  Normal text: 4.5:1 ratio
  Graphics:    3:1 ratio

Our ratios (all meet AAA):
  Primary text on surface:      18:1 (light) / 15:1 (dark)
  Secondary text:               10:1 (light) / 8:1 (dark)
  Error on surface:             9:1 (light) / 12:1 (dark)
```

### Focus Visible

```
Always show focus indicator:
  - 2px solid primary border
  - 2px offset from element
  - Visible on keyboard navigation
  - Never remove with CSS (use outline instead)
```

### Alternative Text

```
Images:
  - Manga covers: "Cover of [Manga Name]"
  - Chapter images: "Page [number] of Chapter [number]"
  - Decorative: aria-hidden="true"

Icons:
  - If standalone: aria-label for context
  - If with text: aria-hidden="true"
```

### Keyboard Navigation

```
Tab Order:
  - Logical order (left→right, top→bottom)
  - All interactive elements included
  - Skip navigation available

Shortcuts (Optional):
  - J/K: Next/Previous page (reader)
  - ? : Show keyboard shortcuts
  - Esc: Close modals/menus
```

---

## Usage Examples

### Creating a Component with Proper Styling

```tsx
// ✅ CORRECT: Use design tokens
import { spacing, colors } from '@/config/design-tokens'

export function MyComponent() {
  return (
    <div className="rounded-lg shadow-md" 
         style={{
           padding: spacing.md,
           backgroundColor: 'var(--color-surface-secondary)',
           color: 'var(--color-text-primary)'
         }}>
      Content
    </div>
  )
}

// ❌ WRONG: Hardcoded values
<div style={{ padding: '16px', backgroundColor: '#F5F5F7' }}>
  Content
</div>
```

### Responsive Component

```tsx
// ✅ CORRECT: Mobile-first
export function MangaGrid({ items }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-md">
      {items.map(item => (
        <MangaCard key={item.id} manga={item} />
      ))}
    </div>
  )
}
```

---

## Dark Mode Checklist

- [ ] Colors use CSS variables (not hardcoded)
- [ ] Shadows visible in dark mode
- [ ] Images have border or glow in dark
- [ ] Text contrast ratios maintained
- [ ] Form focus visible in both modes
- [ ] Transitions smooth (no flashing)
- [ ] All components tested in dark mode

---

## Core Web Vitals Performance Targets

> **Single source of truth** — all other docs reference this table instead of duplicating it.

| Metric | Full Name | Target | Tool |
|--------|-----------|--------|------|
| **LCP** | Largest Contentful Paint | < 2.5s | Lighthouse, PageSpeed |
| **FID** | First Input Delay | < 100ms | Web Vitals, CrUX |
| **INP** | Interaction to Next Paint | < 200ms | Web Vitals (replaces FID) |
| **CLS** | Cumulative Layout Shift | < 0.1 | Lighthouse |
| **FCP** | First Contentful Paint | < 1.8s | Lighthouse |
| **TTI** | Time to Interactive | < 5s | Lighthouse |
| **TTFB** | Time to First Byte | < 800ms | PageSpeed |
| **TBT** | Total Blocking Time | < 200ms | Lighthouse |

### Page-Specific Targets

| Page | LCP Target | Notes |
|------|-----------|-------|
| Homepage | < 2.0s | Hero image must be eager loaded |
| Manga Detail | < 2.5s | Cover image priority load |
| Chapter Reader | < 1.5s | First image must load fast |
| Admin Dashboard | < 3.0s | Authenticated, complexity acceptable |

### Bundle Size Targets

| Asset | Target | Tool |
|-------|--------|------|
| JS Bundle (initial) | < 200KB gzipped | Bundle Analyzer |
| CSS Bundle | < 50KB gzipped | Bundle Analyzer |
| Total Page Weight | < 2MB | Chrome DevTools |
| Individual Image | < 200KB | Sharp processing |

---

**Last Updated:** 2026-05-15  
**Version:** 1.0
