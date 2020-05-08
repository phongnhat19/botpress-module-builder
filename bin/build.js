"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.buildBackend = buildBackend;
exports.default = void 0;

var babel = _interopRequireWildcard(require("@babel/core"));

var _chalk = _interopRequireDefault(require("chalk"));

var _fs = _interopRequireDefault(require("fs"));

var _fsExtra = _interopRequireDefault(require("fs-extra"));

var _glob = _interopRequireDefault(require("glob"));

var _mkdirp = _interopRequireDefault(require("mkdirp"));

var _os = _interopRequireDefault(require("os"));

var _path = _interopRequireDefault(require("path"));

var _rimraf = _interopRequireDefault(require("rimraf"));

var ts = _interopRequireWildcard(require("typescript"));

var _typescriptJsonSchema = require("typescript-json-schema");

var _log = require("./log");

var _webpack = require("./webpack");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

var _default = async argv => {
  const modulePath = _path.default.resolve(argv.path || process.cwd());

  await buildBackend(modulePath);
  await (0, _webpack.build)(modulePath);
  await buildConfigSchema(modulePath);
  (0, _log.normal)('Build completed');
};

exports.default = _default;

async function buildBackend(modulePath) {
  const start = Date.now();
  let babelConfig = {
    presets: [['@babel/preset-env', {
      targets: {
        node: 'current'
      }
    }], '@babel/preset-typescript', '@babel/preset-react'],
    sourceMaps: true,
    sourceRoot: _path.default.join(modulePath, 'src/backend'),
    parserOpts: {
      allowReturnOutsideFunction: true
    },
    plugins: ['@babel/plugin-proposal-class-properties', '@babel/plugin-proposal-function-bind'],
    sourceType: 'module',
    cwd: _path.default.resolve(__dirname, '..')
  };

  const babelFile = _path.default.join(modulePath, 'babel.backend.js');

  if (_fs.default.existsSync(babelFile)) {
    (0, _log.debug)('Babel override found for backend');
    babelConfig = require(babelFile)(babelConfig);
  }

  const tsConfigFile = ts.findConfigFile(modulePath, ts.sys.fileExists, 'tsconfig.json');
  const skipCheck = process.argv.find(x => x.toLowerCase() === '--skip-check');
  let validCode = true;

  if (!skipCheck && tsConfigFile) {
    validCode = runTypeChecker(modulePath);
  }

  if (validCode) {
    _rimraf.default.sync(_path.default.join(modulePath, 'dist'));

    copyExtraFiles(modulePath);
    compileBackend(modulePath, babelConfig);
    (0, _log.normal)(`Generated backend (${Date.now() - start} ms)`, _path.default.basename(modulePath));
  }
} // Allows to copy additional files to the dist directory of the module


const copyExtraFiles = modulePath => {
  const extrasFile = _path.default.join(modulePath, 'build.extras.js');

  if (!_fs.default.existsSync(extrasFile)) {
    return;
  }

  const extras = require(extrasFile);

  if (extras && extras.copyFiles) {
    for (const instruction of extras.copyFiles) {
      const toCopy = _glob.default.sync(instruction, {
        cwd: modulePath,
        dot: true
      });

      for (const file of toCopy) {
        const fromFull = _path.default.join(modulePath, file);

        const dest = file.replace(/^src\//i, 'dist/').replace(/\.ts$/i, '.js');

        const destFull = _path.default.join(modulePath, dest);

        _mkdirp.default.sync(_path.default.dirname(destFull));

        _fsExtra.default.copySync(fromFull, destFull);

        (0, _log.debug)(`Copied "${file}" -> "${dest}"`);
      }
    }
  }
};

const compileBackend = (modulePath, babelConfig) => {
  const files = _glob.default.sync('src/**/*.+(ts|js|jsx|tsx|json)', {
    cwd: modulePath,
    dot: true,
    ignore: ['**/*.d.ts', '**/views/**/*.*', '**/config.ts']
  });

  const copyWithoutTransform = ['actions', 'hooks', 'examples', 'content-types'];
  const outputFiles = [];

  for (const file of files) {
    const dest = file.replace(/^src\//i, 'dist/').replace(/\.ts$/i, '.js');

    _mkdirp.default.sync(_path.default.dirname(dest));

    if (copyWithoutTransform.find(x => file.startsWith(`src/${x}`)) || file.endsWith('.json')) {
      _fs.default.writeFileSync(dest, _fs.default.readFileSync(`${modulePath}/${file}`, 'utf8'));

      continue;
    }

    try {
      const dBefore = Date.now();
      const result = babel.transformFileSync(file, babelConfig);
      const destMap = dest + '.map';

      _fs.default.writeFileSync(dest, result.code + _os.default.EOL + `//# sourceMappingURL=${_path.default.basename(destMap)}`);

      result.map.sources = [_path.default.relative(babelConfig.sourceRoot, file)];

      _fs.default.writeFileSync(destMap, JSON.stringify(result.map));

      const totalTime = Date.now() - dBefore;
      (0, _log.debug)(`Generated "${dest}" (${totalTime} ms)`);
      outputFiles.push(dest);
    } catch (err) {
      (0, _log.error)(`Error transpiling file "${file}"`); // TODO Better error

      throw err;
    }
  }
};

const buildConfigSchema = async modulePath => {
  const config = _path.default.resolve(modulePath, 'src', 'config.ts');

  if (!_fs.default.existsSync(config)) {
    return;
  }

  const settings = {
    required: true,
    ignoreErrors: true,
    noExtraProps: true,
    validationKeywords: ['see', 'example', 'pattern']
  };
  const program = (0, _typescriptJsonSchema.getProgramFromFiles)([config]);
  const definition = (0, _typescriptJsonSchema.generateSchema)(program, 'Config', settings);

  if (definition && definition.properties) {
    definition.properties.$schema = {
      type: 'string'
    };
  }

  const schema = JSON.stringify(definition, undefined, 2) + _os.default.EOL + _os.default.EOL;

  _mkdirp.default.sync(_path.default.resolve(modulePath, 'assets'));

  _fs.default.writeFileSync(_path.default.resolve(modulePath, 'assets', 'config.schema.json'), schema);
};

const getTsConfig = rootFolder => {
  const parseConfigHost = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    useCaseSensitiveFileNames: true
  };
  const configFileName = ts.findConfigFile(rootFolder, ts.sys.fileExists, 'tsconfig.json');
  const {
    config
  } = ts.readConfigFile(configFileName, ts.sys.readFile); // These 3 objects are identical for all modules, but can't be in tsconfig.shared because the root folder is not processed correctly

  const fixedModuleConfig = { ...config,
    compilerOptions: { ...config.compilerOptions,
      typeRoots: ['./node_modules/@types', './node_modules', './src/typings']
    },
    exclude: ['**/*.test.ts', './src/views/**', '**/node_modules/**'],
    include: ['../../src/typings/*.d.ts', '**/*.ts']
  };
  return ts.parseJsonConfigFileContent(fixedModuleConfig, parseConfigHost, rootFolder);
};

const runTypeChecker = rootFolder => {
  const {
    options,
    fileNames
  } = getTsConfig(rootFolder);
  const program = ts.createProgram(fileNames, options);
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(program.emit().diagnostics);

  for (const {
    file,
    start,
    messageText,
    code
  } of diagnostics) {
    if (file) {
      const {
        line,
        character
      } = file.getLineAndCharacterOfPosition(start);
      const message = ts.flattenDiagnosticMessageText(messageText, '\n');
      (0, _log.error)(_chalk.default.bold(`[ERROR] in ${_chalk.default.cyan(file.fileName)} (${line + 1},${character + 1})
                 TS${code}: ${message}
                 `));
    } else {
      (0, _log.error)(ts.flattenDiagnosticMessageText(messageText, '\n'));
    }
  }

  return !diagnostics.length;
};