#!/bin/bash
# Quick design validation - run before commits
echo "Design Check:"

# Check SVGs in key locations
SVG=$(grep -c "svg viewBox" docs/install.html 2>/dev/null)
echo "✅ $SVG SVGs in install.html"

# Check palette
grep -q "cj-ocean-deepest" src/styles/popup.css && echo "✅ Palette OK"

# Note: Emojis allowed for decorative accents (step markers, tips)

