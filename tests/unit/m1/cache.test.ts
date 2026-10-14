import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCache } from '../../../server/drive/cache';

test('Cache: Almacena y recupera elementos dentro del TTL', () => {
  const cache = new MemoryCache(60);
  cache.set('key1', { foo: 'bar' });

  assert.equal(cache.has('key1'), true);
  assert.deepEqual(cache.get('key1'), { foo: 'bar' });
  assert.equal(cache.size(), 1);
  cache.destroy();
});

test('Cache: Retorna null y elimina claves expiradas', async () => {
  const cache = new MemoryCache(60);
  // TTL de 20ms
  cache.set('short_lived', 'valor_temporal', 20);

  assert.equal(cache.get('short_lived'), 'valor_temporal');

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(cache.get('short_lived'), null);
  assert.equal(cache.has('short_lived'), false);
  cache.destroy();
});

test('Cache: Invocación de delete() elimina clave específica', () => {
  const cache = new MemoryCache(60);
  cache.set('a', 1);
  cache.set('b', 2);

  assert.equal(cache.delete('a'), true);
  assert.equal(cache.get('a'), null);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.size(), 1);
  cache.destroy();
});

test('Cache: Invocación de clear() limpia todo el almacén', () => {
  const cache = new MemoryCache(60);
  cache.set('k1', 'v1');
  cache.set('k2', 'v2');
  cache.set('k3', 'v3');

  assert.equal(cache.size(), 3);
  cache.clear();
  assert.equal(cache.size(), 0);
  assert.equal(cache.get('k1'), null);
  cache.destroy();
});
