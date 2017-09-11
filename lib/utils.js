'use strict';
module.exports.copyWithout = function copyWithout(from, to, excluded) {
  for (let current in from) {
    if (excluded.indexOf(current) == -1) {
      to[current] = from[current];
    }
  }
};

module.exports.replaceTemplates = function replaceTemplates(
    str, replacements = {}) {
  return str.replace(/{(\w+)}/g, (match, p1) => {
    if (!(p1 in replacements)) {
      throw new TypeError(`Not found a replacement for ${p1} in "${str}"`);
    }

    return replacements[p1];
  });
};
