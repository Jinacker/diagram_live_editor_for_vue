(function (global) {
  'use strict';

  var FlowEdgeCodec = global.FlowEdgeCodec;

  var SHAPE_MAP = [
    { open: '((', close: '))', shape: 'double_circle' },
    { open: '([', close: '])', shape: 'stadium' },
    { open: '[[', close: ']]', shape: 'subroutine' },
    { open: '[(', close: ')]', shape: 'cylinder' },
    { open: '{{', close: '}}', shape: 'hexagon' },
    { open: '{', close: '}', shape: 'rhombus' },
    { open: '[/', close: '/]', shape: 'parallelogram' },
    { open: '[\\', close: '\\]', shape: 'parallelogram_alt' },
    { open: '[/', close: '\\]', shape: 'trapezoid' },
    { open: '[\\', close: '/]', shape: 'trapezoid_alt' },
    { open: '>', close: ']', shape: 'asymmetric' },
    { open: '(', close: ')', shape: 'round' },
    { open: '[', close: ']', shape: 'rect' }
  ];

  var LEGACY_EDGE_PATTERNS = [
    { regex: /^==\s+(.+?)\s*==>/, type: '==>' },
    { regex: /^--\s+(.+?)\s*-->/, type: '-->' },
    { regex: /^--\s+(.+?)\s*-\.->/, type: '-.->' },
    { regex: /^--\s+(.+?)\s*---/, type: '---' },
    { regex: /^--\s+(.+?)\s*-\.-/, type: '-.-' },
    { regex: /^==\s+(.+?)\s*===/, type: '===' }
  ];

  function getShapeCandidates(rest) {
    var candidates = [];
    for (var i = 0; i < SHAPE_MAP.length; i++) {
      if (rest.indexOf(SHAPE_MAP[i].open) === 0) {
        candidates.push({ def: SHAPE_MAP[i], order: i });
      }
    }

    candidates.sort(function (a, b) {
      var openDiff = b.def.open.length - a.def.open.length;
      if (openDiff) return openDiff;
      var closeDiff = b.def.close.length - a.def.close.length;
      if (closeDiff) return closeDiff;
      return a.order - b.order;
    });

    return candidates;
  }

  function getEdgeCandidates(rest) {
    var candidates = [];
    var operatorCandidates = (FlowEdgeCodec && FlowEdgeCodec.OPERATOR_CANDIDATES) || [];
    for (var i = 0; i < operatorCandidates.length; i++) {
      if (rest.indexOf(operatorCandidates[i]) === 0) {
        candidates.push(operatorCandidates[i]);
      }
    }
    candidates.sort(function (a, b) { return b.length - a.length; });
    return candidates;
  }

  function isEscapedChar(text, index) {
    var slashCount = 0;
    for (var i = index - 1; i >= 0 && text.charAt(i) === '\\'; i--) {
      slashCount++;
    }
    return (slashCount % 2) === 1;
  }

  function findQuotedClose(rest, openLen, closeToken) {
    for (var i = openLen + 1; i < rest.length; i++) {
      if (rest.charAt(i) !== '"' || isEscapedChar(rest, i)) continue;
      if (rest.substr(i + 1, closeToken.length) === closeToken) {
        return i;
      }
    }
    return -1;
  }

  function findPipeClose(rest, startIndex) {
    for (var i = startIndex; i < rest.length; i++) {
      if (rest.charAt(i) === '|' && !isEscapedChar(rest, i)) {
        return i;
      }
    }
    return -1;
  }

  function decodeEscapedText(text) {
    var out = '';
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

  function parseNodeDef(str) {
    str = str.trim();
    if (!str) return null;

    var idMatch = str.match(/^([a-zA-Z_\u3131-\uD79D][a-zA-Z0-9_\u3131-\uD79D]*)/);
    if (!idMatch) return null;

    var id = idMatch[1];
    var rest = str.substring(id.length);

    if (!rest || /^[\s;]/.test(rest) || /^[-=.]/.test(rest) || rest.charAt(0) === '&') {
      return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
    }

    // Overlapping bracket syntaxes like {{ }} and { } are resolved by
    // checking only matching candidates and preferring the longer tokens first.
    var candidates = getShapeCandidates(rest);
    for (var i = 0; i < candidates.length; i++) {
      var shapeDef = candidates[i].def;
      var openLen = shapeDef.open.length;
      var innerStart = rest.substring(openLen);
      var text;
      var totalLen;
      var closeIdx;

      if (innerStart.charAt(0) === '"') {
        var quoteIdx = findQuotedClose(rest, openLen, shapeDef.close);
        if (quoteIdx !== -1) {
          text = decodeEscapedText(rest.substring(openLen + 1, quoteIdx));
          totalLen = id.length + quoteIdx + 1 + shapeDef.close.length;
          return {
            id: id,
            text: text || id,
            shape: shapeDef.shape,
            endIndex: totalLen,
            raw: str.substring(0, totalLen)
          };
        }
      }

      closeIdx = rest.indexOf(shapeDef.close, openLen);
      if (closeIdx !== -1) {
        text = rest.substring(openLen, closeIdx).trim();
        totalLen = id.length + closeIdx + shapeDef.close.length;
        return {
          id: id,
          text: text || id,
          shape: shapeDef.shape,
          endIndex: totalLen,
          raw: str.substring(0, totalLen)
        };
      }
    }

    return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
  }

  function parsePipeLabelEdge(str) {
    var candidates = getEdgeCandidates(str);
    for (var i = 0; i < candidates.length; i++) {
      var operator = candidates[i];
      var remainder = str.substring(operator.length);
      var leadMatch = remainder.match(/^\s*\|/);
      if (!leadMatch) continue;
      var labelStart = operator.length + leadMatch[0].length;
      var pipeEnd = findPipeClose(str, labelStart);
      if (pipeEnd === -1) continue;
      return {
        type: operator,
        label: decodeEscapedText(str.substring(labelStart, pipeEnd)).trim(),
        endIndex: pipeEnd + 1
      };
    }
    return null;
  }

  function parseLegacyLabelEdge(str) {
    for (var i = 0; i < LEGACY_EDGE_PATTERNS.length; i++) {
      var match = str.match(LEGACY_EDGE_PATTERNS[i].regex);
      if (!match) continue;
      return {
        type: LEGACY_EDGE_PATTERNS[i].type,
        label: match[1].trim(),
        endIndex: match[0].length
      };
    }
    return null;
  }

  function parsePlainEdge(str) {
    var candidates = getEdgeCandidates(str);
    if (!candidates.length) return null;
    return {
      type: candidates[0],
      label: '',
      endIndex: candidates[0].length
    };
  }

  function parseEdge(str) {
    str = str.trim();
    return parsePipeLabelEdge(str) || parseLegacyLabelEdge(str) || parsePlainEdge(str);
  }

  function parseStyleLine(line, model) {
    var match = line.match(/^style\s+([A-Za-z_\u3131-\uD79D][A-Za-z0-9_\u3131-\uD79D]*)\s+(.+)$/);
    if (!match || !model._nodeMap[match[1]]) return;
    var node = model._nodeMap[match[1]];
    var declarations = match[2].split(',');
    for (var i = 0; i < declarations.length; i++) {
      var parts = declarations[i].split(':');
      if (parts.length < 2) continue;
      var key = parts[0].trim();
      var value = parts.slice(1).join(':').trim();
      if (key === 'fill') node.fill = value;
    }
  }

  function parseLinkStyleLine(line, model) {
    var match = line.match(/^linkStyle\s+(\d+)\s+(.+)$/);
    if (!match) return;
    var edge = model.edges[parseInt(match[1], 10)];
    if (!edge) return;
    var declarations = match[2].split(',');
    for (var i = 0; i < declarations.length; i++) {
      var parts = declarations[i].split(':');
      if (parts.length < 2) continue;
      var key = parts[0].trim();
      var value = parts.slice(1).join(':').trim();
      if (key === 'stroke') edge.color = value;
    }
  }

  function parseFlowLine(line, model) {
    line = line.trim();
    if (!line) return;

    var remaining = line;
    var prevNodeId = null;

    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (!remaining) break;

      var node = parseNodeDef(remaining);
      if (!node) break;

      var restAfterNode = remaining.substring(node.endIndex).trim();
      // Mermaid allows a left-side x/o head to sit right next to the source node.
      if ((node.id.slice(-1) === 'x' || node.id.slice(-1) === 'o') && restAfterNode) {
        var trailingHead = node.id.slice(-1);
        var rescuedEdge = parseEdge(trailingHead + restAfterNode);
        if (rescuedEdge && node.id.length > 1) {
          if (node.text === node.id) node.text = node.id.slice(0, -1);
          node.id = node.id.slice(0, -1);
          restAfterNode = trailingHead + restAfterNode;
        }
      }

      if (!model._nodeMap[node.id]) {
        var nodeObj = { id: node.id, text: node.text, shape: node.shape };
        model.nodes.push(nodeObj);
        model._nodeMap[node.id] = nodeObj;
      } else if (node.text !== node.id || node.shape !== 'rect') {
        model._nodeMap[node.id].text = node.text;
        model._nodeMap[node.id].shape = node.shape;
      }

      remaining = restAfterNode;

      if (prevNodeId !== null && model._pendingEdge) {
        model.edges.push({
          from: prevNodeId,
          to: node.id,
          text: model._pendingEdge.label,
          type: model._pendingEdge.type
        });
        model._pendingEdge = null;
      }

      var edge = parseEdge(remaining);
      if (edge) {
        model._pendingEdge = edge;
        prevNodeId = node.id;
        remaining = remaining.substring(edge.endIndex).trim();
      } else {
        prevNodeId = null;
        model._pendingEdge = null;
        break;
      }
    }
  }

  function parseMermaid(script) {
    if (!script || typeof script !== 'string') {
      return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
    }

    var trimmed = script.trim();
    if (/^sequenceDiagram\b/i.test(trimmed) && global.SequenceParser) {
      return global.SequenceParser.parse(script);
    }

    var lines = script.split('\n');
    var model = {
      type: 'flowchart',
      direction: 'TD',
      nodes: [],
      edges: [],
      _nodeMap: {},
      _pendingEdge: null
    };
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      if (!line || line.indexOf('%%') === 0) continue;
      if (line.indexOf('classDef') === 0 || line.indexOf('class ') === 0) continue;

      if (line.indexOf('style ') === 0) {
        parseStyleLine(line, model);
        continue;
      }

      if (line.indexOf('linkStyle ') === 0) {
        parseLinkStyleLine(line, model);
        continue;
      }

      if (!started) {
        var headerMatch = line.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
        if (headerMatch) {
          model.direction = headerMatch[1].toUpperCase();
          if (model.direction === 'TB') model.direction = 'TD';
          started = true;
          continue;
        }
        if (/^(?:graph|flowchart)\s*$/.test(line)) {
          started = true;
          continue;
        }
      }

      if (!started) continue;
      if (line.indexOf('subgraph') === 0 || line === 'end') continue;

      parseFlowLine(line, model);
    }

    delete model._nodeMap;
    delete model._pendingEdge;

    return model;
  }

  global.MermaidParser = {
    parse: parseMermaid
  };
})(typeof window !== 'undefined' ? window : this);
