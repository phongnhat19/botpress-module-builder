"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.configure = configure;
exports.log = log;
exports.debug = debug;
exports.error = error;
exports.normal = normal;

var _chalk = _interopRequireDefault(require("chalk"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let level = false;

function configure(verboseLevel) {
  level = verboseLevel;
}

function log(color, message, source) {
  console.log(_chalk.default[color](`[${source || 'module-builder'}] ` + message));
}

function debug(message, source) {
  if (!level) {
    return;
  }

  log('cyan', message, source);
}

function error(message, source) {
  log('red', message, source);
}

function normal(message, source) {
  log('grey', message, source);
}