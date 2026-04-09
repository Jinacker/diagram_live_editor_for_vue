(function (global) {
  'use strict';

  // 파서가 지원하는 13개 shape 목록
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

    // svgEl 안의 모든 .node에 인터랙션 연결
    // ctx = MermaidPreview._buildCtx()가 만든 bridge 객체
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

      // hover 중에만 포트를 띄워 canvas를 과하게 복잡하게 만들지 않는다.
      nodeEl.addEventListener('mouseenter', function () {
        ctx.setState({ hoveredNodeId: nodeId });
        nodeEl.classList.add('node-hovered');
        PortDragHandler.showPorts(svgEl, nodeId, positions, ctx);
      });

      nodeEl.addEventListener('mouseleave', function (e) {
        nodeEl.classList.remove('node-hovered');
        var rel = e.relatedTarget;
        // 커서가 포트나 overlay로 이동한 경우 포트를 바로 지우지 않는다.
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

      // 좌클릭은 선택 + 수정 메뉴를 연다.
      nodeEl.addEventListener('click', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var rect = nodeEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          selectedNodeId:    nodeId,
          selectedEdgeIndex: null,
          edgeToolbar:   null,
          contextMenu:   {
            nodeId: nodeId,
            anchorType: 'node',
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width + 10),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) + Math.min(24, rect.height * 0.5))
          }
        });
        ctx.emit('node-selected', nodeId);
      });

      // 더블클릭 → 인라인 편집
      nodeEl.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({ contextMenu: null });
        SvgNodeHandler.startInlineEdit(nodeId, nodeEl, ctx);
      });

      // 우클릭 → 컨텍스트 메뉴
      nodeEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var rect = nodeEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          contextMenu: {
            nodeId: nodeId,
            anchorType: 'node',
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width + 10),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) + Math.min(24, rect.height * 0.5))
          },
          edgeToolbar: null
        });
      });

      // 선택 상태 클래스 동기화
      ctx.watchSelection(nodeId, nodeEl);
    },

    startInlineEdit: function (nodeId, nodeEl, ctx) {
      var node = ctx.findNode(nodeId);
      if (!node) return;

      var rect = nodeEl.getBoundingClientRect();
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      var localLeft = previewRect ? rect.left - previewRect.left : rect.left;
      var localTop = previewRect ? rect.top - previewRect.top : rect.top;
      ctx.setState({
        editingNodeId:  nodeId,
        editingText:    node.text || node.id,
        editingNodeColor: node.fill || '#e2e8f0',
        editInputStyle: {
          position: 'absolute',
          left:  (localLeft + rect.width  / 2 - 70) + 'px',
          top:   (localTop  + rect.height / 2 - 16) + 'px',
          zIndex: 1000,
          width: '240px'
        }
      });
      ctx.focusEditInput();
    }
  };

  global.SvgNodeHandler = SvgNodeHandler;

})(typeof window !== 'undefined' ? window : this);
