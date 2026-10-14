# Fix Strategy: Traversal Trailing Slash & Config Credentials Validation

**Author**: `explorer_m1_fix_1` (Traversal & Config Fix Explorer)  
**Date**: 2026-10-13  
**Status**: APPROVED DESIGN / READY FOR IMPLEMENTATION  
**Target Files**:
- `server/drive/traversal.ts`
- `server/config.ts`

---

## 1. Executive Summary

This document details the architectural root-cause analysis and provides exact drop-in fix designs for the two issues identified during M1 challenger evaluation:
1. **Trailing slash failures in category matching (`server/drive/traversal.ts`)**: Folder names or route parameters containing trailing slashes (e.g., `Películas/`, `peliculas/`, `Películas//`) fail canonical regex checks and return `null`, causing 404 responses in HTTP routes.
2. **Missing credentials validation in file fallbacks (`server/config.ts`)**: Fallback file resolution (`GOOGLE_APPLICATION_CREDENTIALS` and `credentials.json`) parses arbitrary JSON and returns incomplete objects without verifying that `client_email` and `private_key` are present and valid non-empty strings.

---

## 2. Issue 1: Category Trailing Slashes (`server/drive/traversal.ts`)

### 2.1 Problem Analysis
In `server/drive/traversal.ts`:
- `normalizeString()` (lines 13–19) performs NFD accent decomposition, strips diacritical combining marks, trims whitespace, and converts to lowercase. However, it does not strip path delimiters or trailing slashes:
  ```typescript
  export function normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
  ```
- As a consequence:
  - Input `"Películas/"` normalizes to `"peliculas/"`.
  - In `matchCategory(folderName)` (lines 21–31), the regexes `/^(peliculas|cine|movies)$/` strictly anchor at start `^` and end `$`. The trailing slash causes `.test("peliculas/")` to evaluate to `false`, returning `null`.
  - In `normalizeCategoryParam(param)` (lines 33–36), input `"peliculas/"` evaluates to `null`.
  - In `server/routes/drive.ts:86-94`, requests like `GET /api/drive/files/peliculas/` or trailing-slashed client requests fail with HTTP 404 `Category 'peliculas/' not found`.
  - If a Google Drive folder name is created as `"Películas/"`, folder resolution fails to identify the category.

### 2.2 Fix Formulation
We update `normalizeString(str: string)` to:
1. Handle falsy or non-string input safely (`if (!str || typeof str !== 'string') return '';`).
2. Strip trailing slashes via `.replace(/\/+$/, '')`.
3. Chain trimming before and after slash removal (`.trim().replace(/\/+$/, '').trim()`) to handle inputs like `"Películas/ "` or `"Películas /"`.
4. Add defensive guards to `matchCategory()` and `normalizeCategoryParam()` for empty or non-string inputs.

Because `matchCategory()` and `normalizeCategoryParam()` both delegate directly to `normalizeString()`, this single normalization pipeline fix immediately cures:
- `normalizeString("Películas/")` -> `"peliculas"`
- `normalizeString("Películas//")` -> `"peliculas"`
- `matchCategory("Películas/")` -> `'peliculas'`
- `matchCategory("Películas//")` -> `'peliculas'`
- `matchCategory("Videos familiares/")` -> `'familiares'`
- `normalizeCategoryParam("peliculas/")` -> `'peliculas'`
- `normalizeCategoryParam("series/")` -> `'series'`

### 2.3 Exact Proposed Changes in `server/drive/traversal.ts`

```typescript
<<<< Before (server/drive/traversal.ts:13-36)
export function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function matchCategory(folderName: string): MediaCategory | null {
  const norm = normalizeString(folderName);
  if (/^(peliculas|cine|movies)$/.test(norm)) return 'peliculas';
  if (/^(series|tv|shows|series tv|tv shows)$/.test(norm)) return 'series';
  if (/^(videos familiares|familia|home videos|videos caseros|videos|videos_familiares|familiares)$/.test(norm)) {
    return 'familiares';
  }
  if (/^(fotos|fotografias|photos|imagenes)$/.test(norm)) return 'fotos';
  if (/^(musica|music|audio)$/.test(norm)) return 'musica';
  return null;
}

export function normalizeCategoryParam(param: string): MediaCategory | null {
  const norm = normalizeString(param);
  return matchCategory(norm);
}
====
>>>> After (server/drive/traversal.ts:13-40)
export function normalizeString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();
}

export function matchCategory(folderName: string): MediaCategory | null {
  if (!folderName || typeof folderName !== 'string') return null;
  const norm = normalizeString(folderName);
  if (/^(peliculas|cine|movies)$/.test(norm)) return 'peliculas';
  if (/^(series|tv|shows|series tv|tv shows)$/.test(norm)) return 'series';
  if (/^(videos familiares|familia|home videos|videos caseros|videos|videos_familiares|familiares)$/.test(norm)) {
    return 'familiares';
  }
  if (/^(fotos|fotografias|photos|imagenes)$/.test(norm)) return 'fotos';
  if (/^(musica|music|audio)$/.test(norm)) return 'musica';
  return null;
}

export function normalizeCategoryParam(param: string): MediaCategory | null {
  if (!param || typeof param !== 'string') return null;
  const norm = normalizeString(param);
  return matchCategory(norm);
}
>>>>
```

---

## 3. Issue 2: Fallback Credentials Validation (`server/config.ts`)

### 3.1 Problem Analysis
In `server/config.ts`:
- Environment variable credentials (`GOOGLE_SERVICE_ACCOUNT_KEY`, lines 48–53) enforce strict presence of `client_email` and `private_key`:
  ```typescript
  const parsed = JSON.parse(jsonStr) as ServiceAccountCredentials;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
  ```
- In contrast, Fallback 1 (`GOOGLE_APPLICATION_CREDENTIALS`, lines 59–72) and Fallback 2 (`credentials.json`, lines 74–87) parse the file and return `parsed` without any validation if `client_email` and `private_key` are missing:
  ```typescript
  // Fallback 1
  const raw = fs.readFileSync(googleAppCreds, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed; // Blindly returns { project_id: "incomplete" } without error!

  // Fallback 2
  const raw = fs.readFileSync(localFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed; // Blindly returns incomplete object!
  ```
- Impact:
  - If a file contains `{ "project_id": "test" }` or `{}` or other incomplete JSON, `loadCredentials()` returns an invalid credentials object that fails later when `createGoogleAuth()` attempts to initialize `google.auth.GoogleAuth`, yielding silent failures or confusing runtime errors.
  - Asymmetry between environment variable loader and file loaders creates security and reliability gaps.

### 3.2 Fix Formulation
We encapsulate validation into a dedicated helper function:
```typescript
function validateAndNormalizeCredentials(parsed: any): ServiceAccountCredentials {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid credentials: expected JSON object');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
    throw new Error('Invalid credentials: client_email and private_key must be strings');
  }
  if (parsed.client_email.trim().length === 0 || parsed.private_key.trim().length === 0) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed as ServiceAccountCredentials;
}
```

This helper is called across all three branches:
1. `GOOGLE_SERVICE_ACCOUNT_KEY` JSON branch
2. `GOOGLE_APPLICATION_CREDENTIALS` file branch
3. `credentials.json` (and `customFilePath`) file branch

This ensures identical validation semantics, consistent error messages matching `/Invalid credentials: client_email or private_key missing/`, and uniform newline unescaping (`\n`).

### 3.3 Exact Proposed Changes in `server/config.ts`

```typescript
<<<< Before (server/config.ts:30-87)
export function loadCredentials(customKey?: string, customFilePath?: string): ServiceAccountCredentials {
  const envKey = customKey !== undefined ? customKey : process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (envKey && envKey.trim().length > 0) {
    const trimmed = envKey.trim();
    let jsonStr: string;

    if (trimmed.startsWith('{')) {
      jsonStr = trimmed;
    } else {
      try {
        jsonStr = Buffer.from(trimmed, 'base64').toString('utf8');
      } catch (err: any) {
        throw new Error(`Failed to decode GOOGLE_SERVICE_ACCOUNT_KEY from Base64: ${err.message}`);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr) as ServiceAccountCredentials;
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Invalid credentials: client_email or private_key missing');
      }
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      return parsed;
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON: ${err.message}`);
    }
  }

  // Fallback 1: GOOGLE_APPLICATION_CREDENTIALS path
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds && fs.existsSync(googleAppCreds)) {
    try {
      const raw = fs.readFileSync(googleAppCreds, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_APPLICATION_CREDENTIALS file: ${err.message}`);
    }
  }

  // Fallback 2: Local credentials.json
  const localFile = customFilePath || path.resolve(process.cwd(), 'credentials.json');
  if (fs.existsSync(localFile)) {
    try {
      const raw = fs.readFileSync(localFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (err: any) {
      throw new Error(`Failed to parse credentials.json: ${err.message}`);
    }
  }
====
>>>> After (server/config.ts:30-89)
function validateAndNormalizeCredentials(parsed: any): ServiceAccountCredentials {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid credentials: expected JSON object');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
    throw new Error('Invalid credentials: client_email and private_key must be strings');
  }
  if (parsed.client_email.trim().length === 0 || parsed.private_key.trim().length === 0) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed as ServiceAccountCredentials;
}

export function loadCredentials(customKey?: string, customFilePath?: string): ServiceAccountCredentials {
  const envKey = customKey !== undefined ? customKey : process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (envKey && envKey.trim().length > 0) {
    const trimmed = envKey.trim();
    let jsonStr: string;

    if (trimmed.startsWith('{')) {
      jsonStr = trimmed;
    } else {
      try {
        jsonStr = Buffer.from(trimmed, 'base64').toString('utf8');
      } catch (err: any) {
        throw new Error(`Failed to decode GOOGLE_SERVICE_ACCOUNT_KEY from Base64: ${err.message}`);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return validateAndNormalizeCredentials(parsed);
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON: ${err.message}`);
    }
  }

  // Fallback 1: GOOGLE_APPLICATION_CREDENTIALS path
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds && fs.existsSync(googleAppCreds)) {
    try {
      const raw = fs.readFileSync(googleAppCreds, 'utf8');
      const parsed = JSON.parse(raw);
      return validateAndNormalizeCredentials(parsed);
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_APPLICATION_CREDENTIALS file: ${err.message}`);
    }
  }

  // Fallback 2: Local credentials.json
  const localFile = customFilePath || path.resolve(process.cwd(), 'credentials.json');
  if (fs.existsSync(localFile)) {
    try {
      const raw = fs.readFileSync(localFile, 'utf8');
      const parsed = JSON.parse(raw);
      return validateAndNormalizeCredentials(parsed);
    } catch (err: any) {
      throw new Error(`Failed to parse credentials.json: ${err.message}`);
    }
  }
>>>>
```

---

## 4. Test Suite Adaptations

### 4.1 Unit Test Additions in `tests/unit/m1/traversal.test.ts`
Add assertions to `test('Traversal: Normalización del parámetro de categoría de ruta')`:
```typescript
  assert.equal(normalizeCategoryParam('Películas/'), 'peliculas');
  assert.equal(normalizeCategoryParam('peliculas/'), 'peliculas');
  assert.equal(normalizeCategoryParam('series/'), 'series');
  assert.equal(normalizeCategoryParam('musica/'), 'musica');
  assert.equal(normalizeCategoryParam('fotos/'), 'fotos');
  assert.equal(normalizeCategoryParam('familiares/'), 'familiares');
  assert.equal(normalizeCategoryParam('Películas//'), 'peliculas');
```
And in `test('Traversal: Mapeo de categorías canónicas y alias comunes')`:
```typescript
  assert.equal(matchCategory('Películas/'), 'peliculas');
  assert.equal(matchCategory('Series/'), 'series');
  assert.equal(matchCategory('Música/'), 'musica');
  assert.equal(matchCategory('Fotos/'), 'fotos');
  assert.equal(matchCategory('Videos familiares/'), 'familiares');
```

### 4.2 Unit Test Additions in `tests/unit/m1/auth.test.ts`
Add test verifying that incomplete fallback files are rejected:
```typescript
test('Auth: Falla cuando credentials.json de fallback carece de campos obligatorios', () => {
  const fs = require('fs');
  const path = require('path');
  const tempPath = path.resolve(process.cwd(), 'temp_incomplete_unit_creds.json');
  try {
    fs.writeFileSync(tempPath, JSON.stringify({ project_id: 'missing-keys-project' }));
    assert.throws(
      () => loadCredentials(undefined, tempPath),
      /Invalid credentials: client_email or private_key missing/
    );
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});
```

### 4.3 Adversarial Test Update Notice: `tests/adversarial/m1_auth_traversal_stress.test.ts`
**CRITICAL NOTE FOR IMPLEMENTER/TEST RUNNER**:
In `tests/adversarial/m1_auth_traversal_stress.test.ts:540-556`, the challenger wrote:
```typescript
test('Credentials [Adversarial]: Incomplete credentials in credentials.json file fallback', () => {
  const tempCredsPath = path.resolve(process.cwd(), 'temp_incomplete_creds.json');
  try {
    fs.writeFileSync(
      tempCredsPath,
      JSON.stringify({
        project_id: 'incomplete-project',
      })
    );

    const creds = loadCredentials(undefined, tempCredsPath);
    console.log('[Credentials Probe] Fallback credentials returned without validation:', creds);
  } finally {
    if (fs.existsSync(tempCredsPath)) fs.unlinkSync(tempCredsPath);
  }
});
```
When `loadCredentials()` is fixed, line 550 will throw an error as intended! Because the original probe called `loadCredentials()` directly without `assert.throws`, the probe must be updated to assert that it throws:
```typescript
    assert.throws(
      () => loadCredentials(undefined, tempCredsPath),
      /Invalid credentials: client_email or private_key missing/
    );
```
Otherwise, the unhandled error in the probe test would cause Node's test runner to report a test error.

---

## 5. Verification Checklist

1. **Compilation**:
   ```powershell
   npm run build
   ```
2. **Unit Tests**:
   ```powershell
   npx tsx --test tests/unit/m1/*.test.ts
   ```
   Must pass 100% of tests.
3. **Adversarial Suite**:
   ```powershell
   npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
   ```
   Confirm that:
   - `[Folder Matcher Probe] normalizeCategoryParam("peliculas/") -> "peliculas"` (not null).
   - Trailing slash inputs match their canonical categories.
   - Incomplete credentials fallback throws `Invalid credentials: client_email or private_key missing`.
4. **E2E Suite**:
   ```powershell
   npm test
   ```
   Must pass all 207 E2E tests across all tiers.
