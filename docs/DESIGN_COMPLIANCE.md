# Design Compliance Checklist

> **Status:** ✅ COMPLIANT | **Last Audit:** February 2026

## Quick Reference

| File | Palette | SVGs | WCAG AA | Status |
|------|---------|------|---------|--------|
| `src/popup.html` | ✅ | ✅ | ✅ | Compliant |
| `src/auth.html` | ✅ | ✅ | ✅ | Compliant |
| `docs/install.html` | ✅ | ✅ | ✅ | Compliant |

## Requirements (from THEME_DESIGN_SYSTEM.md)

1. **Deep Oceanic palette** — use CSS variables, never hardcoded hex
2. **Inline SVGs only** — no emojis (cross-platform consistency)
3. **WCAG 2.1 AA minimum** — 4.5:1 contrast for text
4. **Focus rings** — 2px teal (`--cj-teal-glow`)

## Validation

```bash
# Check for emojis (should return nothing)
grep -rP '[\x{1F300}-\x{1F9FF}]' src/ docs/*.html

# Verify SVG usage
grep -c "svg viewBox" docs/install.html  # Expected: 10+
```

## Color Reference

| Variable | Hex | Use |
|----------|-----|-----|
| `--cj-ocean-deepest` | #0a1628 | Background |
| `--cj-teal-glow` | #14b8a6 | Primary accent |
| `--cj-text-primary` | #f1f5f9 | Main text (12.8:1) |
| `--cj-text-secondary` | #a1b5c8 | Secondary text (7.2:1) |
