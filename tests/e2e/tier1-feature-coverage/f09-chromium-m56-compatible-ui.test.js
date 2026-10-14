// Feature F9: Chromium M56 Compatible UI - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { M56Validator } = require('../../harness/m56-validator');

module.exports = {
  featureId: 'F9',
  featureName: 'Chromium M56 Compatible UI',
  tier: 1,
  tests: [
    {
      id: 'F9-01',
      name: 'Validates JavaScript bundle does not contain prohibited object spread syntax ({ ...obj })',
      run: async () => {
        const sampleCompliantJs = 'var target = Object.assign({}, objA, { prop: 1 });';
        const res = M56Validator.validateJavaScript(sampleCompliantJs);
        Assert.equal(res.valid, true, 'Object.assign syntax should pass M56 validation');

        const sampleIncompatibleJs = 'const bad = { ...objA, prop: 1 };';
        const badRes = M56Validator.validateJavaScript(sampleIncompatibleJs);
        Assert.equal(badRes.valid, false, 'Object spread should fail M56 validation');
        Assert.equal(badRes.violations[0].rule, 'OBJECT_SPREAD_PROHIBITED');
      }
    },
    {
      id: 'F9-02',
      name: 'Validates JavaScript bundle does not contain prohibited optional chaining (?.) or nullish coalescing (??)',
      run: async () => {
        const modernJs = 'const x = item?.title ?? "Untitled";';
        const res = M56Validator.validateJavaScript(modernJs);
        Assert.equal(res.valid, false, 'Modern operators must be rejected');
        const rules = res.violations.map(v => v.rule);
        Assert.ok(rules.includes('OPTIONAL_CHAINING_PROHIBITED'));
        Assert.ok(rules.includes('NULLISH_COALESCING_PROHIBITED'));
      }
    },
    {
      id: 'F9-03',
      name: 'Validates CSS stylesheets do not contain prohibited CSS Grid or Flexbox gap properties',
      run: async () => {
        const compliantCss = '.carousel { display: flex; flex-direction: row; } .card { margin-right: 20px; }';
        const res = M56Validator.validateCSS(compliantCss);
        Assert.equal(res.valid, true, 'Flexbox with margins should pass');

        const badCss = '.grid-container { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }';
        const badRes = M56Validator.validateCSS(badCss);
        Assert.equal(badRes.valid, false);
        const rules = badRes.violations.map(v => v.rule);
        Assert.ok(rules.includes('CSS_GRID_PROHIBITED'));
        Assert.ok(rules.includes('FLEXBOX_GAP_PROHIBITED'));
      }
    },
    {
      id: 'F9-04',
      name: 'Validates HTML entry point uses classic <script> tags and rejects <script type="module">',
      run: async () => {
        const compliantHtml = '<!DOCTYPE html><html><head><meta name="viewport" content="width=1920"></head><body><script src="bundle.js"></script></body></html>';
        const res = M56Validator.validateHTML(compliantHtml);
        Assert.equal(res.valid, true, 'Classic script tag should pass');

        const moduleHtml = '<!DOCTYPE html><html><body><script type="module" src="app.js"></script></body></html>';
        const badRes = M56Validator.validateHTML(moduleHtml);
        Assert.equal(badRes.valid, false, 'Module script should fail');
        Assert.equal(badRes.violations[0].rule, 'MODULE_SCRIPTS_PROHIBITED');
      }
    },
    {
      id: 'F9-05',
      name: 'Validates CSS stylesheets reject :focus-visible and aspect-ratio properties',
      run: async () => {
        const badCss = '.card:focus-visible { outline: 2px solid blue; } .card { aspect-ratio: 16/9; }';
        const res = M56Validator.validateCSS(badCss);
        Assert.equal(res.valid, false);
        const rules = res.violations.map(v => v.rule);
        Assert.ok(rules.includes('FOCUS_VISIBLE_PROHIBITED'));
        Assert.ok(rules.includes('ASPECT_RATIO_PROHIBITED'));
      }
    }
  ]
};
