const formatWithPrettier = 'prettier --write --ignore-unknown --config apps/runtime/.prettierrc';

/** @type {import('lint-staged').Configuration} */
const config = {
  '*.{cjs,css,html,js,json,jsonc,jsx,mjs,scss,ts,tsx,yaml,yml}': formatWithPrettier,
  '.prettierrc': formatWithPrettier,
};

export default config;
