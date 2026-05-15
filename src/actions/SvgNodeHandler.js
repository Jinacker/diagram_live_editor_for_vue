(function (global) {
  'use strict';

  // UI에서 노출하는 shape 목록
  var SHAPES = [
    { key: 'rect',              label: '[ ]',     name: 'Rectangle' },
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

  function isStaticModel(model) {
    return !!(model && model.profile === 'static');
  }

  function toEditableText(model, text) {
    text = String(text || '');
    return isStaticModel(model)
      ? text.replace(/<br\s*\/?>/gi, '\n')
      : text;
  }

  function toModelText(model, text) {
    text = String(text || '');
    return isStaticModel(model)
      ? text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>')
      : text;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function buildStaticEditStyle(targetRect, previewRect, text) {
    var localLeft = previewRect ? targetRect.left - previewRect.left : targetRect.left;
    var localTop = previewRect ? targetRect.top - previewRect.top : targetRect.top;
    var lines = String(text || '').split(/\n/);
    var longest = 0;
    for (var i = 0; i < lines.length; i++) {
      longest = Math.max(longest, lines[i].length);
    }

    var width = clamp(Math.max(240, targetRect.width + 32, longest * 7.5 + 32), 240, 500);
    var height = clamp(Math.max(100, lines.length * 18 + 24, targetRect.height + 18), 100, 460);
    var maxLeft = previewRect ? Math.max(8, previewRect.width - width - 8) : localLeft + targetRect.width / 2;
    var maxTop = previewRect ? Math.max(8, previewRect.height - height - 8) : localTop + targetRect.height / 2;

    return {
      position: 'absolute',
      left: clamp(localLeft + targetRect.width / 2 - width / 2, 8, maxLeft) + 'px',
      top: clamp(localTop + targetRect.height / 2 - height / 2, 8, maxTop) + 'px',
      zIndex: 1000,
      width: width + 'px',
      height: height + 'px'
    };
  }

  var SvgNodeHandler = {
    SHAPES: SHAPES,
    isStaticModel: isStaticModel,
    toEditableText: toEditableText,
    toModelText: toModelText,
    buildStaticEditStyle: buildStaticEditStyle,

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

      // model에 없는 노드 = 미지원 문법. 클릭 시 안내만 표시하고 편집 인터랙션은 연결하지 않는다.
      if (!ctx.findNode(nodeId)) {
        nodeEl.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
        nodeEl.addEventListener('dblclick', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
        nodeEl.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
        return;
      }

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
      var model = ctx.getModel ? ctx.getModel() : null;
      var editText = toEditableText(model, node.text || node.id);
      var editStyle = isStaticModel(model)
        ? buildStaticEditStyle(rect, previewRect, editText)
        : {
          position: 'absolute',
          left:  (localLeft + rect.width  / 2 - 70) + 'px',
          top:   (localTop  + rect.height / 2 - 16) + 'px',
          zIndex: 1000,
          width: '240px'
        };
      ctx.setState({
        editingNodeId:  nodeId,
        editingText:    editText,
        editingNodeColor: node.fill || '#e2e8f0',
        editInputStyle: editStyle
      });
      ctx.focusEditInput();
    }
  };

  global.SvgNodeHandler = SvgNodeHandler;

})(typeof window !== 'undefined' ? window : this);
