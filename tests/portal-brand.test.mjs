import assert from 'node:assert/strict';
import test from 'node:test';
import { portalBrand } from '../portal/brand.mjs';

test('brand variants retain semantic live text and a decorative genuine mark', () => {
  for (const variant of ['auth', 'sidebar']) {
    const markup = portalBrand(variant);
    assert.match(markup, new RegExp(`portal-brand--${variant}`));
    assert.match(markup, /src="\/images\/adplix-logo-small\.jpg" width="128" height="128" alt=""/);
    assert.match(markup, /Adplix <span class="portal-brand-media">Media<\/span>/);
  }
  assert.equal(portalBrand(), portalBrand('auth'));
  assert.throws(() => portalBrand('auth" onclick="alert(1)'), TypeError);
});
