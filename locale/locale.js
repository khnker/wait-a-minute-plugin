export function createLocale(defaultLang, dict = {}) {
  let currentLang = defaultLang;
  let translations = dict;

  return {
    t: (key, vars = {}) => {
      let str = translations[currentLang]?.[key] || key;
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v);
      }
      return str;
    },
    setLang: (lang) => { currentLang = lang; }
  };
}
