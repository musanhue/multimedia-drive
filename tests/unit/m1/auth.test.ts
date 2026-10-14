import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCredentials } from '../../../server/config';
import { createGoogleAuth, DRIVE_SCOPES } from '../../../server/drive/auth';

test('Auth: Carga de credenciales desde JSON crudo en variable de entorno', () => {
  const mockKey = JSON.stringify({
    project_id: 'test-project',
    client_email: 'robot@test-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6\\n-----END PRIVATE KEY-----',
  });

  const creds = loadCredentials(mockKey);
  assert.equal(creds.client_email, 'robot@test-project.iam.gserviceaccount.com');
  assert.equal(creds.project_id, 'test-project');
  assert.ok(creds.private_key.includes('\n'), 'Private key should contain real newlines');
  assert.ok(!creds.private_key.includes('\\n'), 'Private key should not contain escaped \\n');
});

test('Auth: Carga de credenciales desde Base64 en variable de entorno', () => {
  const rawJson = JSON.stringify({
    project_id: 'b64-project',
    client_email: 'b64-robot@b64-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nFAKE_KEY\\n-----END PRIVATE KEY-----',
  });
  const b64 = Buffer.from(rawJson, 'utf8').toString('base64');

  const creds = loadCredentials(b64);
  assert.equal(creds.client_email, 'b64-robot@b64-project.iam.gserviceaccount.com');
  assert.equal(creds.project_id, 'b64-project');
  assert.ok(creds.private_key.includes('\n'));
});

test('Auth: Falla cuando falta client_email o private_key', () => {
  const invalidJson = JSON.stringify({
    project_id: 'incomplete-project',
  });

  assert.throws(
    () => loadCredentials(invalidJson),
    /Invalid credentials: client_email or private_key missing/
  );
});

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

test('Auth: Falla cuando no existen credenciales configuradas', () => {
  const savedKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const savedAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    assert.throws(
      () => loadCredentials('', 'non_existent_file_path.json'),
      /No Google Service Account credentials found/
    );
  } finally {
    if (savedKey) process.env.GOOGLE_SERVICE_ACCOUNT_KEY = savedKey;
    if (savedAppCreds) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedAppCreds;
  }
});

test('Auth: Creación de GoogleAuth con scope drive.readonly', () => {
  const mockCreds = {
    project_id: 'scope-project',
    client_email: 'test@scope.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
  };

  const auth = createGoogleAuth(mockCreds);
  assert.ok(auth, 'GoogleAuth instance should be created');
  assert.deepEqual(DRIVE_SCOPES, ['https://www.googleapis.com/auth/drive.readonly']);
});
