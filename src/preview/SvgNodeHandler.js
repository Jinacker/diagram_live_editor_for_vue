(function (global) {
  'use strict';

  // All 13 shapes the parser supports
  var SHAPES = [
    { key: 'rect',              label: '[ ]',     name: 'Rectangle' },
    { key: 'round',             label: '( )',     name: 'Rounded' },
    { key: 'stadium',           label: '([ ])',   name: 'Stadium' },
    { key: 'subroutine',        label: '[[ ]]',   name: 'Subroutine' },
    { key: 'cylinder',          label: '[( )]',   name: 'Cylinder' },
    { key: 'rhombus',           label: '{ }',     name: 'Diamond' },
    { key: 'hexagon',           label: '{{ }}',   name: 'Hexagon' },
    { key: 'parallelogram',     label: '[/ /]',   name: 'Slant' },
    { key: 'trapezoid',         label: '[/ \\]',  name: 'Trapezoid' },
    { key: 'trapezoid_alt',     label: '[\\ /]',  name: 'Trap. Alt' },
    { key: 'parallelogram_alt', label: '[\\ \\]', name: 'Slant Alt' },
    { key: 'double_circle',     label: '(( ))',   name: 'Circle' },
    { key: 'asymmetric',        label: '>  ]',    name: 'Asymmetric' }
  ];

  var SvgNodeHandler = {
    SHAPES: SHAPES,

    // Attach interaction to all .node elements in svgEl
    // ctx = bridge object from MermaidPreview._buildCtx()
    attach: function (svgEl, positions, elements, ctx) {
      var nodes = svgEl.querySelectorAll('.node');
      for (var i = 0; i < nodes.length; i++) {
        SvgNodeHandler._attachOne(nodes[i], svgEl, positions, elements, ctx);
      }
    },

    _attachOne: function (nodeEl, svgEl, positions, elements, ctx) {
      var nodeId = SvgPositionTracker.extractNodeId(nodeEl);
      if (!nodeId) return;

      nodeEl.style.cursor = 'pointer';

      // HOVER → show 4 ports
      nodeEl.addEventListener('mouseenter', function () {
        ctx.setState({ hoveredNodeId: nodeId });
        nodeEl.classList.add('node-hovered');
        PortDragHandler.showPorts(svgEl, nodeId, positions, ctx);
      });

      nodeEl.addEventListener('mouseleave', function (e) {
        nodeEl.classList.remove('node-hovered');
        var rel = e.relatedTarget;
        // Don't clear ports if cursor moved to a port or stayed in the overlay
        if (rel) {
          if (rel.classList && (
                rel.classList.contains('conn-port') ||
                rel.classList.contains('conn-port-glow'))) {
            return;
          }
          if (rel.closest && rel.closest('#conn-port-overlay')) {
            return;
          }
        }
        setTimeout(function () {
          var state = ctx.getState();
          if (state.hoveredNodeId === nodeId && !state.portDragging) {
            PortDragHandler.clearPorts();
            ctx.setState({ hoveredNodeId: null });
          }
        }, 180);
      });

      // SINGLE CLICK → select (no context menu on left click to avoid noise)
      nodeEl.addEventListener('click', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedNodeId:    nodeId,
          selectedEdgeIndex: null,
          edgeToolbar:   null
        });
        ctx.emit('node-selected', nodeId);
      });

      // DOUBLE CLICK → inline edit
      nodeEl.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({ contextMenu: null });
        SvgNodeHandler.startInlineEdit(nodeId, nodeEl, ctx);
      });

      // RIGHT CLICK → context menu
      nodeEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          contextMenu: { nodeId: nodeId, x: e.clientX, y: e.clientY },
          edgeToolbar: null
        });
      });

      // Keep selection class in sync
      ctx.watchSelection(nodeId, nodeEl);
    },

    startInlineEdit: function (nodeId, nodeEl, ctx) {
      var node = ctx.findNode(nodeId);
      if (!node) return;

      var rect = nodeEl.getBoundingClientRect();
      ctx.setState({
        editingNodeId:  nodeId,
        editingText:    node.text || node.id,
        editInputStyle: {
          position: 'fixed',
          left:  (rect.left + rect.width  / 2 - 70) + 'px',
          top:   (rect.top  + rect.height / 2 - 16) + 'px',
          zIndex: 1000,
          width: Math.max(140, rect.width + 24) + 'px'
        }
      });
      ctx.focusEditInput();
    }
  };

  global.SvgNodeHandler = SvgNodeHandler;

})(typeof window !== 'undefined' ? window : this);
