# 
**Manga Zone** - Mobile-First, Multi-Device Responsive Strategy

**Created:** 2026-05-15  
**Priority:** TIER 1 - CRITICAL (Must complete before Phase 1 coding)  
**Status COMPLETE SPECIFICATION:** 

---

## 
This document defines responsive design specifications for 3 breakpoints:
- **Mobile** (<640px) - Priority 1
- **Tablet** (640px-1024px) - Priority 2
- **Desktop** (>1024px) - Priority 3

All specifications are based on manga reading platform best practices and accessibility standards.

---

## 
### Design Principles
- **Touch-first**: All interactive elements optimized for fingers
- **Single column**: Vertical scroll primary
- **Bottom navigation**: For one-handed usage
- **Full-width**: Edge-to-edge (with safe areas on notched devices)
- **Performance**: Fast loading, minimal data

---

### 1. Touch Targets

**Minimum Size:** 44x44px (44x56px for thumbs - more comfortable)

**Spacing Between Elements:** 8px minimum

**Examples:**
```
Navigation tabs:     56x48px (height includes bottom padding)
Buttons:            44x44px minimum
Links:              44x44px tap area
Checkboxes:         48x48px
Radio buttons:      48x48px
Input fields:       44px height
Sliders:            56px height (for thumb)
```

**Why:** Adult fingers are 8-10mm wide. 44x44px = ~7-8mm at 96DPI.

---

### 2. Typography Scale (Mobile)

**Adjusted from desktop** - smaller due to proximity:

```
Heading 1 (H1):        24px / 32px line-height / weight 700
Heading 2 (H2):        20px / 28px line-height / weight 600
Heading 3 (H3):        18px / 24px line-height / weight 600
Body Text:             14px / 20px line-height / weight 400
Body Small:            13px / 18px line-height / weight 400
Caption:               12px / 16px line-height / weight 400
Label:                 12px / 16px line-height / weight 500
Button Text:           14px / 20px line-height / weight 600

Default font:          -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
Heading font:          Georgia, Garamond, serif (manga aesthetic)
```

**Line length:** 40-50 characters max on mobile

**Letter spacing:** Normal (no adjustment)

---

### 3. Spacing Scale (Mobile)

**Container Padding:** 16px (includes safe area for notched phones)

**Section Vertical Margin:** 24px

**Component Spacing:** 8px, 12px, 16px, 24px

```
Mobile Spacing:
  xs: 4px   (micro spacing)
  sm: 8px   (between elements)
  md: 12px  (default)
  lg: 16px  (container padding, section spacing)
  xl: 24px  (between major sections)
  2xl: 32px (major section breaks)
```

**Grid:** 4px base grid (all values divisible by 4)

---

### 4. Navigation Structure (Mobile)

#### Bottom Tab Navigation (Primary)

**Location:** Bottom of screen, persistent

**Height:** 56px + bottom safe area (34px on iPhone X+)

**Items:** 5 tabs maximum

**Tabs Layout:**
```
Home | Search | Library | Downloads | Profile

Width: 100%        5 = 20% each
Icon: 24x24px centered
Label: Hidden (icon only) - saves space
Badge: Top-right corner for notifications (8x8px red dot)
Active tab: Bottom border 3px, color #FF6B35
```

**Tab Specifications:**
```
Height:           56px
Icon size:        24x24px (centered)
Active indicator: 3px bottom border
Active color:     #FF6B35
Inactive color:   #808080
Background:       #FFFFFF (light) / #1F1F1F (dark)
Border top:       1px #F0F0F0 (light) / #333333 (dark)
Transition:       200ms ease-out-cubic
```

#### Hamburger Menu (Secondary)

**Location:** Top-right corner (if needed)

**Size:** 48x48px tap target

**Opens:** Slide-in menu from left

**Menu Width:** 280px (fits 90% of screens)

**Contents:**
- Categories (links)
- Settings (icon + label)
- Help & Support
- About
- Logout

**Menu Animation:** Slide-in 300ms ease-out-cubic

---

### 5. Header/Top Bar (Mobile)

**Height:** 56px (with status bar space 24px above)

**Usage:** Sticky on some pages, hidden on reader page

**For Manga List Page:**
```
Left:    App icon (32x32px) OR back button
Center:  Page title (truncated if long)
Right:   Search icon (24x24px)
Height:  56px
```

**For Reader Page:**
```
Hidden on scroll (swipe up to show)
Shows bottom controls instead
```

---

### 6. Reader View (Most Important!)

**Goal:** Maximize reading area, minimize distractions

#### Reader Layout

**Full-screen reader:**
```
Top area:      NO header (hidden by default)
Page area:     Full width, edge-to-edge image
Bottom area:   Control bar (hidden on scroll)
```

**Safe Area:** 
```
iPhone X+: 34px bottom safe area (for home indicator)
Normal:    0px
```

**Bottom Control Bar (appears on tap or scroll):**

```
Height: 56px + 34px safe area = 90px total

Layout:

  < DOCS/ (3-dot menu)    Chapter       
  (Previous)         (Options)      
                                    
           [ Chapter List ]         
             (modal button)         
                                    
                      Next >        
                    (Next chapter)  
 [34px safe area]                   


Left button:    40x40px (< Previous)
Center button:  DOCS/ Menu)40x40px (
Right button:   40x40px (> Next)

Spacing:        12px from edges
Icons:          20x20px
```

**Controls:**
- Left arrow: Previous page OR previous chapter
- Grid icon: Chapter list (opens modal)
- 3-dot menu: Reading options (brightness, font size, reading mode)
- Right arrow: Next page OR next chapter

**Behavior:**
- Hidden on scroll down (maximize reading)
- Visible on tap anywhere on screen
- Auto-hide after 5 seconds if no interaction
- Full opacity: 100% (#00000080 background)
- Transition: Fade in/out 300ms

#### Page Navigation

**Tap Zones:**
```
Left 1/3 of screen:    Previous page (tap area 40% width)
Center 1/3:            Show/hide controls
Right 1/3:             Next page (tap area 40% width)
```

**Swipe Gestures:**
```
):       Previous page / chapter
Swipe ):        Next page / chapterleft (
Pull :           Pull-to-refresh (next chapter)down 
Pinch:                 Zoom in/out (2x to 4x max)
```

#### Page Display Options

**Fit Mode (user selectable):**

1. **Fit to Width** (default)
   - Image width = container width (100vw)
   - Height: proportional
   - User scrolls vertically for full page

2. **Fit to Height**
   - Image height = viewport height
   - Width: proportional
   - Rarely needs scroll

3. **Fit to Screen**
   - Image fully visible
   - Aspect ratio maintained
   - May have white space

**Toggle Button:** Top-left corner of reader (icon button 40x40px)

---

### 7. Keyboard & Input

**All inputs must have:**
- 44px height minimum
- 12px padding
- 14px font size
- Clear focus indicator (2px border)
- Type attribute for mobile keyboard

**Input States:**
```
Default:    Border #D0D0D0, background #FFFFFF
Focus:      Border #FF6B35, 2px, background #FFFFFF
Error:      Border #FF3333, background #FFF5F5
Success:    Border #00AA00, background #F5FFF5
Disabled:   Border #CCCCCC, background #F5F5F5, opacity 50%
```

**Mobile Keyboard:**
```
 Default keyboard
 Email keyboard (@ .com)
 Numeric keyboard
 Search keyboard
 Phone keyboard
```

---

### 8. Modal & Dialog (Mobile)

**Bottom Sheet Pattern** (preferred for mobile):

```
Screen height: 100vh

Modal appears from: Bottom (slide up)
Modal height:     Max 80vh (leaves top 20% visible)
Animation:        Slide up 300ms ease-out-cubic
Background:       #00000040 (40% opacity black)
Border radius:    16px 16px 0 0 (rounded top only)

Content padding:  16px
Close button:     X at top-right (40x40px)
Swipe down:       Close the modal
```

**Modal Example - Chapter Selection:**
```

              Chapters       

                              
  Chapter 100 (    current)  
  Chapter 99                  
  Chapter 98                  
  ...                         
  Chapter 1                   
                              
 (swipe down to close)        
                              

```

---

### 9. Safe Areas (Notched Devices)

**iPhone X and above:**

```
Top safe area:     24px (status bar + notch)
Bottom safe area:  34px (home indicator)
Left safe area:    0px (most phones)
Right safe area:   0px (most phones)

Apply using:
  env(safe-area-inset-top)
  env(safe-area-inset-bottom)
  env(safe-area-inset-left)
  env(safe-area-inset-right)
```

**CSS Example:**
```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

---

### 10. Layout Patterns (Mobile)

#### Full-Screen Image

```
Used for: Manga pages, galleries

Layout:
  Image takes 100% width
  Height: auto (aspect ratio maintained)
  Overflow: hidden
  No padding (edge-to-edge)

Safe area: Applied to content above/below image
```

#### Card List

```
Cards: Single column, full width

Layout:
  Container width: 100% - 32px padding (16px each side)
  Card width: 100%
  Card height: auto or fixed
  Spacing between: 12px
  Padding inside card: 12px

Border radius: 12px
Shadow: light (0.1 opacity)
```

#### Two-Column (Not used on mobile)

```
NOT USED ON MOBILE
If needed: Stack to single column
```

---

### 11. Scrolling Behavior

**Sticky Elements:**
- Top navigation: Sticky on scroll (if shown)
- Bottom navigation: Always sticky (never scrolls away)
- Floating buttons: Fixed position, not scrolled

**Pull-to-Refresh:**
- Threshold: 40px
- Icon appears at top on pull down
- Feedback: Loading spinner while loading
- Success: Refresh completes

**Scroll Performance:**
- Use `will-change: transform` for smooth scrolling
- Avoid repaints on scroll
- Use `requestAnimationFrame` for animations

---

---

## 
### Design Principles
- **Flexible**: Can use 2 columns OR single column based on orientation
- **Landscape priority**: Landscape orientation common for reading
- **Touch + stylus friendly**: Larger touch targets possible
- **Balanced layout**: Not too wide, not too narrow

---

### 1. Orientation Handling

#### Portrait (>640px but narrow)

```
Width:            640px - 1024px
Layout:           Single column OR 2-column split
Primary content:  65% width
Secondary panel:  35% width (if 2-column)
Breakpoint:       Typically at 768px
```

#### Landscape (wide)

```
Width:            >1024px when rotated
Layout:           Preferred 2-column for reader
Page area:        60-70% width
Sidebar/controls: 30-40% width
Book mode:        Show 2-page spreads (left + right pages)
```

---

### 2. Navigation Structure (Tablet)

#### Portrait Mode

**Top Navigation Bar:**
```
Height:     56px
Left:       Back button OR hamburger menu (40x40px)
Center:     Title / breadcrumb
Right:      Search icon + menu icon (40x40px each)
```

**Bottom Tab Navigation:**
```
Same as mobile, but can show labels:


Height:         56px
Icon + label:   24x24px icon + 12px label
Full tab width: 20% each
```

#### Landscape Mode

**Top Navigation:**
```
Height:     56px
Left:       Back OR hamburger (40x40px)
Center:     Title + breadcrumb
Right:      Search + menu (40x40px each)
```

**Side Navigation:**
```
Width:     280px (left sidebar)
Position:  Fixed or scrollable
Items:     Categories with icons + labels
Collapse:  Can collapse to icons only (80px)
```

**Bottom Tab Navigation:**
```
Hidden OR converted to side tabs
Not needed in landscape with side nav
```

---

### 3. Reader View (Tablet)

#### Portrait Mode

**Layout:**
```
Top:       56px header
Content:   Full width, single page
Bottom:    56px controls
Sidebar:   Not visible (too cramped)
```

**Page Display:**
```
Fit to width OR fit to height (user choice)
Single page view
Vertical scroll
```

#### Landscape Mode (PRIMARY!)

**Layout - 2-Column:**
```
Left 60%:        Main reader area
 Page left:  Previous page (if book mode)  
 Page right: Current page  
  
Right 40%:       Sidebar panel
 Chapter info  
 Bookmarks  
 Reading options  
 Chapter list  

Header:         56px top nav
Footer:         No footer (landscape uses space efficiently)
```

**2-Page Spread (Book Mode):**
```
Left side:   Left page of manga
Right side:  Right page of manga
Gutter:      12px gap between pages
Both pages fit on screen
User turns "page" (shows both pages together)
```

---

### 4. Typography (Tablet)

**Similar to mobile but with more breathing room:**

```
Heading 1:   28px / 36px line-height
Heading 2:   24px / 32px line-height
Heading 3:   20px / 28px line-height
Body:        16px / 24px line-height (slightly larger)
Caption:     14px / 20px line-height
```

---

### 5. Touch Targets (Tablet)

**Minimum:** 44x44px (same as mobile)

**Preferred:** 48x48px for better thumb reach on 7-10" tablets

**Spacing:** 12px between elements (more generous than mobile)

---

### 6. Layout Grid (Tablet)

**Portrait:** 
```
Columns:  2-4 columns (flexible)
Gutter:   12px
Margin:   16px sides

Grid width: device - 32px
```

**Landscape:**
```
Columns:  3-6 columns
Gutter:   12px
Margin:   16px sides
Sidebar:  280px fixed left
```

---

### 7. Modal Behavior (Tablet)

**Portrait:**
- Bottom sheet (same as mobile)
- Full width minus 16px padding
- Height: 80vh max

**Landscape:**
- Center modal (not bottom sheet!)
- Width: 600px max
- Height: 80vh max
- Centered with background overlay

---

### 8. Keyboard & Input (Tablet)

**Same specifications as mobile but:**
- Can be 48px height (more comfortable)
- Input width: Max 400px on landscape

---

---

## 
### Design Principles
- **Multi-column layout**: Sidebar + content + recommendations
- **Mouse + keyboard**: Not touch-based (different patterns)
- **Hover states**: Important for desktop experience
- **Maximum width**: Keep content readable (not full screen)
- **Efficient use of space**: Sidebars, columns, panels

---

### 1. Navigation Structure (Desktop)

#### Top Navigation Bar

```
Height:           64px (more generous than mobile)

Layout:
  Left side:      Logo + app name (80px)
  Center:         Horizontal menu items
  Right side:     Search + user menu

Logo:             40x40px
Menu items:       Text links, 14px
Spacing:          16px between items
Search box:       300px width
User avatar:      32x32px
```

**Menu Items:**
```
Home | Browse | My Library | Downloads | Upload (admin) | Settings
```

**Hover Effects:**
```
Color:        Change to #FF6B35
Underline:    Appears below (2px)
Duration:     200ms ease-out-cubic
```

#### Left Sidebar Navigation

```
Width:           280px (collapsible to 80px with icons)
Position:        Fixed, full height
Background:      #FFFFFF (light) / #1F1F1F (dark)
Border right:    1px #F0F0F0 (light) / #333333 (dark)

Sections:
  Categories:    With expand/collapse
  My Collections: Bookmarks, downloads, history
  Social:        Following, followers
  Settings:      Gear icon + text

Item height:     40px
Padding:         12px 16px
Font size:       14px
Hover:           Background #F5F5F5 (light) / #2A2A2A (dark)
Active:          Left border 3px #FF6B35 + background tint
```

**Collapsible:**
- Click toggle button to collapse to 80px (icons only)
- Animation: 300ms smooth width transition
- Tooltip on hover for icon-only state

---

### 2. Reader View (Desktop)

#### Three-Column Layout

```
Left 20%:        Sidebar navigation (collapsible)
Center 60-70%:   Reader area (adjustable width)
Right 20-30%:    Info panel / recommendations

Header:          64px top nav
Footer:          Sticky footer with controls
Max width:       1400px (for readability)
```

#### Reader Area

**Single Page View (Default):**
```
Image width:     User adjustable (narrow, medium, wide, full)
Image height:    Proportional
Positioning:     Centered in available space
Padding:         24px left/right, 16px top/bottom
```

**Dual-Page Spread:**
```
Left page:       Left side of reader area
Right page:      Right side of reader area
Gutter:          12px gap in middle
Both fit on screen (for landscape manga layout)
```

**Adjustable Width:**
```
Buttons:        At top of reader (or slider)
  Narrow:       600px
  Medium:       800px
  Wide:         1000px
  Full:         100% - 48px (sidebar + padding)

Smooth transition: 300ms ease-out-cubic
```

**Zoom Controls:**
```
Zoom buttons:    Top-right of reader
  - 100%
  + (up to 200%)

On zoom:
  Pan/drag:     Hold spacebar + drag to pan
  Scroll:       Mouse wheel to zoom
```

---

### 3. Right Sidebar (Desktop)

**Width:** 320px (fixed or collapsible)

**Sections:**

```

 CHAPTER INFO        

 Title               
 Release date        
 Read: 45/50 pages   

 BOOKMARKS & NOTES   

 Page 5: Good moment 
 Page 23: Epic scene 

 RECOMMENDATIONS     

 Similar Manga cards 
 [Card 1]            
 [Card 2]            
 [Card 3]            

```

**Hover on cards:**
```
Scale:     1.05x
Shadow:    Increase
Duration:  200ms ease-out-cubic
Cursor:    pointer
```

---

### 4. Typography (Desktop)

**Comfortable reading sizes:**

```
Heading 1:    32px / 40px line-height
Heading 2:    28px / 36px line-height
Heading 3:    24px / 32px line-height
Body:         16px / 24px line-height
Small text:   14px / 20px line-height

Line length:  60-80 characters (optimal reading)
Max width:    700px for body text
```

---

### 5. Hover States (Desktop Important!)

**Every interactive element needs hover:**

**Links:**
```
Default:       Color #FF6B35, no underline
Hover:         Underline appears (2px), slightly darker
Duration:      200ms ease-out-cubic
Cursor:        pointer
```

**Buttons:**
```
Default:       Solid #FF6B35, white text
Hover:         Background darker (darken 10%), shadow 8px
Active:        Shadow 4px, slightly pressed effect
Disabled:      Opacity 50%, no cursor change
Duration:      200ms
```

**Cards:**
```
Default:       Shadow 2px, no transform
Hover:         Scale 1.05, shadow 8px, background lighter
Cursor:        pointer
Duration:      200ms ease-out-cubic
```

**Dropdown/Menu:**
```
Default:       Hidden or low opacity
Hover:         Appears with fade-in 200ms
Duration:      Stays visible on hover
```

---

### 6. Layout Grid (Desktop)

```
Max width:       1400px (for readability)
Columns:         12-column grid
Gutter:          16px between columns
Margin:          24px sides (min)
Container:       Centered on screen
```

**Content areas:**
```
Sidebar:         280px (fixed)
Main content:    Flexible (remaining space)
Padding:         24px
```

---

### 7. Modal Behavior (Desktop)

**Center Modal:**
```
Width:           600px - 800px (max 90% screen width)
Height:          600px max (scroll if needed)
Position:        Centered on screen
Background:      #00000060 (60% opacity overlay)
Border radius:   8px
Shadow:          16px (prominent)
 1.0
```

**Keyboard Shortcut:**
```
ESC:             Close modal
TAB:             Navigate through inputs
Enter:           Submit form
```

---

### 8. Focus Indicator (Keyboard Navigation)

**Critical for accessibility:**

```
Focus ring:      2px solid #FF6B35
Offset:          2px from element
Border radius:   Matches element
Visible:         Always (never outline: none)
Duration:        Instant (no animation)
```

**Example:**
```css
*:focus-visible {
  outline: 2px solid #FF6B35;
  outline-offset: 2px;
}
```

---

### 9. Scrollbar Styling (Desktop)

**Custom scrollbar for brand consistency:**

```
Width:           8px (thin)
Height:          8px

Track:           #F5F5F5 (light) / #2A2A2A (dark)
Thumb:           #CCCCCC (light) / #555555 (dark)
Thumb hover:     #FF6B35 (brand color)

Border radius:   4px
Margin:          2px (gap from edge)
```

**CSS:**
```css
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #F5F5F5;
}
::-webkit-scrollbar-thumb {
  background: #CCCCCC;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #FF6B35;
}
```

---

### 10. Footer (Desktop)

**Sticky or at bottom (depending on page):**

```
Height:         64px
Background:     #F9F9F9 (light) / #1A1A1A (dark)
Border top:     1px #F0F0F0 (light) / #333333 (dark)
Padding:        16px 24px

Content:
   2026 Manga Zone. All rights reserved.Left:         
  Center:       Links (About, Privacy, Terms)
  Right:        Social icons + theme toggle
```

---

---

## 
### Dark Mode Color Adjustments

**Background Colors:**
```
Primary BG:      #0F0F0F (not pure black #000000)
Secondary BG:    #1A1A1A
Tertiary BG:     #2A2A2A
Card BG:         #1F1F1F
Input BG:        #2A2A2A
```

**Text Colors:**
```
Primary text:    #E0E0E0 (not white)
Secondary text:  #A0A0A0
Caption text:    #808080
Link:            #FF6B35 (brand, same as light)
```

**Borders:**
```
Default:         #333333
Subtle:          #2A2A2A
Strong:          #555555
Focus:           #FF6B35
```

**Shadows (Stronger in dark mode):**
```
Small:           0 1px 3px rgba(0, 0, 0, 0.3)
Medium:          0 4px 12px rgba(0, 0, 0, 0.4)
Large:           0 8px 24px rgba(0, 0, 0, 0.5)
```

### Dark Mode Manga Pages

**Problem:** Manga pages can get washed out in dark mode

**Solution:**
```
Option 1: Brightness adjustment
  Apply: brightness(0.85) to images in dark mode
  Or: User control in reading options

Option 2: Invert colors for text-heavy pages
  Automatic detection for page type
  Manual toggle: "Invert colors"

Option 3: Adjustable overlay
  Dark overlay (0-60% darkness)
  User can adjust while reading
```

**Implementation:**
```css
/* Dark mode - slightly dim images */
@media (prefers-color-scheme: dark) {
  img.manga-page {
    filter: brightness(0.85);
  }
}

/* User control for brightness */
img.manga-page[data-brightness="low"] {
  filter: brightness(0.7);
}
img.manga-page[data-brightness="normal"] {
  filter: brightness(0.85);
}
img.manga-page[data-brightness="high"] {
  filter: brightness(1);
}
```

---

---

## 
### Standard Timings

```
Fast:        200ms  (hover effects, small interactions)
Medium:      300ms  (navigation, page transitions)
Slow:        500ms  (large layout changes)

Easing:      ease-out-cubic (most interactions)
             ease-in-out-cubic (modal opening/closing)
```

### Common Animations

**Page Transitions:**
```
 1, 300ms)
 0%, 300ms)
Tablet:      Fade with slight scale
```

**Loading Skeletons:**
```
 100% opacity, 300ms
Shimmer:     Wave effect moving left-right, 1.5s loop
 0% opacity, 300ms
```

**Scroll to Top:**
```
Button appears: Fade in, 300ms
Click scroll:   Smooth scroll, 500ms
Button hides:   Fade out when top is reached
```

---

---

## 
### Mobile (<640px)
- [ ] All touch targets 44x44px minimum
- [ ] Bottom navigation persistent
- [ ] Full-width images
- [ ] Single column layout
- [ ] Safe areas for notched devices
- [ ] Large text (14px+ body)
- [ ] Bottom controls on reader
- [ ] Swipe gestures working
- [ ] Pull-to-refresh implemented

### Tablet (640-1024px)
- [ ] Portrait: Single OR 2-column
- [ ] Landscape: 2-column preferred
- [ ] 2-page spreads for reader
- [ ] Touch targets 44-48px
- [ ] Medium text sizes
- [ ] Side navigation for landscape
- [ ] Modal as bottom sheet (portrait) or center modal (landscape)

### Desktop (>1024px)
- [ ] 3-column layout with sidebar
- [ ] Hover states on all elements
- [ ] Keyboard navigation (tab, escape)
- [ ] Focus indicators visible
- [ ] Adjustable reader width
- [ ] Dual-page spreads
- [ ] Sticky header & footer
- [ ] Right sidebar with recommendations
- [ ] Smooth scrollbar

### All Breakpoints
- [ ] Dark mode supported
- [ ] Animations 200-500ms
- [ ] Color contrast WCAG AA (4.5:1)
- [ ] Touch targets minimum 44x44px
- [ ] Images optimized (WebP, lazy load)
- [ ] No layout shift (CLS = 0)
- [ ] Performance: FCP < 1.5s, LCP < 2.5s

---

---

## 
### Phase 1 Tasks

1. **Setup Tailwind Breakpoints**
   - Configure: sm (640), md (1024)
   - Custom utilities for safe areas
   - Define spacing scale in config

2. **Create Base Styles**
   - Root font sizes (clamp for fluid typography)
   - Color system (light/dark)
   - Spacing utilities
   - Typography classes

3. **Build Mobile Components First**
   - Start with mobile (< 640px)
   - Add tablet styles (640px)
   - Add desktop styles (1024px)
   - Test at breakpoints

4. **Implement Navigation**
   - Bottom tab (mobile)
   - Side nav (tablet landscape, desktop)
   - Hamburger menu (mobile/tablet)
   - Top navigation (desktop)

5. **Build Reader Component**
   - Mobile: Full-screen, bottom controls
   - Tablet: Single/dual page with landscape
   - Desktop: Multi-column layout

### Testing Checklist

- [ ] Test on actual devices (iPhone, iPad, desktop)
- [ ] Test on browser DevTools responsive mode
- [ ] Test all gestures (swipe, pinch, pull-to-refresh)
- [ ] Test keyboard navigation (desktop)
- [ ] Test dark mode toggle
- [ ] Test landscape/portrait rotation
- [ ] Test with real manga images
- [ ] Verify touch targets (use browser devtools)
- [ ] Check Core Web Vitals (CLS, LCP, FID)

---

## 
**Recommended minimum testing:**

Mobile:
- iPhone SE (375px)
- iPhone 14 (390px)
- Pixel 7 (412px)

Tablet:
- iPad Mini (768px)
- iPad (1024px, landscape)
- Galaxy Tab (1280px)

Desktop:
- 1440px (common laptop)
- 1920px (full HD)
- 2560px (ultra-wide)

---

**Specification Complete** 

**Next Step:** Create COMPONENT_STATES.md for all component states

