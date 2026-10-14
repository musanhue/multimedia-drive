// Opaque-Box HTTP Test Client & Assertion Utilities
// Uses standard Node.js http/https and native fetch

const http = require('http');

class TestClient {
  constructor(baseUrl = 'http://localhost:3099') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  async request(path, options = {}) {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    const method = (options.method || 'GET').toUpperCase();
    const headers = options.headers || {};

    return new Promise((resolve, reject) => {
      const req = http.request(url, {
        method,
        headers,
        timeout: options.timeout || 10000
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          const rawText = rawBuffer.toString('utf8');

          let json = null;
          try {
            json = JSON.parse(rawText);
          } catch {
            // Not JSON
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: rawBuffer,
            text: rawText,
            json: json,
            ok: res.statusCode >= 200 && res.statusCode < 300
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${options.timeout || 10000}ms: ${url}`));
      });

      if (options.body) {
        if (Buffer.isBuffer(options.body) || typeof options.body === 'string') {
          req.write(options.body);
        } else {
          req.write(JSON.stringify(options.body));
        }
      }

      req.end();
    });
  }

  async get(path, headers = {}) {
    return this.request(path, { method: 'GET', headers });
  }

  async head(path, headers = {}) {
    return this.request(path, { method: 'HEAD', headers });
  }

  async post(path, body = {}, headers = {}) {
    return this.request(path, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', ...headers }
    });
  }

  async options(path, headers = {}) {
    return this.request(path, { method: 'OPTIONS', headers });
  }

  // Range Request Helper
  async getRange(path, rangeHeader) {
    return this.request(path, {
      method: 'GET',
      headers: { Range: rangeHeader }
    });
  }
}

// Assertions Helper
const Assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual, expected, message) {
    const aStr = JSON.stringify(actual);
    const eStr = JSON.stringify(expected);
    if (aStr !== eStr) {
      throw new Error(`${message || 'Assertion failed'}: expected ${eStr}, got ${aStr}`);
    }
  },
  ok(value, message) {
    if (!value) {
      throw new Error(message || 'Assertion failed: value is falsy');
    }
  },
  match(actual, regex, message) {
    if (!regex.test(actual)) {
      throw new Error(`${message || 'Assertion failed'}: ${JSON.stringify(actual)} does not match ${regex}`);
    }
  },
  includes(actual, substring, message) {
    if (!actual || !actual.includes(substring)) {
      throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(substring)}`);
    }
  },
  notIncludes(actual, substring, message) {
    if (actual && actual.includes(substring)) {
      throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(actual)} NOT to include ${JSON.stringify(substring)}`);
    }
  },
  status(response, expectedStatus, message) {
    if (response.status !== expectedStatus) {
      throw new Error(`${message || 'HTTP status check failed'}: expected ${expectedStatus}, got ${response.status} (body: ${response.text.substring(0, 100)})`);
    }
  },
  header(response, headerName, expectedValue, message) {
    const actual = response.headers[headerName.toLowerCase()];
    if (expectedValue instanceof RegExp) {
      if (!expectedValue.test(actual)) {
        throw new Error(`${message || 'Header regex failed'}: header '${headerName}' = '${actual}' does not match ${expectedValue}`);
      }
    } else {
      if (actual !== expectedValue) {
        throw new Error(`${message || 'Header check failed'}: header '${headerName}' = '${actual}', expected '${expectedValue}'`);
      }
    }
  }
};

module.exports = {
  TestClient,
  Assert
};
