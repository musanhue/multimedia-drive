// Feature F9: Chromium M56 Compatible UI - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { M56Validator } = require('../../harness/m56-validator');

module.exports = {
  featureId: 'F9',
  featureName: 'Chromium M56 Compatible UI (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F9-B01',
      name: 'Rejects RegExp lookbehind assertions (?<=...) and (?<!...) unsupported in Chromium M56',
      run: async () => {
        const jsWithLookbehind = 'const clean = str.replace(/(?<=prefix)content/, "");';
        const res = M56Validator.validateJavaScript(jsWithLookbehind);
        Assert.equal(res.valid, false);
        Assert.equal(res.violations[0].rule, 'REGEXP_LOOKBEHIND_PROHIBITED');
      }
    },
    {
      id: 'F9-B02',
      name: 'Rejects Array.prototype.flat / flatMap when used without explicit polyfill',
      run: async () => {
        const jsWithFlat = 'const flattened = nestedArray.flat();';
        const res = M56Validator.validateJavaScript(jsWithFlat);
        Assert.equal(res.valid, false);
        Assert.equal(res.violations[0].rule, 'ARRAY_FLAT_PROHIBITED');
      }
    },
    {
      id: 'F9-B03',
      name: 'Rejects Promise.allSettled when used without explicit polyfill',
      run: async () => {
        const jsWithAllSettled = 'const results = await Promise.allSettled(promises);';
        const res = M56Validator.validateJavaScript(jsWithAllSettled);
        Assert.equal(res.valid, false);
        Assert.equal(res.violations[0].rule, 'PROMISE_ALL_SETTLED_PROHIBITED');
      }
    },
    {
      id: 'F9-B04',
      name: 'Validates that CSS row-gap and column-gap are caught by flexbox gap linter',
      run: async () => {
        const cssWithRowGap = '.container { display: flex; row-gap: 24px; column-gap: 12px; }';
        const res = M56Validator.validateCSS(cssWithRowGap);
        Assert.equal(res.valid, false);
        Assert.equal(res.violations[0].rule, 'FLEXBOX_GAP_PROHIBITED');
      }
    },
    {
      id: 'F9-B05',
      name: 'Allows valid ES6 syntax (classes, arrow functions, template literals, let/const) without false positives',
      run: async () => {
        const validEs6 = `
          class Player {
            constructor(name) {
              this.name = name;
              const items = [1, 2, 3];
              items.forEach(x => {
                let msg = \`Item: \${x}\`;
              });
            }
          }
        `;
        const res = M56Validator.validateJavaScript(validEs6);
        Assert.equal(res.valid, true, 'Valid ES6 syntax must pass without false positives');
      }
    }
  ]
};
