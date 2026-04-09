/**
 * Mermaid 플로우차트 생성기
 * 내부 모델을 다시 Mermaid 스크립트 문자열로 직렬화한다.
 */

(function (global) {
  'use strict';

  // shape -> bracket 매핑
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
    asymmetric: ['>', ']'],
  };

  function escapeLabel(text) {
    // generator는 항상 quoted label을 쓰므로, 최소 escape만 여기서 처리한다.
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
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

  /**
   * 노드 정의 문자열 생성
   */
  function generateNode(node) {
    var brackets = SHAPE_BRACKETS[node.shape] || SHAPE_BRACKETS.rect;
    var text = node.text || node.id;
    // 텍스트가 id와 같고 기본 사각형이면 bare id만 출력한다.
    if (text === node.id && node.shape === 'rect') {
      return node.id;
    }
    // bare id가 아닌 노드는 항상 quote해서
    // 특수문자/공백/대괄호가 있어도 다시 parser가 안전하게 읽을 수 있게 한다.
    return node.id + brackets[0] + '"' + escapeLabel(text) + '"' + brackets[1];
  }

  /**
   * 내부 모델에서 전체 Mermaid 스크립트 생성
   * 형식:
   *   flowchart TD
   *   A["label"]          ← 노드 정의 먼저
   *   B["label"]
   *   A --> B             ← 그 다음 엣지
   *   C -- text --> D     ← 레이블 엣지는 "-- text -->" 형식 사용
   */
  function generateMermaid(model) {
    if (!model) return '';
    if (model.type === 'sequenceDiagram' && global.SequenceGenerator) {
      return global.SequenceGenerator.generate(model);
    }

    var lines = [];
    var direction = model.direction || 'TD';
    lines.push('flowchart ' + direction);

    // 1. 노드 정의를 먼저 모두 출력한다.
    // inline node definition을 edge line에 섞지 않아서 사람이 읽기 쉽고 diff도 안정적이다.
    if (model.nodes && model.nodes.length > 0) {
      for (var i = 0; i < model.nodes.length; i++) {
        lines.push('    ' + generateNode(model.nodes[i]));
      }
    }

    // 2. 엣지는 node id만 사용해서 별도로 출력한다.
    if (model.edges && model.edges.length > 0) {
      for (var j = 0; j < model.edges.length; j++) {
        var edge = model.edges[j];
        var edgeStr;
        if (edge.text) {
          // "-- label -->" 형식
          edgeStr = '-- ' + edge.text.trim() + ' ' + (edge.type || '-->');
        } else {
          edgeStr = edge.type || '-->';
        }
        lines.push('    ' + edge.from + ' ' + edgeStr + ' ' + edge.to);
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
        var edgeColor = normalizeHex(model.edges[e].color);
        if (!edgeColor) continue;
        lines.push(
          '    linkStyle ' + e +
          ' stroke:' + edgeColor +
          ',color:' + edgeColor +
          ',stroke-width:2px'
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * nodes 배열에서 id로 노드 찾기
   */
  function findNode(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  // 전역 노출
  global.MermaidGenerator = {
    generate: generateMermaid,
    generateNode: generateNode
  };

})(typeof window !== 'undefined' ? window : this);
