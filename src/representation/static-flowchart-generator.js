(function (global) {
  'use strict';

  function escapeQuoted(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function generateDirectives(model) {
    return model && model.directives ? model.directives.slice() : [];
  }

  function generateHeader(model) {
    var keyword = model && model.headerKeyword ? model.headerKeyword : 'flowchart';
    if (keyword !== 'graph' && keyword !== 'flowchart') keyword = 'flowchart';
    return keyword + ' ' + ((model && model.direction) || 'TD');
  }

  function generateSubgraphHeader(subgraph) {
    if (!subgraph) return 'subgraph';
    var id = subgraph.id;
    var title = subgraph.title || id;
    if (!title || title === id) return 'subgraph ' + id;

    if (subgraph.titleBracketStyle === 'quoted') {
      return 'subgraph ' + id + '["' + escapeQuoted(title) + '"]';
    }

    return 'subgraph ' + id + ' [' + title + ']';
  }

  function cloneDeclarations(style) {
    var out = [];
    var declarations = style && style.declarations ? style.declarations : [];
    for (var i = 0; i < declarations.length; i++) {
      out.push({
        key: declarations[i].key,
        value: declarations[i].value
      });
    }
    return out;
  }

  function upsertDeclaration(declarations, key, value) {
    if (value === undefined || value === null) return;
    var normalized = String(key || '').toLowerCase();
    for (var i = 0; i < declarations.length; i++) {
      if (String(declarations[i].key || '').toLowerCase() === normalized) {
        if (value === '') {
          declarations.splice(i, 1);
        } else {
          declarations[i].value = value;
        }
        return;
      }
    }
    if (value !== '') declarations.push({ key: key, value: value });
  }

  function declarationsToString(declarations) {
    var parts = [];
    for (var i = 0; i < declarations.length; i++) {
      if (!declarations[i].key) continue;
      parts.push(declarations[i].key + ':' + declarations[i].value);
    }
    return parts.join(',');
  }

  function generateStyleLine(target, style, overrides) {
    if (!target) return '';
    var declarations = cloneDeclarations(style);
    overrides = overrides || {};
    for (var key in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        upsertDeclaration(declarations, key, overrides[key]);
      }
    }
    var body = declarationsToString(declarations);
    return body ? '    style ' + target + ' ' + body : '';
  }

  global.StaticFlowchartGenerator = {
    generateDirectives: generateDirectives,
    generateHeader: generateHeader,
    generateSubgraphHeader: generateSubgraphHeader,
    generateStyleLine: generateStyleLine
  };
})(typeof window !== 'undefined' ? window : this);
