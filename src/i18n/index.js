const SUPPORTED_LANGS = ['en', 'uk'];
const DEFAULT_LANG = 'en';
const RESOURCE_QUERY = new URL(import.meta.url).search;
const STATE_KEY = Symbol.for('quarantine-of-joy.i18n-state');

// Cache-busted import URLs are distinct ES modules in the browser. Keep the
// locale and loaded dictionaries on a shared state object so callers importing
// different revisions still use the resources initialized by the page shell.
const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {
  currentLang: DEFAULT_LANG,
  resources: {}
});

async function loadResources(lang) {
  if (state.resources[lang]) return state.resources[lang];
  const resourceUrl = `i18n/${lang}.json${RESOURCE_QUERY}`;
  const res = await fetch(resourceUrl);
  if (!res.ok) throw new Error(`Failed to load i18n resources for ${lang}`);
  state.resources[lang] = await res.json();
  return state.resources[lang];
}

export async function initI18n() {
  let lang = localStorage.getItem('lang') || navigator.language?.split('-')[0];
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  state.currentLang = lang;
  await loadResources('en');
  if (lang !== 'en') {
    try {
      await loadResources(lang);
    } catch (e) {
      console.warn(`i18n: falling back to English for ${lang}`, e);
      state.currentLang = DEFAULT_LANG;
    }
  }
  document.documentElement.lang = state.currentLang;
}

export function t(key) {
  return (
    (state.resources[state.currentLang] && state.resources[state.currentLang][key]) ||
    (state.resources['en'] && state.resources['en'][key]) ||
    key
  );
}

export function applyTranslations(root = document) {
  const elements = root.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder]');
  elements.forEach((el) => {
    Object.entries(el.dataset).forEach(([dataKey, value]) => {
      if (dataKey === 'i18n') {
        el.textContent = t(value);
      } else if (dataKey.startsWith('i18n')) {
        const attr = dataKey.slice(4).toLowerCase();
        el.setAttribute(attr, t(value));
      }
    });
  });
}

export async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  state.currentLang = lang;
  if (!state.resources[lang]) await loadResources(lang);
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
  if (typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent?.(new CustomEvent('qoj:languagechange', { detail: { lang } }));
  }
}

export function getLanguage() {
  return state.currentLang;
}

