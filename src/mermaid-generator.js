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

  function generateMermaid(model) {
    if (!model) return '';
    if (model.type === 'sequenceDiagram' && global.SequenceGenerator) {
      return global.SequenceGenerator.generate(model);
    }

    var lines = [];
    var direction = model.direction || 'TD';
    lines.push('flowchart ' + direction);

    if (model.nodes && model.nodes.length > 0) {
      for (var i = 0; i < model.nodes.length; i++) {
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
