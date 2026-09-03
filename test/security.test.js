import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_SECURITY_POLICY,
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  withSecurityHeaders
} from '../electron/security.js';

test('renderer trust is pinned to the exact loopback origin', () => {
  const origin = 'http://127.0.0.1:43123';
  assert.equal(isTrustedRendererUrl(`${origin}/`, origin), true);
  assert.equal(isTrustedRendererUrl(`${origin}/notes`, origin), true);
  assert.equal(isTrustedRendererUrl('http://localhost:43123/', origin), false);
  assert.equal(isTrustedRendererUrl('http://127.0.0.1:43124/', origin), false);
  assert.equal(isTrustedRendererUrl('https://example.com/', origin), false);
});

test('only http(s) links may leave the application', () => {
  assert.equal(isAllowedExternalUrl('https://example.com/note'), true);
  assert.equal(isAllowedExternalUrl('http://example.com/note'), true);
  assert.equal(isAllowedExternalUrl('file:///etc/hosts'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
});

test('local responses carry a restrictive baseline', () => {
  const headers = withSecurityHeaders({ 'content-type': 'text/html' });
  assert.equal(headers['content-security-policy'], CONTENT_SECURITY_POLICY);
  assert.match(headers['content-security-policy'], /object-src 'none'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['content-type'], 'text/html');
});
