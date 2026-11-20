import test from 'node:test';
import assert from 'node:assert/strict';
import viteConfig from '../../src/frontend/vite.config.js';

test('only an enabled build with a token includes an origin-trial meta tag', () => {
  const previous = { ...process.env };
  try {
    for (const [enabled, token, expected] of [['true', 'QWJjZA==', true], ['false', 'QWJjZA==', false], ['true', '', false]]) {
      process.env.VITE_WEBMCP_ENABLED = enabled;
      process.env.VITE_WEBMCP_ORIGIN_TRIAL_TOKEN = token;
      const plugin = viteConfig({ mode: 'test' }).plugins.flat().find(p => p.name === 'webmcp-origin-trial');
      assert.deepEqual(plugin.transformIndexHtml(), expected ? [{
        tag: 'meta', attrs: { 'http-equiv': 'origin-trial', content: token }, injectTo: 'head-prepend',
      }] : []);
    }
  } finally {
    for (const key of ['VITE_WEBMCP_ENABLED', 'VITE_WEBMCP_ORIGIN_TRIAL_TOKEN']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
