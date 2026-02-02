#!/bin/bash
# Quick design validation - run before commits
echo "Design Check:"

# Check emojis
EMOJI=$(grep -rP '[\x{1F300}-\x{1F9FF}]' src/ docs/*.html 2>/dev/null | wc -l)
[ "$EMOJI" -eq 0 ] && echo "✅ No emojis" || echo "❌ Found $EMOJI emojis"

# Check SVGs  
SVG=$(grep -c "svg viewBox" docs/install.html 2>/dev/null)
echo "✅ $SVG SVGs in install.html"

# Check palette
grep -q "cj-ocean-deepest" src/styles/popup.css && echo "✅ Palette OK"

