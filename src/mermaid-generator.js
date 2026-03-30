/**
 * Mermaid Flowchart Generator
 * Converts internal model back to Mermaid script text.
 */

(function (global) {
  'use strict';

  // Shape to bracket mapping
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

  /**
   * Generate node definition string.
   */
  function generateNode(node) {
    var brackets = SHAPE_BRACKETS[node.shape] || SHAPE_BRACKETS.rect;
    var text = node.text || node.id;
    // If text equals id and shape is rect, just output id
    if (text === node.id && node.shape === 'rect') {
      return node.id;
    }
    return node.id + brackets[0] + text + brackets[1];
  }

  /**
   * Generate the full Mermaid script from internal model.
   * @param {object} model - { type, direction, nodes, edges }
   * @returns {string} Mermaid script
   */
  function generateMermaid(model) {
    if (!model) return '';

    var lines = [];
    var direction = model.direction || 'TD';
    lines.push('flowchart ' + direction);

    // Track which nodes have been defined (in an edge line)
    var definedNodes = {};

    // First, generate edge lines (which also define nodes inline)
    if (model.edges && model.edges.length > 0) {
      for (var i = 0; i < model.edges.length; i++) {
        var edge = model.edges[i];
        var fromNode = findNode(model.nodes, edge.from);
        var toNode = findNode(model.nodes, edge.to);

        var fromStr = fromNode ? generateNode(fromNode) : edge.from;
        var toStr = toNode ? generateNode(toNode) : edge.to;

        var edgeStr = edge.type || '-->';
        if (edge.text) {
          edgeStr = edgeStr + '|' + edge.text + '|';
        }

        lines.push('    ' + fromStr + ' ' + edgeStr + ' ' + toStr);

        if (fromNode) definedNodes[fromNode.id] = true;
        if (toNode) definedNodes[toNode.id] = true;
      }
    }

    // Then, output standalone nodes (not referenced in any edge)
    if (model.nodes && model.nodes.length > 0) {
      for (var j = 0; j < model.nodes.length; j++) {
        var node = model.nodes[j];
        if (!definedNodes[node.id]) {
          lines.push('    ' + generateNode(node));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Find node by id in nodes array.
   */
  function findNode(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  // Export
  global.MermaidGenerator = {
    generate: generateMermaid,
    generateNode: generateNode
  };

})(typeof window !== 'undefined' ? window : this);
