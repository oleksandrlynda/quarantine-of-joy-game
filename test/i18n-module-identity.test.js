import test from 'node:test';
import assert from 'node:assert/strict';

test('cache-busted i18n module instances share initialized translations', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  globalThis.localStorage = {
    getItem: () => 'uk',
    setItem() {}
  };
  globalThis.document = {
    documentElement: { lang: '' },
    querySelectorAll: () => []
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'uk-UA' }
  });
  globalThis.fetch = async (url) => ({
    ok: true,
    async json() {
      return String(url).includes('/uk.json')
        ? { 'ach.firstBlood.name': 'Перша кров' }
        : { 'ach.firstBlood.name': 'First Blood' };
    }
  });

  try {
    const pageI18n = await import('../src/i18n/index.js?test=page-shell');
    const achievementI18n = await import('../src/i18n/index.js?test=achievement-manager');

    await pageI18n.initI18n();

    assert.equal(achievementI18n.getLanguage(), 'uk');
    assert.equal(achievementI18n.t('ach.firstBlood.name'), 'Перша кров');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.localStorage = originalLocalStorage;
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  }
});
