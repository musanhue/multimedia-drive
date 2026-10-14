const { M56Validator } = require('../../../tests/harness/m56-validator');

// 1. Validate JS sample
const compliantJs = `
var App = (function() {
  function App() {
    this.name = 'Multimedia Drive';
  }
  App.prototype.init = function() {
    var config = Object.assign({}, { title: 'TV' });
  };
  return App;
})();
`;
const jsRes = M56Validator.validateJavaScript(compliantJs);
console.log('JS Validation:', jsRes);

// 2. Validate CSS sample
const compliantCss = `
.carousel {
  display: flex;
  flex-direction: row;
  overflow: hidden;
}
.card {
  width: 200px;
  height: 300px;
  margin-right: 24px;
  transform: translate3d(0, 0, 0);
  transition: transform 0.2s ease-out;
}
.card.is-focused {
  transform: scale(1.06);
  border: 3px solid #00a8ff;
  box-shadow: 0 0 18px rgba(0, 168, 255, 0.85);
}
`;
const cssRes = M56Validator.validateCSS(compliantCss);
console.log('CSS Validation:', cssRes);

// 3. Validate HTML sample
const compliantHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1920, user-scalable=no">
  <title>Multimedia Drive</title>
  <link rel="stylesheet" href="assets/main.css">
</head>
<body>
  <div id="app"></div>
  <script src="assets/polyfills-legacy.js"></script>
  <script src="assets/index-legacy.js"></script>
</body>
</html>`;
const htmlRes = M56Validator.validateHTML(compliantHtml);
console.log('HTML Validation:', htmlRes);
