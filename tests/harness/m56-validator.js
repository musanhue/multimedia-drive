// Chromium M56 & Samsung Tizen 4.0 Compatibility Validator
// Evaluates JavaScript and CSS code against Chromium 56 hardware engine constraints

const fs = require('fs');
const path = require('path');

class M56Validator {
  /**
   * Scans a JavaScript string for syntax incompatible with Chromium M56
   */
  static validateJavaScript(code) {
    const violations = [];

    // 1. Prohibited: Optional Chaining (?.)
    // Matches ident?.ident or [ident]?. or (?.[)
    if (/(?:[a-zA-Z0-9_\$\]\)])\s*\?\.\s*[a-zA-Z0-9_\$\[\(]/.test(code)) {
      violations.push({
        rule: 'OPTIONAL_CHAINING_PROHIBITED',
        message: 'Optional chaining (?.) is unsupported in Chrome 56 (introduced in Chrome 80). Throws SyntaxError.'
      });
    }

    // 2. Prohibited: Nullish Coalescing (??)
    if (/\?\?/.test(code)) {
      violations.push({
        rule: 'NULLISH_COALESCING_PROHIBITED',
        message: 'Nullish coalescing (??) is unsupported in Chrome 56 (introduced in Chrome 80). Throws SyntaxError.'
      });
    }

    // 3. Prohibited: Object Spread in Object Literals ({ ...a })
    // Matches { ...identifier } but excludes array spreads like [...arr]
    if (/\{[^{}]*\.\.\.[a-zA-Z0-9_\$]+[^{}]*\}/.test(code)) {
      violations.push({
        rule: 'OBJECT_SPREAD_PROHIBITED',
        message: 'Object spread syntax ({ ...obj }) is unsupported in Chrome 56 (requires Chrome 60+). Throws SyntaxError.'
      });
    }

    // 4. Prohibited: Modern RegExp lookbehind (?<=...) or (?<!...)
    if (/\(\?<[!=]/.test(code)) {
      violations.push({
        rule: 'REGEXP_LOOKBEHIND_PROHIBITED',
        message: 'RegExp lookbehind assertions (?<=) are unsupported in Chrome 56 (introduced in Chrome 62).'
      });
    }

    // 5. Prohibited: Array.prototype.flat / flatMap without polyfills
    if (/\.flatMap\(|\.flat\(/.test(code) && !/flat(?:Map)?\s*=\s*/.test(code)) {
      violations.push({
        rule: 'ARRAY_FLAT_PROHIBITED',
        message: 'Array.prototype.flat / flatMap are unsupported in Chrome 56 (introduced in Chrome 69).'
      });
    }

    // 6. Prohibited: Promise.allSettled without polyfill
    if (/Promise\.allSettled\(/.test(code) && !/Promise\.allSettled\s*=/.test(code)) {
      violations.push({
        rule: 'PROMISE_ALL_SETTLED_PROHIBITED',
        message: 'Promise.allSettled is unsupported in Chrome 56 (introduced in Chrome 76).'
      });
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Scans a CSS string for rules incompatible with Chromium M56
   */
  static validateCSS(css) {
    const violations = [];

    // 1. Prohibited: CSS Grid (display: grid)
    if (/display\s*:\s*grid\b/i.test(css)) {
      violations.push({
        rule: 'CSS_GRID_PROHIBITED',
        message: 'display: grid is unsupported in Chrome 56 (introduced in Chrome 57). Element collapses.'
      });
    }

    // 2. Prohibited: Flexbox gap (gap:, row-gap:, column-gap:)
    if (/(?:^|[\s;{}])(?:row-|column-)?gap\s*:\s*[^;{}]+/i.test(css)) {
      violations.push({
        rule: 'FLEXBOX_GAP_PROHIBITED',
        message: 'Flexbox gap property is unsupported in Chrome 56 (introduced in Chrome 84). Margins must be used instead.'
      });
    }

    // 3. Prohibited: aspect-ratio:
    if (/(?:^|[\s;{}])aspect-ratio\s*:\s*[^;{}]+/i.test(css)) {
      violations.push({
        rule: 'ASPECT_RATIO_PROHIBITED',
        message: 'aspect-ratio CSS property is unsupported in Chrome 56 (introduced in Chrome 88). Explicit width/height or padding hacks must be used.'
      });
    }

    // 4. Prohibited: :focus-visible
    if (/:focus-visible\b/i.test(css)) {
      violations.push({
        rule: 'FOCUS_VISIBLE_PROHIBITED',
        message: ':focus-visible pseudo-class is unsupported in Chrome 56 (introduced in Chrome 86). Use .is-focused class instead.'
      });
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Scans an HTML file / markup for Chromium M56 compliance
   */
  static validateHTML(html) {
    const violations = [];

    // 1. Prohibited: <script type="module">
    if (/<script[^>]*type\s*=\s*["']module["']/i.test(html)) {
      violations.push({
        rule: 'MODULE_SCRIPTS_PROHIBITED',
        message: '<script type="module"> is completely ignored by Chrome 56 (introduced in Chrome 61). Use classic script tags.'
      });
    }

    // 2. Viewport scale check
    if (!/<meta[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["'][^"']*width\s*=\s*1920/i.test(html) &&
        !/<meta[^>]*content\s*=\s*["'][^"']*width\s*=\s*1920[^"']*["'][^>]*name\s*=\s*["']viewport["']/i.test(html)) {
      violations.push({
        rule: 'VIEWPORT_SCALE_RECOMMENDATION',
        message: 'Viewport should specify width=1920 to leverage Tizen hardware 4K upscaler at 60fps.'
      });
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }
}

module.exports = {
  M56Validator
};
