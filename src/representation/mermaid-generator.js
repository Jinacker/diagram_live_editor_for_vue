(function (global) {
  'use strict';

  var FlowEdgeCodec = global.FlowEdgeCodec;

  var SHAPE_BRACKETS = {
    rect: ['[', ']'],
    round: ['(', ')'],
    stadium: ['([', '])'],
    subroutine: ['[[', ']]'],
    cylinder: ['[(', ')]'],
    rhombus: ['{', '}'],
    hexagon: ['{{', '}}'],
    parallelogram: ['[/', '/]'],
    parallelogram_alt: ['[\\', '\\]'],
    trapezoid: ['[/', '\\]'],
    trapezoid_alt: ['[\\', '/]'],
    double_circle: ['((', '))'],
    asymmetric: ['>', ']']
  };

  function escapeLabel(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function escapeEdgeLabel(text) {
    return String(text)
      .replace(/\|/g, '\\|')
      .trim();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHex(color) {
    if (!color) return '';
    var trimmed = String(color).trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return '';
    if (trimmed.length === 4) {
      return '#' + trimmed.charAt(1) + trimmed.charAt(1) +
        trimmed.charAt(2) + trimmed.charAt(2) +
        trimmed.charAt(3) + trimmed.charAt(3);
    }
    return trimmed.toLowerCase();
  }

  function darkenHex(color, amount) {
    var hex = normalizeHex(color);
    if (!hex) return '';
    var ratio = clamp(amount, 0, 1);
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    r = Math.round(r * (1 - ratio));
    g = Math.round(g * (1 - ratio));
    b = Math.round(b * (1 - ratio));
    return '#' + [r, g, b].map(function (v) {
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function contrastText(color) {
    var hex = normalizeHex(color);
    if (!hex) return '';
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68 ? '#1b2a4a' : '#ffffff';
  }

  function generateNode(node) {
    var brackets = SHAPE_BRACKETS[node.shape] || SHAPE_BRACKETS.rect;
    var text = node.text || node.id;

    if (text === node.id && node.shape === 'rect') {
      return node.id;
    }

    return node.id + brackets[0] + '"' + escapeLabel(text) + '"' + brackets[1];
  }

  function generateEdgeOperator(edge) {
    var type = edge.type || '-->';
    var text = edge.text || '';

    if (!text || !text.trim()) return type;

    // Flowchart edge labels are serialized as operator|label| so the
    // parser can keep the operator itself in edge.type.
    return type + '|' + escapeEdgeLabel(text) + '|';
  }

  function buildLinkStyle(index, edge) {
    var edgeColor = normalizeHex(edge && edge.color);
    if (!edgeColor) return '';

    var body = FlowEdgeCodec ? FlowEdgeCodec.getBodyType(edge.type || '-->') : 'solid';
    var parts = [
      'stroke:' + edgeColor,
      'color:' + edgeColor
    ];

    if (body === 'thick') {
      parts.push('stroke-width:4px');
    } else if (body === 'dotted') {
      parts.push('stroke-width:2px');
      parts.push('stroke-dasharray:3\\,3');
    } else {
      parts.push('stroke-width:2px');
    }

    return '    linkStyle ' + index + ' ' + parts.join(',');
  }

  function findEdgeByRef(edges, ref) {
    if (!ref || !edges) return { edge: null, index: -1 };
    var occurrence = 0;
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if (!edge || edge.from !== ref.from || edge.to !== ref.to) continue;
      occurrence++;
      if (occurrence === ref.occurrence) {
        return { edge: edge, index: i };
      }
    }
    return { edge: null, index: -1 };
  }

  function buildFlowStatementLine(statement, model, usedNodes, usedEdges) {
    if (!statement || statement.type !== 'flow') return '';
    var nodeIds = statement.nodeIds || [];
    var edgeRefs = statement.edgeRefs || [];
    if (!nodeIds.length) return '';

    var firstNode = findNode(model.nodes, nodeIds[0]);
    if (!firstNode) return '';
    // 이미 앞에서 정의된 노드는 ID만 사용 — 중복 정의 방지
    var firstStr = usedNodes[firstNode.id] ? firstNode.id : generateNode(firstNode);
    usedNodes[firstNode.id] = true;
    var parts = [firstStr];

    for (var i = 0; i < edgeRefs.length; i++) {
      var edgeMatch = findEdgeByRef(model.edges, edgeRefs[i]);
      var edge = edgeMatch.edge;
      var nextNode = findNode(model.nodes, nodeIds[i + 1]);
      if (!edge || !nextNode) return '';
      if (edgeMatch.index >= 0) usedEdges[edgeMatch.index] = true;
      var nextStr = usedNodes[nextNode.id] ? nextNode.id : generateNode(nextNode);
      usedNodes[nextNode.id] = true;
      parts.push(generateEdgeOperator(edge));
      parts.push(nextStr);
    }

    return parts.join(' ');
  }

  function buildSubgraphNodeMap(subgraphs) {
    var map = {};
    if (!subgraphs) return map;
    for (var i = 0; i < subgraphs.length; i++) {
      var sg = subgraphs[i];
      for (var j = 0; j < sg.nodeIds.length; j++) {
        map[sg.nodeIds[j]] = sg.id;
      }
    }
    return map;
  }

  function generateSubgraphs(model, lines, usedNodes) {
    var subgraphs = model.subgraphs || [];
    if (!subgraphs.length) return;
    for (var i = 0; i < subgraphs.length; i++) {
      var sg = subgraphs[i];
      var header = sg.title && sg.title !== sg.id
        ? 'subgraph ' + sg.id + ' [' + sg.title + ']'
        : 'subgraph ' + sg.id;
      lines.push('    ' + header);
      for (var j = 0; j < sg.nodeIds.length; j++) {
        var nid = sg.nodeIds[j];
        var node = findNode(model.nodes, nid);
        if (node) {
          lines.push('        ' + generateNode(node));
          usedNodes[nid] = true;
        }
      }
      lines.push('    end');
    }
  }

  function generateMermaid(model) {
    if (!model) return '';
    if (model.type === 'sequenceDiagram' && global.SequenceGenerator) {
      return global.SequenceGenerator.generate(model);
    }

    var lines = [];
    var direction = model.direction || 'TD';
    lines.push('flowchart ' + direction);

    var usedNodes = {};
    var usedEdges = {};
    var subgraphs = model.subgraphs || [];

    // subgraph 블록을 먼저 출력하고, 소속 노드를 usedNodes에 기록한다.
    if (subgraphs.length) {
      generateSubgraphs(model, lines, usedNodes);
    }

    var statements = model.statements || [];
    if (statements.length) {
      for (var s = 0; s < statements.length; s++) {
        var statement = statements[s];
        var line = '';
        if (statement.type === 'raw') {
          line = statement.raw || '';
        } else if (statement.type === 'flow') {
          line = buildFlowStatementLine(statement, model, usedNodes, usedEdges);
        }
        if (line) lines.push('    ' + line);
      }

      if (model.nodes && model.nodes.length > 0) {
        for (var rn = 0; rn < model.nodes.length; rn++) {
          if (usedNodes[model.nodes[rn].id]) continue;
          lines.push('    ' + generateNode(model.nodes[rn]));
        }
      }

      if (model.edges && model.edges.length > 0) {
        for (var re = 0; re < model.edges.length; re++) {
          if (usedEdges[re]) continue;
          var remainingEdge = FlowEdgeCodec
            ? FlowEdgeCodec.normalizeEdgeForOutput(model.edges[re])
            : model.edges[re];
          lines.push('    ' + remainingEdge.from + ' ' + generateEdgeOperator(remainingEdge) + ' ' + remainingEdge.to);
        }
      }

      if (model.nodes && model.nodes.length > 0) {
        for (var sn = 0; sn < model.nodes.length; sn++) {
          var styleNode = model.nodes[sn];
          var styleFill = normalizeHex(styleNode.fill);
          if (!styleFill) continue;
          lines.push(
            '    style ' + styleNode.id +
            ' fill:' + styleFill +
            ',stroke:' + darkenHex(styleFill, 0.22) +
            ',color:' + contrastText(styleFill)
          );
        }
      }

      if (model.edges && model.edges.length > 0) {
        for (var se = 0; se < model.edges.length; se++) {
          var styleLine = buildLinkStyle(se, model.edges[se]);
          if (styleLine) lines.push(styleLine);
        }
      }

      return lines.join('\n');
    }

    if (model.nodes && model.nodes.length > 0) {
      for (var i = 0; i < model.nodes.length; i++) {
        if (usedNodes[model.nodes[i].id]) continue;
        lines.push('    ' + generateNode(model.nodes[i]));
      }
    }

    if (model.edges && model.edges.length > 0) {
      for (var j = 0; j < model.edges.length; j++) {
        var edge = FlowEdgeCodec
          ? FlowEdgeCodec.normalizeEdgeForOutput(model.edges[j])
          : model.edges[j];
        lines.push('    ' + edge.from + ' ' + generateEdgeOperator(edge) + ' ' + edge.to);
      }
    }

    if (model.nodes && model.nodes.length > 0) {
      for (var n = 0; n < model.nodes.length; n++) {
        var node = model.nodes[n];
        var fill = normalizeHex(node.fill);
        if (!fill) continue;
        lines.push(
          '    style ' + node.id +
          ' fill:' + fill +
          ',stroke:' + darkenHex(fill, 0.22) +
          ',color:' + contrastText(fill)
        );
      }
    }

    if (model.edges && model.edges.length > 0) {
      for (var e = 0; e < model.edges.length; e++) {
        var linkStyle = buildLinkStyle(e, model.edges[e]);
        if (linkStyle) lines.push(linkStyle);
      }
    }

    return lines.join('\n');
  }

  function findNode(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  global.MermaidGenerator = {
    generate: generateMermaid,
    generateNode: generateNode,
    findNode: findNode
  };
})(typeof window !== 'undefined' ? window : this);
