(function (global) {
  'use strict';

  var IDENT_SOURCE = '[A-Za-z_\\u3131-\\uD79D][A-Za-z0-9_\\u3131-\\uD79D]*';
  var IDENT_RE = new RegExp('^(' + IDENT_SOURCE + ')$');

  function markStatic(model, reason) {
    if (!model) return;
    model.profile = 'static';
    if (!model.staticReasons) model.staticReasons = [];
    if (reason && model.staticReasons.indexOf(reason) === -1) {
      model.staticReasons.push(reason);
    }
  }

  function decodeEscapedText(text) {
    var out = '';
    text = String(text || '');
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\\' && i + 1 < text.length) {
        out += text.charAt(i + 1);
        i++;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function isEscaped(text, index) {
    var slashCount = 0;
    for (var i = index - 1; i >= 0 && text.charAt(i) === '\\'; i--) {
      slashCount++;
    }
    return (slashCount % 2) === 1;
  }

  function splitStyleDeclarations(raw) {
    raw = String(raw || '');
    var parts = [];
    var start = 0;
    for (var i = 0; i < raw.length; i++) {
      if (raw.charAt(i) === ',' && !isEscaped(raw, i)) {
        parts.push(raw.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(raw.slice(start));
    return parts;
  }

  function parseStyleDeclarations(raw) {
    var chunks = splitStyleDeclarations(raw);
    var declarations = [];
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i].trim();
      if (!chunk) continue;
      var colonIndex = chunk.indexOf(':');
      if (colonIndex === -1) continue;
      declarations.push({
        key: chunk.slice(0, colonIndex).trim(),
        value: chunk.slice(colonIndex + 1).trim()
      });
    }
    return declarations;
  }

  function parseDirectiveLine(line) {
    var trimmed = String(line || '').trim();
    return /^%%\{[\s\S]*\}%%$/.test(trimmed) ? trimmed : null;
  }

  function parseHeaderLine(line) {
    var match = String(line || '').trim().match(/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i);
    if (!match) return null;
    return {
      keyword: match[1].toLowerCase(),
      direction: match[2].toUpperCase()
    };
  }

  function parseSubgraphOpen(rest, index) {
    rest = String(rest || '').trim();
    var idTitleQuoted = new RegExp(
      '^(' + IDENT_SOURCE + ')\\s*\\[\\s*"((?:\\\\.|[^"])*)"\\s*\\]$'
    ).exec(rest);
    if (idTitleQuoted) {
      return {
        id: idTitleQuoted[1],
        title: decodeEscapedText(idTitleQuoted[2]).trim() || idTitleQuoted[1],
        nodeIds: [],
        titleBracketStyle: 'quoted'
      };
    }

    var idTitleBracket = new RegExp(
      '^(' + IDENT_SOURCE + ')\\s+\\[(.+)\\]$'
    ).exec(rest);
    if (idTitleBracket) {
      return {
        id: idTitleBracket[1],
        title: idTitleBracket[2].trim() || idTitleBracket[1],
        nodeIds: [],
        titleBracketStyle: 'bracket'
      };
    }

    if (IDENT_RE.test(rest)) {
      return {
        id: rest,
        title: rest,
        nodeIds: [],
        titleBracketStyle: ''
      };
    }

    var fallbackId = 'SG_' + index;
    return {
      id: fallbackId,
      title: rest || fallbackId,
      nodeIds: [],
      titleBracketStyle: rest ? 'title-only' : ''
    };
  }

  function parseSubgraphDirection(line) {
    var match = String(line || '').trim().match(/^direction\s+(TD|TB|BT|LR|RL)$/i);
    return match ? match[1].toUpperCase() : '';
  }

  function parseStyleLine(line) {
    var match = String(line || '').trim().match(new RegExp(
      '^style\\s+(' + IDENT_SOURCE + ')\\s+(.+)$'
    ));
    if (!match) return null;
    return {
      target: match[1],
      declarations: parseStyleDeclarations(match[2]),
      raw: match[2].trim()
    };
  }

  function applyStyleDeclarations(target, style) {
    if (!target || !style || !style.declarations) return;
    for (var i = 0; i < style.declarations.length; i++) {
      var declaration = style.declarations[i];
      var key = String(declaration.key || '').toLowerCase();
      if (key === 'fill') target.fill = declaration.value;
      if (key === 'stroke') target.stroke = declaration.value;
      if (key === 'color') target.color = declaration.value;
    }
  }

  function attachStyleToTarget(model, style, options) {
    if (!model || !style || !style.target) return false;
    options = options || {};
    var node = model._nodeMap && model._nodeMap[style.target];
    if (node) {
      node.style = style;
      applyStyleDeclarations(node, style);
      return true;
    }

    var subgraph = model._subgraphMap && model._subgraphMap[style.target];
    if (subgraph) {
      subgraph.style = style;
      applyStyleDeclarations(subgraph, style);
      if (options.staticProfile) markStatic(model, 'subgraph-style');
      return true;
    }

    if (!model.styles) model.styles = [];
    model.styles.push(style);
    return false;
  }

  global.StaticFlowchartParser = {
    markStatic: markStatic,
    parseDirectiveLine: parseDirectiveLine,
    parseHeaderLine: parseHeaderLine,
    parseSubgraphOpen: parseSubgraphOpen,
    parseSubgraphDirection: parseSubgraphDirection,
    parseStyleLine: parseStyleLine,
    attachStyleToTarget: attachStyleToTarget
  };
})(typeof window !== 'undefined' ? window : this);
