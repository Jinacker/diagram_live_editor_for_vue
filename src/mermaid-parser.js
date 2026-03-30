/**
 * Mermaid Flowchart Parser
 * Parses Mermaid flowchart/graph syntax into an internal model.
 */

(function (global) {
  'use strict';

  // Shape definitions: [openBracket, closeBracket, shapeName]
  var SHAPE_MAP = [
    { open: '((', close: '))', shape: 'double_circle' },
    { open: '([', close: '])', shape: 'stadium' },
    { open: '[[', close: ']]', shape: 'subroutine' },
    { open: '[(', close: ')]', shape: 'cylinder' },
    { open: '{', close: '}', shape: 'rhombus' },
    { open: '{{', close: '}}', shape: 'hexagon' },
    { open: '[/', close: '/]', shape: 'parallelogram' },
    { open: '[\\', close: '\\]', shape: 'parallelogram_alt' },
    { open: '[/', close: '\\]', shape: 'trapezoid' },
    { open: '[\\', close: '/]', shape: 'trapezoid_alt' },
    { open: '>', close: ']', shape: 'asymmetric' },
    { open: '(', close: ')', shape: 'round' },
    { open: '[', close: ']', shape: 'rect' },
  ];

  // Edge type definitions
  var EDGE_PATTERNS = [
    { regex: /^==>\|([^|]*)\|/, type: '==>', hasLabel: true },
    { regex: /^==>\s*/, type: '==>', hasLabel: false },
    { regex: /^-->\|([^|]*)\|/, type: '-->', hasLabel: true },
    { regex: /^-->\s*/, type: '-->', hasLabel: false },
    { regex: /^-\.->\|([^|]*)\|/, type: '-.->',  hasLabel: true },
    { regex: /^-\.->\s*/, type: '-.->',  hasLabel: false },
    { regex: /^---\|([^|]*)\|/, type: '---', hasLabel: true },
    { regex: /^---\s*/, type: '---', hasLabel: false },
    { regex: /^-\.-\|([^|]*)\|/, type: '-.-', hasLabel: true },
    { regex: /^-\.-\s*/, type: '-.-', hasLabel: false },
    { regex: /^===\|([^|]*)\|/, type: '===', hasLabel: true },
    { regex: /^===\s*/, type: '===', hasLabel: false },
  ];

  /**
   * Parse a single node definition from a string starting at position.
   * Returns { id, text, shape, endIndex } or null.
   */
  function parseNodeDef(str) {
    str = str.trim();
    if (!str) return null;

    // Extract node ID (alphanumeric + underscore)
    var idMatch = str.match(/^([a-zA-Z_\u3131-\uD79D][a-zA-Z0-9_\u3131-\uD79D]*)/);
    if (!idMatch) return null;

    var id = idMatch[1];
    var rest = str.substring(id.length);

    if (!rest || /^[\s;]/.test(rest) || /^[-=.]/.test(rest) || rest.charAt(0) === '&') {
      return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
    }

    // Try each shape
    for (var i = 0; i < SHAPE_MAP.length; i++) {
      var shapeDef = SHAPE_MAP[i];
      if (rest.indexOf(shapeDef.open) === 0) {
        var openLen = shapeDef.open.length;
        var closeIdx = rest.indexOf(shapeDef.close, openLen);
        if (closeIdx !== -1) {
          var text = rest.substring(openLen, closeIdx).trim();
          // Handle quoted text
          if (text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') {
            text = text.substring(1, text.length - 1);
          }
          var totalLen = id.length + closeIdx + shapeDef.close.length;
          return {
            id: id,
            text: text || id,
            shape: shapeDef.shape,
            endIndex: totalLen,
            raw: str.substring(0, totalLen)
          };
        }
      }
    }

    return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
  }

  /**
   * Parse edge from remaining string.
   * Returns { type, label, endIndex } or null.
   */
  function parseEdge(str) {
    str = str.trim();
    for (var i = 0; i < EDGE_PATTERNS.length; i++) {
      var pattern = EDGE_PATTERNS[i];
      var match = str.match(pattern.regex);
      if (match) {
        return {
          type: pattern.type,
          label: pattern.hasLabel ? match[1].trim() : '',
          endIndex: match[0].length
        };
      }
    }
    return null;
  }

  /**
   * Parse a line that may contain chained node-edge-node definitions.
   * e.g. A[Start] --> B[Process] --> C[End]
   */
  function parseFlowLine(line, model) {
    line = line.trim();
    if (!line) return;

    var remaining = line;
    var prevNodeId = null;

    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (!remaining) break;

      // Try to parse a node
      var node = parseNodeDef(remaining);
      if (!node) break;

      // Register node if not exists
      if (!model._nodeMap[node.id]) {
        var nodeObj = { id: node.id, text: node.text, shape: node.shape };
        model.nodes.push(nodeObj);
        model._nodeMap[node.id] = nodeObj;
      } else {
        // Update text/shape if explicitly defined
        if (node.text !== node.id || node.shape !== 'rect') {
          model._nodeMap[node.id].text = node.text;
          model._nodeMap[node.id].shape = node.shape;
        }
      }

      remaining = remaining.substring(node.endIndex).trim();

      // If there was a previous node and an edge pending, create the edge
      if (prevNodeId !== null && model._pendingEdge) {
        model.edges.push({
          from: prevNodeId,
          to: node.id,
          text: model._pendingEdge.label,
          type: model._pendingEdge.type
        });
        model._pendingEdge = null;
      }

      // Try to parse an edge after this node
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

  /**
   * Main parse function.
   * @param {string} script - Mermaid script string
   * @returns {object} Internal model { type, direction, nodes, edges }
   */
  function parseMermaid(script) {
    if (!script || typeof script !== 'string') {
      return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
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

      // Skip empty lines and comments
      if (!line || line.indexOf('%%') === 0) continue;

      // Skip classDef and class lines
      if (line.indexOf('classDef') === 0 || line.indexOf('class ') === 0) continue;
      
      // Skip style lines
      if (line.indexOf('style ') === 0) continue;

      // Parse header line
      if (!started) {
        var headerMatch = line.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
        if (headerMatch) {
          model.direction = headerMatch[1].toUpperCase();
          if (model.direction === 'TB') model.direction = 'TD';
          started = true;
          continue;
        }
        // Also handle just "graph" or "flowchart" without direction
        if (/^(?:graph|flowchart)\s*$/.test(line)) {
          started = true;
          continue;
        }
      }

      if (started) {
        // Handle subgraph (skip for now but don't break)
        if (line.indexOf('subgraph') === 0 || line === 'end') continue;

        parseFlowLine(line, model);
      }
    }

    // Clean up internal properties
    delete model._nodeMap;
    delete model._pendingEdge;

    return model;
  }

  // Export
  global.MermaidParser = {
    parse: parseMermaid
  };

})(typeof window !== 'undefined' ? window : this);
