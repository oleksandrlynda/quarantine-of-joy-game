export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        THREE: "readonly"
      }
    },
    rules: {}
  }
];
