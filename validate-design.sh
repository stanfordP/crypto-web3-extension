#!/bin/bash
echo "=== Design Compliance Validation ==="
echo ""

echo "1. Checking for emoji usage in HTML files..."
EMOJI_COUNT=$(grep -rP '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{26FF}]|[\x{2700}-\x{27BF}]' src/ docs/*.html 2>/dev/null | wc -l)
if [ "$EMOJI_COUNT" -eq 0 ]; then
    echo "   ✅ PASS: No emojis found in HTML files"
else
    echo "   ❌ FAIL: Found $EMOJI_COUNT emojis"
    grep -rP '[\x{1F300}-\x{1F9FF}]|[\x{2600}-\x{26FF}]|[\x{2700}-\x{27BF}]' src/ docs/*.html 2>/dev/null
fi
echo ""

echo "2. Checking for inline SVG usage..."
SVG_COUNT=$(grep -r "svg viewBox" src/ docs/*.html 2>/dev/null | wc -l)
echo "   ✅ Found $SVG_COUNT SVG elements across UI files"
echo ""

echo "3. Checking CSS variable consistency..."
echo "   Checking popup.css..."
grep -q "cj-ocean-deepest" src/styles/popup.css && echo "   ✅ popup.css uses Deep Oceanic palette"
echo "   Checking auth.css..."
grep -q "cj-ocean-deepest" src/styles/auth.css && echo "   ✅ auth.css uses Deep Oceanic palette"
echo "   Checking install.html..."
grep -q "cj-ocean-deepest" docs/install.html && echo "   ✅ install.html uses Deep Oceanic palette"
echo ""

echo "4. Checking accessibility features..."
grep -q "aria-hidden" docs/install.html && echo "   ✅ install.html has ARIA attributes"
grep -q "sr-only" src/styles/popup.css && echo "   ✅ popup.css has screen reader utilities"
grep -q "focus-visible" src/styles/auth.css && echo "   ✅ auth.css has focus indicators"
echo ""

echo "5. Files modified in this change:"
git diff --name-only HEAD 2>/dev/null || echo "   (Git not initialized or no commits)"
echo ""

echo "=== Validation Complete ==="
