# Info Pages Design Spec

## Overview

Add essential pre-launch pages to PixelForge: About, Privacy Policy, Terms of Service, Help, and a proper 404 page. All pages share a common layout component and are accessible via a new Footer on the home page.

## Context

PixelForge is a public-facing web-based image stylization tool. It currently has only 3 routes (`/`, `/2d`, `/3d`) and no informational pages. For a public launch, legal pages (Privacy, Terms) and user-facing pages (About, Help) are required.

## Decisions

- **Layout**: Centered card style (light gray background + white card, max-width 680px) — consistent with the existing home page aesthetic
- **Navigation**: Footer links on home page only — does not clutter the editor UI
- **Content**: Privacy and Terms use placeholder text for now; real legal content to be filled in later
- **i18n**: All pages support English and Chinese via existing i18next setup
- **404**: Replaces the current `*` catch-all that silently redirects to home

## Pages

### InfoPage (Shared Layout Component)

Reusable wrapper for all info pages:
- Light gray background (`#f5f5f0`)
- White card container, max-width 680px, centered
- "← Back to Home" link at top-left
- Page title (h1, 32px, bold)
- 3px black underline accent below title
- Content area with consistent typography

### /about — About Page

Content sections:
1. **Project description** — what PixelForge is, what it does
2. **Core features** — 2D stylization (10 effects) + 3D particle animation
3. **Tech stack** — React 19, TypeScript, Three.js, WebGL, Vite
4. **Contact** — placeholder email

### /privacy — Privacy Policy

Placeholder legal text organized into sections:
- Information We Collect
- How We Use Information
- Cookies
- Third-Party Services
- Data Security
- Your Rights
- Changes to This Policy
- Contact Us

Each section has a heading and placeholder body text in both languages.

### /terms — Terms of Service

Placeholder legal text organized into sections:
- Acceptance of Terms
- Use License
- User Content
- Limitations
- Disclaimer
- Governing Law
- Changes to Terms
- Contact Us

### /help — Help Page

Practical usage guide:
1. **2D Stylization** — how to upload, choose effects, adjust parameters, download
2. **3D Particle Animation** — how to load models, choose effects, capture
3. **Tips** — browser compatibility, supported formats, performance notes

### 404 — Not Found

Simple centered message:
- "404" in large text
- "Page not found" message
- "← Back to Home" button

### Footer Component

Displayed only on the home page (`Home.tsx`):
- 1px top border (`#ddd`)
- Row of links: About | Privacy Policy | Terms of Service | Help
- Links styled with underline, color `#666`
- Copyright line: `© 2026 PixelForge. All rights reserved.` in `#999`

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/InfoPage.tsx` | Create | Shared layout component |
| `src/components/About.tsx` | Create | About page content |
| `src/components/Privacy.tsx` | Create | Privacy policy page |
| `src/components/Terms.tsx` | Create | Terms of service page |
| `src/components/Help.tsx` | Create | Help/usage guide page |
| `src/components/NotFound.tsx` | Create | 404 page |
| `src/components/Footer.tsx` | Create | Footer with nav links |
| `src/App.tsx` | Modify | Add new routes, lazy-load new pages |
| `src/components/Home.tsx` | Modify | Add Footer component |
| `src/i18n/en.json` | Modify | English translations for all new pages |
| `src/i18n/zh.json` | Modify | Chinese translations for all new pages |
| `src/styles/global.css` | Modify | Styles for InfoPage, Footer, 404 |

## Design System Compliance

All new components follow the existing PixelForge design system:
- No shadows, no gradients, no rounded corners
- Colors: black (`#000`), white (`#fff`), light gray (`#f5f5f0`), text gray (`#666`)
- Borders: 2px solid black for cards, 1px for subtle separators
- Typography: system font stack
- Consistent spacing and hover effects matching existing components
