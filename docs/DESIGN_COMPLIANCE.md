# Design Compliance Checklist

> **Status:** ✅ COMPLIANT | **Last Audit:** February 2026

## Quick Reference

| File | Palette | Icons | WCAG AA | Status |
|------|---------|-------|---------|--------|
| `src/popup.html` | ✅ | ✅ | ✅ | Compliant |
| `src/auth.html` | ✅ | ✅ | ✅ | Compliant |
| `docs/install.html` | ✅ | ✅ | ✅ | Compliant |

## Icon Rules (from THEME_DESIGN_SYSTEM.md)

- **Primary icons** → Use inline SVGs (buttons, navigation, alerts)
- **Decorative accents** → Emojis OK (step markers, tips, inline text)
- **Never rely on emoji as the only visual indicator**

## Requirements

1. **Deep Oceanic palette** — use CSS variables, never hardcoded hex
2. **WCAG 2.1 AA minimum** — 4.5:1 contrast for text
3. **Focus rings** — 2px teal (`--cj-teal-glow`)

## Color Reference

| Variable | Hex | Use |
|----------|-----|-----|
| `--cj-ocean-deepest` | #0a1628 | Background |
| `--cj-teal-glow` | #14b8a6 | Primary accent |
| `--cj-text-primary` | #f1f5f9 | Main text (12.8:1) |
| `--cj-text-secondary` | #a1b5c8 | Secondary (7.2:1) |
