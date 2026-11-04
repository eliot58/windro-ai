// NestJS 12 публикуется только как ESM (с import.meta и динамическими import()).
// Jest 29 работает в CommonJS, поэтому такие пакеты из node_modules
// транспилируем в CJS через swc — он корректно переписывает import.meta.url.
const { transformSync } = require('@swc/core');

module.exports = {
  process(sourceText, sourcePath) {
    const { code, map } = transformSync(sourceText, {
      filename: sourcePath,
      sourceMaps: true,
      module: { type: 'commonjs' },
      jsc: { target: 'es2022', parser: { syntax: 'ecmascript' } },
    });
    return { code, map };
  },
};
