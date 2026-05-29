(function (global) {
  'use strict';

  var FlowEdgeCodec = global.FlowEdgeCodec;
  var StaticFlowchartGenerator = global.StaticFlowchartGenerator;

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

    // 일반 화살표(-->)만 대시 스타일, 나머지는 파이프 스타일
    if (type === '-->') {
      return '-- ' + text.trim() + ' -->';
    }

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

  function isStaticProfile(model) {
    return !!(model && model.profile === 'static');
  }

  function generateStatementLine(statement, model, usedNodes, usedEdges) {
    if (!statement) return '';
    if (statement.type === 'raw') return statement.raw || '';
    if (statement.type === 'flow') return buildFlowStatementLine(statement, model, usedNodes, usedEdges);
    return '';
  }

  function generateSubgraphs(model, lines, usedNodes, usedEdges) {
    var subgraphs = model.subgraphs || [];
    if (!subgraphs.length) return;
    var statements = model.statements || [];
    var useStaticOutput = isStaticProfile(model);

    var childrenByParent = {};
    var subgraphById = {};
    var orderedSubgraphs = {};
    if (useStaticOutput) {
      for (var c = 0; c < subgraphs.length; c++) {
        var parentId = subgraphs[c].parentId || '';
        if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
        childrenByParent[parentId].push(subgraphs[c]);
        subgraphById[subgraphs[c].id] = subgraphs[c];
      }
      for (var os = 0; os < statements.length; os++) {
        if (statements[os] && statements[os].type === 'subgraph' && statements[os].id) {
          orderedSubgraphs[statements[os].id] = true;
        }
      }
    }

    function writeSubgraph(sg, depth) {
      var indent = new Array(depth + 1).join('    ');
      var childIndent = indent + '    ';
      var header = useStaticOutput && StaticFlowchartGenerator
        ? StaticFlowchartGenerator.generateSubgraphHeader(sg)
        : (sg.title && sg.title !== sg.id ? 'subgraph ' + sg.id + ' [' + sg.title + ']' : 'subgraph ' + sg.id);
      lines.push(indent + header);
      if (useStaticOutput && sg.direction) {
        var sgDir = sg.direction.toUpperCase() === 'TD' ? 'TB' : sg.direction;
        lines.push(childIndent + 'direction ' + sgDir);
      }

      var wroteStatement = false;
      if (useStaticOutput) {
        for (var s = 0; s < statements.length; s++) {
          var statement = statements[s];
          if (!statement) continue;
          if (statement.type === 'subgraph' && statement.parentSubgraphId === sg.id) {
            var childSg = subgraphById[statement.id];
            if (childSg) {
              writeSubgraph(childSg, depth + 1);
              wroteStatement = true;
            }
            continue;
          }
          if (statement.subgraphId !== sg.id) continue;
          var statementLine = generateStatementLine(statement, model, usedNodes, usedEdges);
          if (statementLine) {
            lines.push(childIndent + statementLine);
            wroteStatement = true;
          }
        }

        var children = childrenByParent[sg.id] || [];
        for (var child = 0; child < children.length; child++) {
          if (orderedSubgraphs[children[child].id]) continue;
          writeSubgraph(children[child], depth + 1);
          wroteStatement = true;
        }
      }

      if (!wroteStatement) {
        for (var j = 0; j < sg.nodeIds.length; j++) {
          var nid = sg.nodeIds[j];
          var node = findNode(model.nodes, nid);
          if (node) {
            lines.push(childIndent + generateNode(node));
            usedNodes[nid] = true;
          }
        }
      }
      lines.push(indent + 'end');
    }

    if (useStaticOutput) {
      var roots = childrenByParent[''] || [];
      var emittedRoots = {};
      for (var rs = 0; rs < statements.length; rs++) {
        if (!statements[rs] || statements[rs].type !== 'subgraph' || statements[rs].parentSubgraphId) continue;
        var rootSg = subgraphById[statements[rs].id];
        if (!rootSg || emittedRoots[rootSg.id]) continue;
        writeSubgraph(rootSg, 1);
        emittedRoots[rootSg.id] = true;
      }
      for (var root = 0; root < roots.length; root++) {
        if (emittedRoots[roots[root].id]) continue;
        writeSubgraph(roots[root], 1);
      }
      return;
    }

    for (var i = 0; i < subgraphs.length; i++) {
      var sg = subgraphs[i];
      var header = useStaticOutput && StaticFlowchartGenerator
        ? StaticFlowchartGenerator.generateSubgraphHeader(sg)
        : (sg.title && sg.title !== sg.id ? 'subgraph ' + sg.id + ' [' + sg.title + ']' : 'subgraph ' + sg.id);
      lines.push('    ' + header);
      if (useStaticOutput && sg.direction) {
        var sgDir = sg.direction.toUpperCase() === 'TD' ? 'TB' : sg.direction;
        lines.push('        direction ' + sgDir);
      }

      var wroteStatement = false;
      if (useStaticOutput) {
        for (var s = 0; s < statements.length; s++) {
          if (statements[s].subgraphId !== sg.id) continue;
          var statementLine = generateStatementLine(statements[s], model, usedNodes, usedEdges);
          if (statementLine) {
            lines.push('        ' + statementLine);
            wroteStatement = true;
          }
        }
      }

      if (!wroteStatement) {
        for (var j = 0; j < sg.nodeIds.length; j++) {
          var nid = sg.nodeIds[j];
          var node = findNode(model.nodes, nid);
          if (node) {
            lines.push('        ' + generateNode(node));
            usedNodes[nid] = true;
          }
        }
      }
      lines.push('    end');
    }
  }

  function buildNodeStyleLine(node, useStaticOutput) {
    if (!node) return '';
    if (useStaticOutput && StaticFlowchartGenerator && node.style) {
      return StaticFlowchartGenerator.generateStyleLine(node.id, node.style, { fill: node.fill });
    }

    var fill = normalizeHex(node.fill);
    if (!fill) return '';
    return '    style ' + node.id +
      ' fill:' + fill +
      ',stroke:' + darkenHex(fill, 0.22) +
      ',color:' + contrastText(fill);
  }

  function appendFlowStyles(model, lines) {
    var useStaticOutput = isStaticProfile(model);
    var subgraphs = model.subgraphs || [];
    if (model.nodes && model.nodes.length > 0) {
      for (var n = 0; n < model.nodes.length; n++) {
        var nodeStyleLine = buildNodeStyleLine(model.nodes[n], useStaticOutput);
        if (nodeStyleLine) lines.push(nodeStyleLine);
      }
    }

    if (useStaticOutput && StaticFlowchartGenerator) {
      for (var sg = 0; sg < subgraphs.length; sg++) {
        var sgStyleLine = StaticFlowchartGenerator.generateStyleLine(subgraphs[sg].id, subgraphs[sg].style, {});
        if (sgStyleLine) lines.push(sgStyleLine);
      }
    }

    var extraStyles = model.styles || [];
    if (useStaticOutput && StaticFlowchartGenerator) {
      for (var es = 0; es < extraStyles.length; es++) {
        var extraStyleLine = StaticFlowchartGenerator.generateStyleLine(extraStyles[es].target, extraStyles[es], {});
        if (extraStyleLine) lines.push(extraStyleLine);
      }
    }
  }

  function appendLinkStyles(model, lines) {
    if (model.edges && model.edges.length > 0) {
      for (var e = 0; e < model.edges.length; e++) {
        var linkStyle = buildLinkStyle(e, model.edges[e]);
        if (linkStyle) lines.push(linkStyle);
      }
    }
  }

  function generateMermaid(model) {
    if (!model) return '';
    if (model.type === 'sequenceDiagram' && global.SequenceGenerator) {
      return global.SequenceGenerator.generate(model);
    }

    var lines = [];
    if (isStaticProfile(model) && StaticFlowchartGenerator) {
      lines = lines.concat(StaticFlowchartGenerator.generateDirectives(model));
      lines.push(StaticFlowchartGenerator.generateHeader(model));
    } else {
      var direction = model.direction || 'TD';
      lines.push('flowchart ' + direction);
    }

    var usedNodes = {};
    var usedEdges = {};
    var subgraphs = model.subgraphs || [];

    // subgraph 블록을 먼저 출력하고, 소속 노드를 usedNodes에 기록한다.
    if (subgraphs.length) {
      generateSubgraphs(model, lines, usedNodes, usedEdges);
    }

    var statements = model.statements || [];
    if (statements.length) {
      for (var s = 0; s < statements.length; s++) {
        var statement = statements[s];
        if (isStaticProfile(model) && statement.subgraphId) continue;
        var line = generateStatementLine(statement, model, usedNodes, usedEdges);
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

      appendFlowStyles(model, lines);
      appendLinkStyles(model, lines);

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

    appendFlowStyles(model, lines);
    appendLinkStyles(model, lines);

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
