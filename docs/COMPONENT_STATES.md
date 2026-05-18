# 
**Manga Zone** - Complete Component State Documentation

**Created:** 2026-05-15  
**Priority:** TIER 1 - CRITICAL (Must complete before Phase 1 coding)  
**Status COMPLETE SPECIFICATION:** 

---

## 
This document specifies ALL component states, transitions, and animations for the Manga Zone design system.

**Every component must support these states:**
- Default (resting)
- Hover (mouse over on desktop)
- Focus (keyboard navigation or tab)
- Active (clicked/pressed)
- Disabled (not interactive)
- Loading (async operation in progress)
- Error (validation or runtime error)
- Success (operation completed successfully)

---

 Animation Standards## 

### Timing & Easing

```
Fast:           200ms   (hover effects, small interactions)
Medium:         300ms   (navigation, page transitions)
Slow:           500ms   (large layout changes)
Extra slow:     800ms   (major animations)

Easing Functions:
  ease-out-cubic:       Starts fast, ends slow (preferred for most)
  ease-in-out-cubic:    Smooth both ends (modals, important transitions)
  ease-in-cubic:        Slow start, fast end (rarely used)
  ease-out-quad:        Simple smooth (secondary interactions)
```

### Animation Properties

**Prefer these (GPU accelerated):**
- `opacity`
- `transform: scale()`
- `transform: translateX()`
- `transform: translateY()`
- `transform: rotate()`

**Avoid these (causes repaints):**
- `width`
- `height`
- `left`, `right`, `top`, `bottom`
- `padding`, `margin`

---

---

## 
### Button Types

1. **Primary** (main action)
   - Background: #FF6B35 (brand orange)
   - Text: white #FFFFFF
   - Min height: 44px (mobile), 40px (desktop)

2. **Secondary** (less important)
   - Background: #F0F0F0 (light) / #2A2A2A (dark)
   - Text: #1F1F1F (light) / #E0E0E0 (dark)

3. **Tertiary** (minimal)
   - Background: transparent
   - Text: #FF6B35 (brand)
   - Border: 1px #FF6B35

4. **Danger** (destructive)
   - Background: #FF3333 (red)
   - Text: white #FFFFFF

---

### Button States

#### Default State

```
Primary:
  Background:   #FF6B35
  Text:         #FFFFFF
  Padding:      12px 24px
  Border radius: 6px
  Shadow:       none
  Cursor:       pointer
  Font:         14px weight 600
  Line height:  20px

Secondary:
  Background:   #F0F0F0 (light) / #2A2A2A (dark)
  Text:         #1F1F1F (light) / #E0E0E0 (dark)
  
Tertiary:
  Background:   transparent
  Text:         #FF6B35
  Border:       1px solid #FF6B35
  
Danger:
  Background:   #FF3333
  Text:         #FFFFFF
```

#### Hover State (Desktop)

```
Duration:       200ms
Easing:         ease-out-cubic

Primary:
  Background:   #E55A2B (darken 10%)
  Text:         #FFFFFF (no change)
  Shadow:       0 4px 12px rgba(255, 107, 53, 0.3)
  Transform:    scale(1.02)

Secondary:
  Background:   #E8E8E8 (light) / #333333 (dark)
  Shadow:       0 2px 8px rgba(0, 0, 0, 0.1)

Tertiary:
  Background:   #FFF5F0 (light orange tint)
  Border:       2px solid #FF6B35
  
Danger:
  Background:   #EE2222 (darken 5%)
  Shadow:       0 4px 12px rgba(255, 51, 51, 0.3)
```

#### Focus State (Keyboard Tab)

```
Duration:       Instant (no animation)
Indicator:      Outline

All buttons:
  Outline:      2px solid #FF6B35
  Outline-offset: 2px
  Border radius: Same as button

Visible on:
  Tab key navigation
  Always visible (never outline: none)
  Should not disappear
```

#### Active State (Clicked/Pressed)

```
Duration:       100ms (immediate)
Easing:         ease-out-quad

Primary:
  Background:   #CC4A1E (darken 20%, more pressed)
  Shadow:       0 2px 4px rgba(0, 0, 0, 0.2)
  Transform:    scale(0.98) scaleY(0.96)

All buttons:
  Reduce shadow:    50% of hover shadow
  Slightly smaller: scale(0.98)
  Effect:           "pressed in" appearance
```

#### Disabled State

```
All buttons:
  Opacity:      50%
  Cursor:       not-allowed (CSS: cursor: not-allowed)
  Pointer:      none (no click response)
  No hover:     Hover effects disabled
  
No animation on disabled state
```

#### Loading State (Async Operation)

```
Add spinner inside button:
  Content:      "Loading..." + spinner icon
  Width:        20x20px spinner
  Animation:    Rotate continuously, 1s per rotation360
  
Styling:
  Opacity:      70% (subtle dimming)
  Cursor:       default (not clickable)
  No click:     Prevent multiple submissions
  
Spinner:
  Color:        white (for primary), brand color (for secondary)
  Style:        Rotating circle, 20px diameter
  Speed:        1s per full rotation (linear)
  
CSS:
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  animation: spin 1s linear infinite;
```

#### Error State

```
Primary:
  Background:   #FF3333 (changes to red)
  Text:         #FFFFFF
   error icon before textIcon:         
  Animation:    Pulse 300ms (brief shake)

Shake animation (on error):
  Duration:     300ms
  Keyframes:
    0%:   translateX(0)
    25%:  translateX(-4px)
    50%:  translateX(4px)
    75%:  translateX(-4px)
    100%: translateX(0)

Reverts to:
  Normal state after 2 seconds
  OR manual retry
```

#### Success State

```
Primary:
  Background:   #00AA00 (green)
  Text:         #FFFFFF
   checkmark icon before textIcon:         
 1.0

Checkmark animation:
  Duration:     400ms
  Keyframes:
    0%:   scale(0.5) opacity(0)
    50%:  scale(1.1)
    100%: scale(1.0) opacity(1)

Stays visible:
  3 seconds (success feedback)
  Then reverts to normal
  OR user clicks/closes
```

---

### Button Size Variations

```
Mobile (default):
  Height:       44px
  Padding:      12px 24px
  Font:         14px

Desktop/Tablet:
  Height:       40px
  Padding:      10px 20px
  Font:         14px

Small (secondary action):
  Height:       32px
  Padding:      6px 12px
  Font:         12px

Large (prominent):
  Height:       56px
  Padding:      16px 32px
  Font:         16px
```

---

---

## 
### Input Types

1. **Text Input** (default)
2. **Email Input**
3. **Password Input**
4. **Search Input**
5. **Number Input**
6. **Textarea** (multi-line)

---

### Input States

#### Default State

```
Border:         1px solid #D0D0D0 (light) / #444444 (dark)
Background:     #FFFFFF (light) / #2A2A2A (dark)
Text color:     #1F1F1F (light) / #E0E0E0 (dark)
Height:         44px (mobile), 40px (desktop)
Padding:        12px 16px
Font:           14px weight 400
Border radius:  6px
Shadow:         none
Placeholder:    #A0A0A0 (light) / #888888 (dark)
Cursor:         text
```

#### Focus State (Keyboard or Click)

```
Duration:       200ms
Easing:         ease-out-cubic

Border:         2px solid #FF6B35 (brand color)
Box-shadow:     0 0 0 3px rgba(255, 107, 53, 0.1)
Background:     #FFFFFF (light) / #333333 (dark, slightly lighter)
Placeholder:    Slightly more visible
Cursor:         text (blinking)

Focus ring:     2px solid #FF6B35, offset 2px
```

#### Hover State (Desktop, when not focused)

```
Duration:       200ms
Easing:         ease-out-cubic

Border:         1px solid #FF6B35 (changes color)
Shadow:         0 1px 4px rgba(0, 0, 0, 0.05)
Background:     #FFFBF8 (light, warm tint) / #2A2A2A (dark, no change)
```

#### Filled State (Has Value)

```
Text color:     #1F1F1F (light) / #E0E0E0 (dark)
Placeholder:    Hidden OR very faint
Label:          Moves up if floating label design
```

#### Disabled State

```
Border:         1px solid #CCCCCC
Background:     #F5F5F5 (light) / #1A1A1A (dark)
Text color:     #A0A0A0 (light) / #606060 (dark)
Cursor:         not-allowed
Opacity:        60%
No focus:       Cannot be focused
```

#### Error State (Validation Failed)

```
Duration:       200ms
Easing:         ease-out-cubic

Border:         2px solid #FF3333 (red)
Box-shadow:     0 0 0 3px rgba(255, 51, 51, 0.1)
Background:     #FFF5F5 (light red tint) / #2A1A1A (dark red tint)
 red X icon right sideIcon:           

Error message:
  Color:        #FF3333
  Font:         12px weight 400
  Margin-top:   4px
  Animation:    Fade in 200ms
```

#### Success State (Validation Passed)

```
Border:         2px solid #00AA00 (green)
Box-shadow:     0 0 0 3px rgba(0, 170, 0, 0.1)
 green checkmark right sideIcon:           
Background:     #F5FFF5 (light green tint) / #1A2A1A (dark green tint)
```

#### Loading State (Async Validation)

```
Shows spinner:  Right side of input
Animation:      Rotate continuously, 1s per rotation360
Opacity:        70% (slightly dimmed)
Disabled:       Cannot modify while loading
```

#### Placeholder Text

```
Color:          #A0A0A0 (light) / #888888 (dark)
Font style:     italic (optional)
Opacity:        100% (fully visible)

On focus:       May fade out or stay visible
On type:        Disappears (default browser behavior)
```

---

### Character Counter

**When max length specified:**

```
Position:       Bottom-right corner
Font:           12px weight 400
Color:          #808080
Format:         "45 / 100"

When near limit (>80%):
  Color:        #FF6B35 (orange)

When exceeded:
  Color:        #FF3333 (red)
  Border:       2px solid #FF3333
```

---

### Clear Button (X Icon)

**When input has value:**

```
Position:       Right side, inside input (12px from edge)
Size:           20x20px
 in circleIcon:           
Color:          #A0A0A0
Opacity:        70%

On hover:
  Color:        #FF6B35
  Opacity:      100%
  Scale:        1.1
  Duration:     200ms

On click:
  Clear input
  Focus remains in input
  Animation:    Fade out 200ms
```

---

### Password Visibility Toggle

**For password inputs:**

```
Position:       Right side, inside input
Icons:          
Size:           20x20px  Visible:        Hidden:       
Color:          #A0A0A0
Opacity:        70%

On hover:
  Color:        #FF6B35
  Opacity:      100%
  Duration:     200ms

On click:
  Toggle show/hide password
  Icon changes
  Smooth transition: 200ms
```

---

### Input Groups (Prefix/Suffix)

```
Prefix (left):
  Icon 24x24px OR text
  Color: #808080
  Padding left: 12px

Suffix (right):
  Icon 24x24px OR text
  Color: #808080
  Padding right: 12px
  
Both clickable: true
```

---

---

## 
### Card Types

1. **Manga Card** (content card)
2. **Chapter Card** (chapter listing)
3. **Generic Card** (content container)

---

### Card States

#### Default State

```
Background:     #FFFFFF (light) / #1F1F1F (dark)
Border:         none OR 1px #F0F0F0 (light) / #333333 (dark)
Border radius:  12px
Padding:        12px OR 16px
Shadow:         0 1px 3px rgba(0, 0, 0, 0.1)
Cursor:         default OR pointer (if clickable)
Overflow:       hidden
```

#### Hover State (Interactive Cards)

```
Duration:       200ms
Easing:         ease-out-cubic

Transform:      scale(1.03) OR scale(1.05)
Shadow:         0 8px 24px rgba(0, 0, 0, 0.15)
Background:     Slightly lighter (2% lighter)
Cursor:         pointer

Mobile: No hover (touch devices don't have hover)
Desktop: Always apply hover
```

#### Active State (Clicked/Selected)

```
Duration:       100ms
Easing:         ease-out-quad

Transform:      scale(0.98)
Shadow:         0 2px 8px rgba(0, 0, 0, 0.1)
Border:         2px solid #FF6B35
```

#### Focus State (Keyboard Navigation)

```
Outline:        2px solid #FF6B35
Outline-offset: 2px
```

#### Loading State (Content Loading)

```
Skeleton loading:
  Show placeholder structure
  Shimmer animation (wave effect)
  Duration:     1.5s per wave
  
Shimmer keyframes:
  0%:   backgroundPosition -1000px
  100%: backgroundPosition 1000px
  
Smooth fade in when loaded: 300ms
```

#### Error State

```
Border:         2px solid #FF3333 (red)
Overlay:        Semi-transparent red tint
Message:        "Failed to load" text centered
 warning iconIcon:           
Retry button:   Center button "Retry"

Color scheme:
  Background:   Light tint of red #FFF5F5
  Text:         #FF3333
```

#### Disabled State

```
Opacity:        50%
Cursor:         not-allowed
No hover:       Hover effects disabled
Grayed out:     All colors 50% opacity
```

---

### Manga Card Specific

**Structure:**
```

                  
   Image/cover    
   (200x300)      
                  

 Manga Title      
 (max 2 lines)    
                  
 4.5 (123)      
                  
 Status: Ongoing  

```

**Hover Effects:**
```
Image overlay:      Slight darkening (opacity 20%)
Title:             Color changes to #FF6B35
Rating:            Star animation (bounce)
Border:            2px #FF6B35
Shadow:            Large shadow
```

---

### Chapter Card Specific

**Structure:**
```

 Chapter 50: Title          
 Release: 2026-05-15        
 Pages: 45  
```

**Hover Effects:**
```
Background:       Lighter tint
Bookmark icon:    Appears on right
Title color:      #FF6B35
```

---

---

## 
### Badge States

#### Default

```
Background:     #FF6B35
Text:           #FFFFFF
Padding:        4px 8px
Font:           11px weight 600
Border radius:  12px (pill shape)
Display:        inline-block
```

#### Variants

```
Primary:        Background #FF6B35
Secondary:      Background #F0F0F0, text #1F1F1F
Success:        Background #00AA00, text #FFFFFF
Warning:        Background #FFC107, text #000000
Danger:         Background #FF3333, text #FFFFFF
Info:           Background #2196F3, text #FFFFFF
```

#### Size Variations

```
Small:          8px height, 4px 8px padding
Medium:         24px height, 6px 12px padding (default)
Large:          32px height, 8px 16px padding
```

#### With Icon

```
Icon:           12x12px (small), 16x16px (medium)
Icon position:  Left of text
Spacing:        4px between icon and text
```

---

---

## 
### Search-Specific States

#### Empty

```
Placeholder:    "Search manga..."
Icon color:     #A0A0A0Icon left:      
```

#### Focused (Typing)

```
Dropdown:       Appears below with suggestions
Results count:  "45 results"
Recent searches: If no typing yet
```

#### Loading Results

```
Spinner:        Right side, 20x20px
Animation:      Rotate 1s continuous
State:          "Searching..."
```

#### With Results

```
Result items:   List below input
Highlight:      Matching text in #FF6B35
Show count:     "Showing 1-10 of 45"
Scroll:         If > 10 results
```

#### No Results

```
Message:        "No manga found"
Suggestion:     "Try different keywords"
Color:          #808080Icon:           
```

#### Clear Button

```
X icon:         Right side
Visible:        When input has text
On click:       Clear all, show recent/suggestions
Animation:      Fade in/out 200ms
```

---

---

## 
### Checkbox States

#### Default

```
Size:           20x20px (touch-friendly)
Border:         2px solid #D0D0D0
Background:     #FFFFFF
Border radius:  4px
Cursor:         pointer
```

#### Hover

```
Border:         2px solid #FF6B35
Background:     #FFFBF8 (light orange tint)
Shadow:         0 0 0 4px rgba(255, 107, 53, 0.1)
Duration:       200ms
```

#### Checked

```
Background:     #FF6B35 (solid)
 white checkmarkIcon:           
 1.0, 200ms, ease-out-cubic
Border:         none
```

#### Checked + Hover

```
Background:     #E55A2B (darker orange)
Shadow:         0 0 0 4px rgba(255, 107, 53, 0.2)
```

#### Focused

```
Outline:        2px solid #FF6B35
Outline-offset: 2px
```

#### Disabled

```
Opacity:        50%
Cursor:         not-allowed
No hover:       Hover effects disabled
```

#### Indeterminate

```
 (minus sign)Icon:           
Background:     #FF6B35
Meaning:        Some (not all) children checked
```

---

### Radio Button States

**Same as checkbox but:**
- Border radius: 50% (circle)
- Icon: Filled circle (when checked)
- Shape: Circle instead of square

---

---

## 
### Switch States

#### Off

```
Background:     #D0D0D0 (light) / #555555 (dark)
Circle:         #FFFFFF (light) / #1F1F1F (dark)
Position:       Left side
Height:         32px
Width:          56px
Border radius:  16px
```

#### Off + Hover

```
Background:     #C0C0C0
Shadow:         0 2px 8px rgba(0, 0, 0, 0.1)
Duration:       200ms
```

#### On

```
Background:     #FF6B35 (brand)
Circle:         #FFFFFF
Position:       Right side
Animation:      Slide right, 300ms, ease-out-cubic
```

#### On + Hover

```
Background:     #E55A2B (darker)
Shadow:         0 2px 8px rgba(255, 107, 53, 0.2)
```

#### Disabled

```
Opacity:        50%
Cursor:         not-allowed
No hover:       Effects disabled
```

#### Focused

```
Outline:        2px solid #FF6B35
Outline-offset: 2px
```

---

---

## 
### Dropdown States

#### Closed

```
Height:         40px (button)
Shows:          Selected item OR placeholder
git push pointing down (right side)
Border:         1px solid #D0D0D0
```

#### Hover (Closed)

```
Border:         1px solid #FF6B35
Background:     #FFFBF8
Duration:       200ms
```

#### Open

```
  pointing upArrow:          
Options list:   Appears below
Max height:     300px (scroll if more)
Shadow:         0 4px 12px rgba(0, 0, 0, 0.15)
Animation:      Fade in + slide up, 200ms
```

#### Option Hover

```
Background:     #F5F5F5 (light) / #2A2A2A (dark)
Text:           #FF6B35
Duration:       150ms
Cursor:         pointer
```

#### Option Selected

```
Background:     #FFF5F0 (light) / #2A1F1A (dark)
Text:           #FF6B35
 checkmark leftIcon:           
Highlighted:    2px left border #FF6B35
```

#### Focused

```
Outline:        2px solid #FF6B35
Outline-offset: 2px
```

#### Disabled

```
Opacity:        50%
Cursor:         not-allowed
No interactions
```

---

---

## 
### Modal States

#### Closed (Not Visible)

```
Display:        none
```

#### Opening

```
Duration:       300ms
Easing:         ease-out-cubic
 #00000060 (fade in)
 1.0 + fade in
```

#### Open

```
Overlay:        #00000060 (60% opacity black)
Modal:          scale(1.0), opacity 100%
Shadow:         0 20px 48px rgba(0, 0, 0, 0.3)
Backdrop blur:  Optional 8px blur on background
```

#### Hover (Close Button)

```
Close icon:     Changes to #FF6B35
Scale:          1.1
Duration:       200ms
Cursor:         pointer
```

#### Closing

```
Duration:       300ms
Easing:         ease-in-out-cubic
 #00000000 (fade out)
 0.95 + fade out
On complete:    Remove from DOM
```

#### Keyboard Interaction

```
ESC key:        Close modal
TAB:            Navigate through inputs (trap focus)
ENTER:          Submit form (if in input)
```

---

---

 LOADING & SKELETON## 

### Loading Spinner

```
Type:           Circular rotating
Size:           20x20px (default), 40x40px (large)
Color:          #FF6B35
Duration:       1s per rotation (linear)
 rotate(360deg)
```

### Skeleton Loading

```
Show:           Placeholder content structure
Animation:      Shimmer wave effect
Duration:       1.5s per wave
Direction:      Left to right
Color:          #E8E8E8 (light) / #2A2A2A (dark)
```

### Pulse Animation

```
 100%
Duration:       2s continuous
Easing:         ease-in-out
Used for:       Loading indicators, background tasks
```

---

---

## 
### Toast States

#### Info

```
Background:     #2196F3 (blue)
Text:           #FFFFFF
 infoIcon:           
Position:       Top-center OR bottom-right
```

#### Success

```
Background:     #00AA00 (green)
Text:           #FFFFFF
 checkmarkIcon:           
Duration:       3 seconds (auto-dismiss)
```

#### Warning

```
Background:     #FFC107 (yellow)
Text:           #000000
 warningIcon:           
Duration:       5 seconds (auto-dismiss)
```

#### Error

```
Background:     #FF3333 (red)
Text:           #FFFFFF
 errorIcon:           
Duration:       8 seconds (auto-dismiss, longer to read)
Close button:   Manual close option
```

### Toast Animation

```
Entrance:       Slide in from top, fade in, 300ms
Exit:           Fade out, slide up, 300ms
Duration:       Visible 3-8s (depends on type)
Stacking:       Multiple toasts stack vertically
```

---

---

## 
### Tab States

#### Inactive Tab

```
Background:     Transparent
Text:           #808080
Border bottom:  1px solid #F0F0F0 (light) / #333333 (dark)
Font:           14px weight 500
Padding:        12px 16px
```

#### Inactive + Hover

```
Text color:     #FF6B35
Border color:   #FF6B35
Duration:       200ms
Background:     #FFFBF8 (light only)
```

#### Active Tab

```
Background:     Transparent
Text:           #FF6B35
Border bottom:  3px solid #FF6B35
Padding:        12px 16px
Font:           14px weight 600 (slightly bolder)
Animation:      Border-bottom slides in, 300ms
```

#### Active + Hover

```
Text:           #E55A2B (slightly darker)
Border:         3px solid #E55A2B
```

#### Focused (Keyboard)

```
Outline:        2px solid #FF6B35
Outline-offset: 2px
```

#### Disabled Tab

```
Opacity:        50%
Cursor:         not-allowed
No hover:       Effects disabled
```

---

---

##  Implementation Checklist

### All Components Must Have

- [ ] Default state specified
- [ ] Hover state (desktop)
- [ ] Focus state (keyboard)
- [ ] Active state (clicked)
- [ ] Disabled state
- [ ] Loading state (if applicable)
- [ ] Error state (if applicable)
- [ ] Success state (if applicable)

### All Transitions Must Specify

- [ ] Duration (200ms, 300ms, 500ms, etc)
- [ ] Easing function (ease-out-cubic, etc)
- [ ] Properties being animated (opacity, transform)
- [ ] Start state and end state

### Testing Checklist

- [ ] Test all states in browser DevTools
- [ ] Test keyboard navigation (Tab, Enter, Space, ESC)
- [ ] Test hover effects on desktop (do NOT apply on mobile)
- [ ] Test focus indicators visible
- [ ] Test animations smooth (60fps)
- [ ] Test disabled states non-interactive
- [ ] Test color contrast (WCAG AA)
- [ ] Test on actual devices (mobile, tablet, desktop)
- [ ] Test on slow 3G network (animations should still be smooth)
- [ ] Test with dark mode enabled

---

## 
### Phase 1 Tasks

1. **Setup CSS Variables**
   - Define colors for all states
   - Define timing constants (200ms, 300ms, etc)
   - Define easing functions

2. **Create Component Variants**
   - Tailwind classes OR CSS modules for each state
   - Use :hover, :focus-visible, :active, :disabled
   - Test with keyboard navigation

3. **Animation Library**
   - Keyframes for all animations
   - Reusable animation classes
   - Performance optimized (GPU accelerated)

4. **Test Components**
   - Visual regression testing
   - Interaction testing (hover, focus, click)
   - Accessibility testing (color contrast, keyboard)

---

**Specification Complete** 

**Next Step:** Create TESTING_STRATEGY.md (Developer Tier-1 File #1)

