const SUPPORTED_LANGS = ['en', 'uk'];
const DEFAULT_LANG = 'en';

let currentLang = DEFAULT_LANG;
const resources = {};

async function loadResources(lang) {
  if (resources[lang]) return resources[lang];
  const res = await fetch(`i18n/${lang}.json`);
  if (!res.ok) throw new Error(`Failed to load i18n resources for ${lang}`);
  resources[lang] = await res.json();
  return resources[lang];
}

export async function initI18n() {
  let lang = localStorage.getItem('lang') || navigator.language?.split('-')[0];
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  currentLang = lang;
  await loadResources('en');
  if (lang !== 'en') {
    try {
      await loadResources(lang);
    } catch (e) {
      console.warn(`i18n: falling back to English for ${lang}`, e);
      currentLang = DEFAULT_LANG;
    }
  }
  document.documentElement.lang = currentLang;
}

export function t(key) {
  return (
    (resources[currentLang] && resources[currentLang][key]) ||
    (resources['en'] && resources['en'][key]) ||
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
  currentLang = lang;
  if (!resources[lang]) await loadResources(lang);
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
}

export function getLanguage() {
  return currentLang;
}

