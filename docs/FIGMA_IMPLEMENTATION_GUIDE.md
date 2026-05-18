# FIGMA_IMPLEMENTATION_GUIDE.md
## Step-by-Step Guide to Building Manga Zone Component Library in Figma

**Document ID:** DESIGNER-IMPL-001  
**Created:** 2026-05-15  
**Version:** 1.0  
**Status:** ✅ COMPLETE  
**Estimated Time:** 40 hours (5 days × 8 hours)  
**Role:** Designer/Design System Specialist

---

## 📋 TABLE OF CONTENTS

1. [Setup & Preparation](#setup--preparation)
2. [Design Tokens Page](#design-tokens-page)
3. [Component Building Workflow](#component-building-workflow)
4. [Input Components (8 hours)](#input-components-8-hours)
5. [Button Components (6 hours)](#button-components-6-hours)
6. [Card Components (4 hours)](#card-components-4-hours)
7. [Navigation & Overlay (8 hours)](#navigation--overlay-8-hours)
8. [Complex Components (6 hours)](#complex-components-6-hours)
9. [Testing & QA (2 hours)](#testing--qa-2-hours)
10. [Developer Handoff (1 hour)](#developer-handoff-1-hour)

---

## SETUP & PREPARATION

**Time Estimate: 1 hour**

### Step 1: Create Figma File

```
1. Go to figma.com and log in
2. Create new file: "Manga Zone Design System"
3. Set file type: Standard (not prototype-first)
4. Share with team:
   - Developers: View-only
   - Designer team: Edit
   - Admin: Full access
```

### Step 2: Create Pages

Create these pages in order:
```
Page 1: 📖 Overview & Guidelines
Page 2: 🎨 Design Tokens
Page 3: 📥 Input Components
Page 4: 🔘 Button Components
Page 5: 🃏 Card Components
Page 6: 🧭 Navigation Components
Page 7: 🪟 Overlay Components
Page 8: ⚙️ Complex Components
Page 9: 📱 Responsive Variants
Page 10: 🎬 Prototypes & Flows
Page 11: 📤 Developer Handoff
```

### Step 3: Setup Typography

**Import Fonts:**
```
1. Google Fonts → Download these fonts
   - Playfair Display (Bold, SemiBold) - Headings
   - Inter (Regular, Medium, SemiBold, Bold) - Body
   - JetBrains Mono (Regular, Bold) - Code

2. Import into Figma:
   - Click "Assets" panel
   - "Fonts" section
   - Add fonts to workspace

3. In Figma, create text styles:
```

**Text Styles to Create:**

| Name | Font | Size | Weight | Line Height |
|------|------|------|--------|-------------|
| Heading/1 | Playfair | 48px | 700 | 1.2 |
| Heading/2 | Playfair | 36px | 700 | 1.2 |
| Heading/3 | Playfair | 28px | 600 | 1.3 |
| Heading/4 | Playfair | 24px | 600 | 1.3 |
| Body/Large | Inter | 16px | 400 | 1.6 |
| Body | Inter | 14px | 400 | 1.6 |
| Body/Small | Inter | 12px | 400 | 1.5 |
| Caption | Inter | 11px | 500 | 1.4 |

### Step 4: Setup Color Library

**Create Color Styles:**

```
Naming convention: Category/Shade

Primary Colors (Orange):
- Primary/50: #FFF5ED
- Primary/100: #FFEAD4
- Primary/200: #FFD6A5
- Primary/300: #FFBB77
- Primary/400: #FFA04B
- Primary/500: #FF6B35 ⭐ Brand Color
- Primary/600: #E07D0A
- Primary/700: #C06E00
- Primary/800: #9D5A00
- Primary/900: #7A4600

Semantic Colors:
- Success/500: #10B981
- Warning/500: #F59E0B
- Error/500: #EF4444
- Info/500: #3B82F6
- Neutral/50: #F9FAFB
- Neutral/100: #F3F4F6
- Neutral/200: #E5E7EB
- Neutral/300: #D1D5DB
- Neutral/400: #9CA3AF
- Neutral/500: #6B7280
- Neutral/600: #4B5563
- Neutral/700: #374151
- Neutral/800: #1F2937
- Neutral/900: #111827

Dark Mode:
- Dark/Background: #121212
- Dark/Surface: #1E293B
- Dark/Text/Primary: #F1F5F9
- Dark/Text/Secondary: #CBD5E1
- Dark/Border: #334155
```

### Step 5: Setup Spacing System

**Create components for spacing reference:**

```
8px Grid Components (for reference):
- Spacing/4px (4 px square)
- Spacing/8px (8 px square)
- Spacing/12px (12 px square)
- Spacing/16px (16 px square)
- Spacing/24px (24 px square)
- Spacing/32px (32 px square)
- Spacing/48px (48 px square)
- Spacing/64px (64 px square)
```

### Step 6: Setup Shadows

**Create shadow effects:**

```
Figma Effects Library:
- Shadow/xs: 0 1px 2px rgba(0,0,0,0.05)
- Shadow/sm: 0 1px 3px rgba(0,0,0,0.1)
- Shadow/md: 0 4px 6px rgba(0,0,0,0.1)
- Shadow/lg: 0 10px 15px rgba(0,0,0,0.1)
- Shadow/xl: 0 20px 25px rgba(0,0,0,0.1)
- Shadow/2xl: 0 25px 50px rgba(0,0,0,0.15)
- Shadow/sm-dark: 0 1px 3px rgba(0,0,0,0.3)
- Shadow/lg-dark: 0 10px 15px rgba(0,0,0,0.5)
```

---

## DESIGN TOKENS PAGE

**Time Estimate: 1 hour**

### Layout on Page

```
┌─────────────────────────────────────────────┐
│ Design Tokens Overview                      │
├─────────────────────────────────────────────┤
│                                             │
│ Colors        Typography      Spacing      │
│ [grid]        [samples]       [boxes]      │
│                                             │
│ Shadows       Animations      Icons        │
│ [samples]     [specs]         [library]    │
│                                             │
└─────────────────────────────────────────────┘
```

### Colors Section

```
Frame: "Colors"
├─ Primary Palette (10 colors × 40px square)
├─ Semantic (Success, Warning, Error, Info)
├─ Neutral Scale (10 grays)
└─ Dark Mode (5 variants)

Instructions:
1. Create 40x40px squares for each color
2. Fill with color
3. Label below: "Primary/500" etc.
4. Apply color styles (not just fills)
```

### Typography Section

```
Frame: "Typography"
├─ Heading/1: "The Quick Brown Fox" (48px)
├─ Heading/2: "The Quick Brown Fox" (36px)
├─ Heading/3: "The Quick Brown Fox" (28px)
├─ Heading/4: "The Quick Brown Fox" (24px)
├─ Body/Large: "The quick brown fox jumps" (16px)
├─ Body: "The quick brown fox jumps" (14px)
├─ Body/Small: "The quick brown fox jumps" (12px)
└─ Caption: "The quick brown fox" (11px)

Instructions:
1. Type sample text
2. Apply text styles
3. Add label showing size + weight
```

### Spacing Section

```
Frame: "Spacing System (8px Grid)"
├─ Row 1: 4px, 8px, 12px, 16px squares
├─ Row 2: 24px, 32px, 48px, 64px squares
└─ Label: "8px Grid System"
```

---

## COMPONENT BUILDING WORKFLOW

### Component Structure (Template)

Every component follows this pattern:

```
Component/Category
├─ Default
│  ├─ State 1: Default
│  ├─ State 2: Hover
│  ├─ State 3: Focus
│  ├─ State 4: Active
│  ├─ State 5: Disabled
│  ├─ State 6: Loading
│  ├─ State 7: Error
│  └─ State 8: Success
├─ Variant 1 (Secondary, etc.)
│  └─ [Same 8 states]
└─ Documentation
   └─ Usage, specs, accessibility
```

### Component Design Steps

**1. Create Main Component**
```
a) Create frame: 400x auto (for editing space)
b) Build visual design:
   - Background (fill)
   - Text/labels (apply text styles)
   - Icons (from icon library)
   - Borders (stroke)
   - Effects (shadows)

c) Set constraints:
   - Horizontal: Left/Right (for scaling)
   - Vertical: Top (fixed height)

d) Right-click → "Create component"
e) Name: "Button/Primary/Medium" (no variant suffix yet)
```

**2. Create Variants**
```
a) Right-click component → "Create component set"
b) This creates folder with all variants
c) Rename variants by size, state
d) Figma automatically groups by properties

Example naming:
- Size=Small, State=Default
- Size=Small, State=Hover
- Size=Medium, State=Default
- Size=Large, State=Disabled
```

**3. Set Component Properties**
```
Add properties:
- Size: Small, Medium, Large
- State: Default, Hover, Focus, Active, Disabled, Loading, Error, Success
- Icons: None, Leading, Trailing (if applicable)
```

### Measurements & Specifications

**Button Sizing:**
```
Small (32px height):
- Padding: 6px horizontal, 8px vertical
- Border radius: 6px
- Icon size: 16px
- Font: Body/Small (12px)

Medium (40px height):
- Padding: 8px horizontal, 10px vertical
- Border radius: 6px
- Icon size: 20px
- Font: Body (14px)

Large (48px height):
- Padding: 12px horizontal, 12px vertical
- Border radius: 6px
- Icon size: 24px
- Font: Body/Large (16px)
```

**Touch Targets (Mobile):**
```
Minimum: 44x44px (adults)
Preferred: 48x48px
Spacing between targets: 8px minimum
```

---

## INPUT COMPONENTS (8 HOURS)

### Timeline
```
Day 1: 8 hours
├─ 0-1 hr: Button (4 variants × 8 states = 32 components)
├─ 1-2 hr: Input/Text (5 states × 2 sizes = 10 components)
├─ 2-3 hr: Textarea (3 states = 3 components)
├─ 3-4 hr: Checkbox (3 sizes × 3 states = 9 components)
├─ 4-5 hr: Radio Button (3 sizes × 3 states = 9 components)
├─ 5-6 hr: Toggle/Switch (2 states × 3 sizes = 6 components)
├─ 6-7 hr: Dropdown/Select (3 states + 1 open = 4 components)
└─ 7-8 hr: Search Input (3 states = 3 components)
```

### Button Component Detailed Build

**Frame Setup:**
```
Create artboard: 400 × 600px (multiple buttons)

Section 1: Primary Button
├─ Small Default (32px)
├─ Small Hover (32px)
├─ Small Focus (32px)
├─ Small Active (32px)
├─ Small Disabled (32px)
├─ Small Loading (32px)
├─ Small Error (32px)
├─ Small Success (32px)

Section 2: Medium Default (40px)
└─ [Same 8 states]

Section 3: Large Default (48px)
└─ [Same 8 states]
```

**Build Instructions:**

1. **Default State:**
   - Rectangle: 120px × 40px
   - Fill: Primary/500 (orange)
   - Border radius: 6px
   - Text: "Button" (Body style, white)
   - Shadow: None
   - Export size at: 2x pixel ratio

2. **Hover State (Desktop only):**
   - Copy default state
   - Change fill to Primary/600 (darker orange)
   - Add Shadow/md
   - Label: "Hover"

3. **Focus State (Always visible):**
   - Copy default state
   - Keep fill: Primary/500
   - Add stroke: 2px Primary/300
   - Stroke offset: 2px outer

4. **Active State:**
   - Copy default state
   - Change fill to Primary/700 (darkest orange)
   - Add inner shadow: inset

5. **Disabled State:**
   - Copy default state
   - Change fill to Neutral/200 (light gray)
   - Change text color to Neutral/400
   - Opacity: 60%

6. **Loading State:**
   - Copy default state
   - Add spinner icon (20px) on right
   - Add animation frame reference
   - Opacity: 70%

7. **Error State:**
   - Copy default state
   - Change fill to Error/500 (red)
   - White text

8. **Success State:**
   - Copy default state
   - Change fill to Success/500 (green)
   - Add checkmark icon

### Input Text Component

**Specifications:**
```
Height: 40px (medium)
Padding: 12px horizontal, 8px vertical
Border: 1px stroke Neutral/300
Border radius: 6px
Background: white
Font: Body (14px)

Placeholder text color: Neutral/400
Focus: Border becomes Primary/500, shadow added
Error state: Border becomes Error/500
Success state: Border becomes Success/500
```

**Build all states:**
1. Default (empty, placeholder visible)
2. Focused (border highlight, shadow)
3. Filled (user has typed)
4. Disabled (grayed out)
5. Error (red border + error message below)
6. Success (green border + checkmark)

---

## BUTTON COMPONENTS (6 HOURS)

### Build 5 Button Variants

```
Total: 5 variants × 3 sizes × 8 states = 120 components

Variants:
1. Primary (orange, solid)
2. Secondary (outline orange)
3. Tertiary (text only)
4. Danger (red, destructive)
5. Ghost (minimal, hover fill)
```

### Secondary Button Specifics

```
Default:
- Fill: transparent
- Stroke: 2px Primary/500
- Text: Primary/500
- Border radius: 6px

Hover:
- Fill: Primary/50 (lightest orange)
- Stroke: 2px Primary/600
- Text: Primary/600

Disabled:
- Fill: transparent
- Stroke: 2px Neutral/300
- Text: Neutral/400
```

### Tertiary Button

```
Default:
- Fill: transparent
- Stroke: none
- Text: Primary/500
- No shadow

Hover:
- Background: Primary/50
- Text: Primary/600
- No border

Disabled:
- Text: Neutral/400
```

**Time per button variant: ~1 hour**
- 30 min: Design 8 states
- 20 min: Create component set
- 10 min: Test & polish

---

## CARD COMPONENTS (4 HOURS)

### Build 5 Card Types

```
1. Card/Base (container)
2. Card/Manga (with image + title + rating)
3. Card/Chapter (chapter info)
4. Card/User (profile card)
5. Card/Stat (KPI card)
```

### Card/Manga Detailed Build

**Desktop (400px width):**
```
┌──────────────────────┐
│   Image (2:3 ratio)  │ ← 400×600px
│   300×450px actual   │
├──────────────────────┤
│ Attack on Titan      │
│ ⭐ 9.2 (50K votes)   │
│ Status: ONGOING      │
├──────────────────────┤
│ [Bookmark] [Like]    │ ← Hover overlay
└──────────────────────┘
```

**Mobile (160px width):**
```
┌──────────┐
│ Image    │ 160×240px
│ (2:3)    │
├──────────┤
│ Title    │ Truncated
│ Rating   │
└──────────┘
```

**States:**
1. Default (no hover)
2. Hover (overlay appears, buttons visible)
3. Bookmarked (bookmark icon filled)
4. Liked (heart filled)
5. Loading (skeleton)

**Time: ~45 min per card type**

---

## NAVIGATION & OVERLAY (8 HOURS)

### Components to Build

```
Navigation:
1. BottomNav (4 items) - 1 hr
2. Tabs (3-5 tabs) - 1 hr
3. Breadcrumb (3 levels) - 30 min
4. Sidebar (collapsible) - 1 hr
5. Pagination (7 pages) - 30 min

Overlay:
6. Modal/Confirm (centered) - 1 hr
7. Modal/Alert (with icon) - 45 min
8. Drawer (side panel) - 1 hr
9. Tooltip (4 positions) - 30 min
10. Popover (floating) - 30 min
```

### BottomNav Component

```
Design specs:
- Height: 56px (safe area on phones)
- Items: 4-5 navigation items
- Icon size: 24px
- Label size: 12px (Body/Small)
- Spacing: 16px between items

States per item:
- Inactive: gray icon, gray text
- Active: orange icon, orange text + underline
- With badge: red dot (8px) top-right
```

### Modal Component

```
Layout:
┌─────────────────────┐
│ Header              │ ← 40px height
│ Title   [×]         │ ← X button top-right
├─────────────────────┤
│ Content Area        │ ← Scrollable if needed
│ (scrollable)        │
├─────────────────────┤
│ Footer              │ ← Buttons
│ [Cancel] [Confirm]  │
└─────────────────────┘

Sizes:
- Small: 400px width
- Medium: 600px width
- Large: 800px width

Build both light & dark versions
```

---

## COMPLEX COMPONENTS (6 HOURS)

### Reader Components (Critical!)

```
1. Reader/Controls (1.5 hr)
   - Layout: Horizontal bar at bottom
   - Elements:
     * Play/Pause button
     * Page indicator (e.g., "15 / 40")
     * Previous/Next chapter
     * Settings icon
     * Brightness slider

2. Reader/PageIndicator (30 min)
   - Format: "Page 15 / 40"
   - Editable (tap to jump to page)

3. Reader/ChapterSelector (1.5 hr)
   - Modal or dropdown
   - Shows chapter list
   - Current chapter highlighted
   - Search input

4. Reader/NavigationOverlay (1 hr)
   - Shows swipe indicators
   - Left side: swipe for previous
   - Right side: swipe for next
   - Tap zones highlighted

5. Avatar + Misc (1 hr)
   - Avatar: 32px, 48px, 64px
   - Circular with fallback initials
   - Divider (horizontal line)
   - Badge (small red dot)
```

### Reader Controls Detailed

**Desktop Layout (1024px+):**
```
┌────────────────────────────────────────────────┐
│ [< Chapter 4]  15/40  [Chapter 5 >]  ⚙️  🔆   │
└────────────────────────────────────────────────┘
```

**Mobile Layout (< 640px):**
```
┌─────────────────────┐
│ [< Prev]  [Next >]  │ ← Larger touch targets
│ Page 15 / 40        │
│ ⚙️  🔆              │
└─────────────────────┘
```

**States:**
- Visible: Full opacity
- Hidden: Auto-hides after 3s (animation reference)
- Loading: Spinner in play button
- Error: Red warning icon

---

## TESTING & QA (2 HOURS)

### QA Checklist

**Component Completeness:**
- [ ] All 50+ components created
- [ ] All 8 states for each component
- [ ] Naming follows convention: Category/Name/Variant/Size/State
- [ ] No orphaned components (all in sets)

**Design Consistency:**
- [ ] All colors use color styles (not hardcoded fills)
- [ ] All text uses text styles (not hardcoded formatting)
- [ ] All spacing follows 8px grid
- [ ] All corners use 6px border radius (consistent)
- [ ] All shadows use shadow effects (not custom)
- [ ] All strokes are 1px or 2px (no arbitrary widths)

**Accessibility:**
- [ ] Focus states on ALL interactive elements
- [ ] Focus states: 2px outline, offset 2px, visible on light/dark
- [ ] Color contrast meets WCAG AA (4.5:1 minimum)
- [ ] Text sizes readable (min 12px)
- [ ] Touch targets minimum 44x44px (on mobile)
- [ ] Disabled states clearly indicated (not just opacity)

**Responsive Variants:**
- [ ] Mobile variants (< 640px)
- [ ] Tablet variants (640-1024px)
- [ ] Desktop variants (> 1024px)
- [ ] Spacing adjusts per breakpoint
- [ ] Font sizes scale appropriately

**Documentation:**
- [ ] Each component has usage notes
- [ ] States documented (when to use each)
- [ ] Accessibility notes included
- [ ] Responsive adjustments noted
- [ ] Code examples provided (pseudo-React)

**Performance:**
- [ ] Export file < 100MB
- [ ] No broken links or missing assets
- [ ] All icons accounted for
- [ ] File is organized (no chaos)

### Testing Steps

**Step 1: Visual Review**
```
1. Go through each page
2. Check consistency (colors, spacing, sizing)
3. Verify all states are present
4. Screenshot each component for reference
```

**Step 2: Accessibility Check**
```
1. Test focus state visibility
2. Check color contrast (use Stark plugin)
3. Verify text sizes readable
4. Test on mobile preview
```

**Step 3: Developer Export**
```
1. Export all icons as SVG/PNG
2. Export colors as JSON
3. Generate component specs PDF
4. Create handoff document
```

---

## DEVELOPER HANDOFF (1 HOUR)

### Handoff Meeting

**Attendees:**
- Senior Designer (presenting)
- Front-end lead
- 2-3 developers
- Tech lead

**Agenda (60 min):**

1. **Overview (5 min)**
   - Design system philosophy
   - Mobile-first approach
   - 8-state component model
   - Performance considerations

2. **Design Tokens (5 min)**
   - Color system (primary, semantic, dark mode)
   - Typography scale
   - Spacing grid
   - Animation specs

3. **Component Deep-Dive (35 min)**
   - Button: show all variants & states
   - Input: focus/error/success states
   - Card: responsive behavior
   - Reader: critical for manga reading
   - Interactive walkthrough in Figma

4. **Implementation Guide (10 min)**
   - Export process (icons, colors, fonts)
   - CSS structure recommendation
   - Component composition examples
   - Naming conventions

5. **Q&A (5 min)**
   - Clarify any ambiguities
   - Discuss technical concerns
   - Timeline/dependencies

### Handoff Deliverables

**1. Figma File**
- Shared with view-only access to all developers
- Organized by component category
- Documentation on each page

**2. Design Tokens Export**
```json
{
  "colors": {
    "primary": { "500": "#FF6B35", ... },
    "success": "#10B981",
    ...
  },
  "typography": {
    "heading1": { "size": 48, "weight": 700, ... }
  },
  "spacing": { "xs": 4, "sm": 8, ... },
  "shadows": { "md": "0 4px 6px rgba(...)" }
}
```

**3. Icon Library**
- All icons exported as SVG
- Organized by category
- Documented with usage examples

**4. Component Specification Document**
- 1 page per component
- Detailed measurements
- Accessibility notes
- Code snippet examples

**5. Figma Tokens (if using Tokens Studio plugin)**
- Automated sync to code
- CSS variables generation
- Real-time updates

---

## TIMELINE SUMMARY

```
Day 1 (8 hours): Input Components
├─ Setup & Tokens: 1 hr
├─ Button (Primary): 1 hr
├─ Button (Secondary/Tertiary/Danger): 2 hr
├─ Input/Textarea/Checkbox: 2 hr
└─ Radio/Toggle/Dropdown: 2 hr

Day 2 (8 hours): Card & Navigation
├─ Card Components (5 variants): 4 hr
├─ Navigation (BottomNav/Tabs/Breadcrumb): 3 hr
└─ Sidebar: 1 hr

Day 3 (8 hours): Overlay & Reader
├─ Overlay Components (Modal/Drawer/Tooltip): 4 hr
├─ Reader Components (Controls/PageIndicator): 3 hr
└─ Complex Components (Avatar/Misc): 1 hr

Day 4 (8 hours): Refinement & Testing
├─ Polish & alignment fixes: 3 hr
├─ Accessibility audit: 2 hr
├─ Testing & QA: 2 hr
└─ Documentation: 1 hr

Day 5 (8 hours): Variant Building & Handoff
├─ Build all component sets with variants: 6 hr
├─ Export process & asset preparation: 1 hr
└─ Handoff meeting & Q&A: 1 hr

TOTAL: 40 hours
```

---

## RESOURCES & REFERENCES

### Figma Plugins Recommended

```
1. Stark (accessibility checking)
   - Check color contrast
   - Preview high contrast mode

2. Figma Tokens (design tokens sync)
   - Sync tokens to code
   - Version control for design

3. Zeroheight (documentation)
   - Auto-generate component specs
   - Share with developers

4. Penpot (open-source alternative)
   - If team prefers open-source

5. Export as Code
   - Export components as React code
   - CSS generation
```

### Color Tools

- https://coolors.co - Color palette generator
- https://contrastchecker.com - Contrast ratio checker
- https://colorblindly.com - Colorblind simulator

### Accessibility Resources

- https://www.w3.org/WAI/WCAG21/quickref - WCAG checklist
- https://inclusive-components.design - Accessible component patterns
- https://webaim.org - Web accessibility articles

---

## SUCCESS CRITERIA

✅ **Component Library Complete:**
- [ ] 50+ components created
- [ ] 400+ component variants (8 states each)
- [ ] All naming conventions followed
- [ ] No broken references

✅ **Quality Standards Met:**
- [ ] All colors use color styles
- [ ] All text uses text styles
- [ ] 8px grid enforced throughout
- [ ] Accessibility WCAG AA standard
- [ ] Focus states visible on all interactive

✅ **Documentation Complete:**
- [ ] Design tokens documented
- [ ] Component specs documented
- [ ] Usage guidelines provided
- [ ] Code examples created

✅ **Developer Ready:**
- [ ] Figma file shared & organized
- [ ] Assets exported (icons, colors, fonts)
- [ ] Handoff meeting completed
- [ ] Q&A addressed

✅ **Performance:**
- [ ] Figma file < 100MB
- [ ] No performance lag in Figma
- [ ] All components load quickly
- [ ] Smooth interactions & animations

---

## NEXT STEPS AFTER COMPLETION

1. **Share with Development Team**
   - Send Figma link (view-only)
   - Send exported tokens
   - Send specification document

2. **Answer Questions**
   - Developers may have clarifications
   - Update Figma with feedback
   - Maintain consistency

3. **Build Storybook**
   - Developers implement components
   - Create Storybook for showcase
   - Designer reviews implementations

4. **Iterate & Refine**
   - Feedback loop with developers
   - Update Figma if improvements found
   - Maintain component library

5. **Maintain & Extend**
   - Add new components as needed
   - Update existing components
   - Keep design system evergreen

---

## SUPPORT & TROUBLESHOOTING

### Common Issues & Solutions

**Issue: Components look different when exported**
- Solution: Ensure proper frame constraints
- Check: Horizontal/Vertical constraints set correctly

**Issue: Font sizes not rendering correctly**
- Solution: Use Figma text styles (not manual sizing)
- Check: All text styles linked to master style

**Issue: Colors not matching brand**
- Solution: Use color styles, not hardcoded fills
- Check: Color styles are primary source

**Issue: Accessibility contrast failing**
- Solution: Use Stark plugin to check
- Solution: Lighten/darken colors accordingly
- Remember: 4.5:1 for normal text, 3:1 for large text

**Issue: File too large/slow**
- Solution: Archive old pages
- Solution: Hide unused components
- Solution: Reduce image assets

---

## CONCLUSION

**You now have a complete 40-hour roadmap** to build a production-ready component library in Figma.

**Key Takeaways:**
✅ Follow the timeline exactly for consistency  
✅ Don't skip the QA phase - it catches issues early  
✅ Document everything as you go  
✅ Test accessibility from day 1  
✅ Prepare handoff deliverables  

**Estimated Delivery:** 5 business days with 8-hour days  
**Team Size:** 1 senior designer OR 2 intermediate designers  

**Good luck!** 🎨
