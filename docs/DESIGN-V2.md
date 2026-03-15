# CS2 Player Tools — Visual Redesign v2

## Design Philosophy
**"Tactical HUD"** — Inspired by in-game HUDs, military command interfaces, and premium gaming software (Razer Synapse, Corsair iCUE, NZXT CAM).

## Color Palette

### Primary
```
--bg-deep:     #050508     (almost black, deep space)
--bg-primary:  #0c0c14     (dark navy)
--bg-card:     #111119     (card surface)
--bg-elevated: #1a1a26     (elevated elements)
--bg-hover:    #22222e     (hover state)
```

### Borders & Lines
```
--border:      #1e1e2e     (subtle)
--border-glow: #2a2a40     (slightly visible)
--border-active: var(--accent) with 30% opacity
```

### Accent Colors (Neon Gaming)
```
--accent:      #7c3aed     (vivid purple - primary actions)
--accent-glow: #8b5cf6     (lighter purple for glows)
--accent2:     #06d6a0     (neon green - success/VPN/online)
--danger:      #ef4444     (red - errors/block)
--warning:     #f59e0b     (amber - caution)
--info:        #3b82f6     (blue - info)
--orange:      #f97316     (upload/secondary metric)
```

### Text
```
--text:        #eaeaf0     (primary text - slightly blue-white)
--text-dim:    #6b6b80     (secondary text)
--text-muted:  #45455a     (disabled/placeholder)
```

## Typography

### Font Stack
```css
/* Primary: Inter (clean, modern, gaming-ready) */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

/* Mono: JetBrains Mono (for data, IPs, stats) */
font-family: 'JetBrains Mono', 'Cascadia Code', monospace;

/* Display: Outfit or Exo 2 (for big headers) */
font-family: 'Outfit', sans-serif;
```

### Scale
- Page titles: 24px bold, letter-spacing: -0.5px
- Section titles: 16px semibold
- Body: 13px regular
- Small: 11px
- Tiny: 9px (badges, metadata)
- Data: 13px mono

## Component Design Language

### Cards
```css
.card {
  background: linear-gradient(135deg, #111119 0%, #0f0f1a 100%);
  border: 1px solid #1e1e2e;
  border-radius: 12px;
  /* Subtle inner glow on hover */
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
  transition: all 0.2s;
}
.card:hover {
  border-color: rgba(124, 58, 237, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.05),
    0 0 20px rgba(124, 58, 237, 0.05);
}
```

### Buttons
```css
/* Primary - gradient with glow */
.btn-primary {
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  border: 1px solid rgba(139, 92, 246, 0.5);
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.2);
  border-radius: 8px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
  font-size: 12px;
}
.btn-primary:hover {
  box-shadow: 0 0 25px rgba(124, 58, 237, 0.4);
  transform: translateY(-1px);
}

/* Ghost/outline */
.btn-ghost {
  background: transparent;
  border: 1px solid #2a2a40;
  color: #6b6b80;
}
.btn-ghost:hover {
  border-color: #7c3aed;
  color: #eaeaf0;
  background: rgba(124, 58, 237, 0.05);
}
```

### Sidebar
```
- Width: 240px (slightly wider)
- Background: #080810 (darker than main)
- Separator: 1px gradient line (purple to transparent)
- Nav items:
  - Default: text-dim, no background
  - Hover: text-light, subtle purple left border glow
  - Active: text-white, purple left border (3px, glowing),
    subtle purple bg gradient
- Logo area: Larger, with subtle animated gradient behind CS2 text
```

### Data Visualization
```
- Charts: Gradient fills (purple to transparent)
- Line charts: Glowing lines with drop shadow
- Bar charts: Rounded tops, gradient fill
- Stat cards: Large mono numbers, small uppercase labels
- Progress bars: Gradient fill with animated glow sweep
```

### Status Indicators
```
- Online/Connected: Pulsing green dot with glow
- Offline: Dim gray dot
- Error: Red dot
- Warning: Amber dot
- Loading: Purple spinning ring
```

### Special Effects
```css
/* Glow text for important values */
.glow-text {
  text-shadow: 0 0 10px currentColor;
}

/* Scan line effect (subtle, gaming feel) */
.scan-line::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(124,58,237,0.3), transparent);
  animation: scan 3s linear infinite;
}

/* Glassmorphism for overlays */
.glass {
  background: rgba(17, 17, 25, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.05);
}

/* Animated border gradient */
.border-glow {
  border-image: linear-gradient(135deg, #7c3aed, #06d6a0) 1;
}
```

## Page-Specific Design

### Dashboard
- Hero stat cards with large glowing numbers
- World map background (subtle, low opacity)
- Real-time animated connection lines
- Circular ping gauge (like a speedometer)

### Network Diagnostics
- Terminal-style output for traceroute (green text on dark)
- Live ping chart with glowing line and gradient fill
- DC buttons styled like tactical map markers

### VPN (Smart VPN)
- Full-width world map with animated server markers
- Connection beam animation (user → server)
- Server cards with signal strength bars
- Large connected/disconnected state indicator

### Windows Optimizer
- Circular progress ring showing optimization score
- Before/after comparison values
- Risk level indicators with colored borders
- Toggle switches with glow effect

### Server Picker
- Grid view with mini-maps showing server region
- Ping bar visualization (horizontal bar, color-coded)
- Lock/unlock with padlock animation

### Settings
- Grouped in collapsible sections
- Toggle switches with smooth animation
- Token display with masked/reveal toggle

## Sidebar Layout (Redesigned)
```
┌──────────────────────┐
│  ◆ CS2 PLAYER TOOLS  │  ← Logo with gradient
│  Network & Performance│
├──────────────────────┤
│                      │
│  ● Dashboard         │  ← Active: purple glow
│  ○ Network Diag      │
│  ○ Optimizer         │
│  ○ Smart VPN         │
│  ○ Server Picker     │
│  ○ CS2 Config        │
│  ○ History           │
│  ○ Settings          │
│                      │
├──────────────────────┤
│  ┌ UPDATE v0.2.0 ┐  │  ← Glowing border
│  └────────────────┘  │
├──────────────────────┤
│  🟢 VPN: Frankfurt   │  ← VPN status widget
│  IP: 10.66.66.2     │
│  ↓ 45.2 MB  ↑ 3.1 MB│
├──────────────────────┤
│  ● CS2 Running       │  ← Green pulse
├──────────────────────┤
│  v0.1.0              │
└──────────────────────┘
```

## Animation Guidelines
- Transitions: 200ms ease-out (not ease-in-out — snappier)
- Hover effects: Scale 1.02 max, never more
- Loading: Purple spinner or skeleton with shimmer
- Page transitions: Fade 150ms
- Numbers counting up: 500ms with easing
- Glow pulses: 2s infinite, subtle

## Implementation Plan
1. Update `index.css` with new theme variables + fonts (Google Fonts: Inter + JetBrains Mono)
2. Update Tailwind theme in `@theme` block
3. Redesign Sidebar first (most visible)
4. Update card/button styles globally
5. Page-by-page visual update
6. Add subtle animations
