(function (global) {
  'use strict';

  var SvgEdgeHandler = {

    // Attach interaction to all rendered edge paths
    // edgePathEls: array from SvgPositionTracker.collectEdgePaths()
    attach: function (svgEl, edgePathEls, positions, ctx) {
      for (var j = 0; j < edgePathEls.length; j++) {
        if (!edgePathEls[j]) continue;
        SvgEdgeHandler._attachOne(edgePathEls[j], svgEl, positions, ctx);
      }

      // Edge labels: double-click opens edit, single click selects
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        SvgEdgeHandler._attachLabel(labels[l], edgePathEls, svgEl, positions, ctx);
      }
    },

    _attachOne: function (edgeData, svgEl, positions, ctx) {
      var path = edgeData.path;
      if (!path) return;
      var idx = edgeData.index;

      // Force the .edgePath group to receive pointer events
      // (Mermaid may set pointer-events:none on groups)
      if (edgeData.el) {
        edgeData.el.style.pointerEvents = 'all';
      }
      if (path.parentNode) {
        path.parentNode.style.pointerEvents = 'all';
      }

      // Wide invisible ghost path — use fill:transparent + pointer-events:all
      // so the entire stroke area (and bounding box) is clickable
      var ghost = path.cloneNode(false);
      ghost.setAttribute('class', 'edge-click-area');
      ghost.setAttribute('stroke', 'rgba(0,0,0,0)');
      ghost.setAttribute('stroke-width', '36');
      ghost.setAttribute('stroke-linecap', 'round');
      ghost.setAttribute('fill', 'transparent');
      ghost.removeAttribute('marker-end');
      ghost.removeAttribute('marker-start');
      ghost.style.cursor        = 'pointer';
      ghost.style.pointerEvents = 'all';
      path.parentNode.insertBefore(ghost, path);

      // Highlight real path on hover
      ghost.addEventListener('mouseenter', function () { path.classList.add('edge-hovered'); });
      ghost.addEventListener('mouseleave', function () { path.classList.remove('edge-hovered'); });

      // Left click → select only
      ghost.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId:    null,
          contextMenu:       null
        });
        ctx.emit('edge-selected', idx);
      });

      // Double click → inline label edit
      ghost.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        SvgEdgeHandler.startInlineEdit(idx, e.clientX, e.clientY, svgEl, positions, ctx);
      });

      // Right click → context menu
      ghost.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          edgeContextMenu: { x: e.clientX, y: e.clientY, edgeIndex: idx },
          contextMenu:     null
        });
      });
    },

    _attachLabel: function (labelEl, edgePathEls, svgEl, positions, ctx) {
      labelEl.style.cursor = 'pointer';

      labelEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var txt = (labelEl.textContent || '').trim();
        var edges = ctx.getModel().edges;
        for (var m = 0; m < edges.length; m++) {
          if ((edges[m].text || '').trim() === txt) {
            ctx.setState({ selectedEdgeIndex: m, selectedNodeId: null, contextMenu: null });
            ctx.emit('edge-selected', m);
            break;
          }
        }
      });

      labelEl.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var txt = (labelEl.textContent || '').trim();
        var edges = ctx.getModel().edges;
        for (var m = 0; m < edges.length; m++) {
          if ((edges[m].text || '').trim() === txt) {
            SvgEdgeHandler.startInlineEdit(m, e.clientX, e.clientY, svgEl, positions, ctx);
            break;
          }
        }
      });
    },

    // Position the edge-label inline edit input
    startInlineEdit: function (index, clientX, clientY, svgEl, positions, ctx) {
      var edge = ctx.getModel().edges[index];
      if (!edge) return;

      // Try to calculate midpoint between the two nodes
      var x = clientX - 70;
      var y = clientY - 16;

      if (svgEl && positions) {
        var fp = positions[edge.from];
        var tp = positions[edge.to];
        if (fp && tp) {
          var screenPt = SvgPositionTracker.svgToScreen(svgEl,
            (fp.cx + tp.cx) / 2,
            (fp.cy + tp.cy) / 2
          );
          x = screenPt.x - 70;
          y = screenPt.y - 16;
        }
      }

      ctx.setState({
        editingEdgeIndex:    index,
        editingEdgeText:     edge.text || '',
        edgeEditInputStyle: {
          position: 'fixed',
          left:  x + 'px',
          top:   y + 'px',
          zIndex: 1000,
          width: '140px'
        }
      });
      ctx.focusEdgeEditInput();
    }
  };

  global.SvgEdgeHandler = SvgEdgeHandler;

})(typeof window !== 'undefined' ? window : this);
