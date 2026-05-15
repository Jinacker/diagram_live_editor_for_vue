(function (global) {
  'use strict';

  var SvgEdgeHandler = {

    initGhostOverlay: function (svgEl) {
      var old = svgEl.querySelector('#edge-ghost-overlay');
      if (old) old.remove();
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', 'edge-ghost-overlay');
      g.style.pointerEvents = 'all';
      svgEl.appendChild(g);
      return g;
    },

    attach: function (svgEl, edgePathEls, positions, ctx) {
      var overlay = svgEl.querySelector('#edge-ghost-overlay') ||
        SvgEdgeHandler.initGhostOverlay(svgEl);

      for (var j = 0; j < edgePathEls.length; j++) {
        if (!edgePathEls[j]) continue;
        SvgEdgeHandler._attachOne(edgePathEls[j], svgEl, overlay, positions, ctx);
      }

      // 엣지 라벨은 클릭 타겟에서 제외하고, hitslop만 선택 가능하게 둔다.
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        labels[l].style.pointerEvents = 'none';
        labels[l].style.cursor = 'default';
      }
    },

    _attachOne: function (edgeData, svgEl, overlay, positions, ctx) {
      var pathEl = edgeData.path;
      if (!pathEl) return;
      var idx = edgeData.index;
      var edgeEl = edgeData.el || pathEl;

      ctx.watchEdgeSelection(idx, edgeEl);

      var ghost = SvgEdgeHandler._makeGhost(pathEl, svgEl, overlay);
      if (!ghost) {
        edgeData.hit = pathEl;
        SvgEdgeHandler._bindEdgeEvents(pathEl, pathEl, edgeEl, idx, ctx);
        return;
      }

      edgeData.hit = ghost;
      SvgEdgeHandler._bindEdgeEvents(ghost, pathEl, edgeEl, idx, ctx);
    },

    _makeGhost: function (pathEl, svgEl, overlay) {
      if (typeof pathEl.getTotalLength === 'function') {
        try {
          var len = pathEl.getTotalLength();
          if (len > 1) {
            var pathCTM = pathEl.getScreenCTM();
            var svgCTM  = svgEl.getScreenCTM();
            if (pathCTM && svgCTM) {
              var invSvg  = svgCTM.inverse();
              var samples = Math.max(8, Math.ceil(len / 12));
              var pts = [];
              for (var i = 0; i <= samples; i++) {
                var lp = pathEl.getPointAtLength((i / samples) * len);
                var sp = svgEl.createSVGPoint();
                sp.x = lp.x;
                sp.y = lp.y;
                var root = sp.matrixTransform(pathCTM).matrixTransform(invSvg);
                pts.push(root.x.toFixed(2) + ',' + root.y.toFixed(2));
              }
              if (pts.length) {
                var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                poly.setAttribute('points', pts.join(' '));
                SvgEdgeHandler._styleGhost(poly);
                overlay.appendChild(poly);
                return poly;
              }
            }
          }
        } catch (e) {}
      }

      try {
        var d = pathEl.getAttribute('d');
        if (!d) return null;

        var transforms = [];
        var node = pathEl.parentNode;
        while (node && node !== svgEl) {
          var t = node.getAttribute && node.getAttribute('transform');
          if (t) transforms.unshift(t);
          node = node.parentNode;
        }

        var ghostPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ghostPath.setAttribute('d', d);
        if (transforms.length) {
          ghostPath.setAttribute('transform', transforms.join(' '));
        }
        SvgEdgeHandler._styleGhost(ghostPath);
        overlay.appendChild(ghostPath);
        return ghostPath;
      } catch (e) {
        return null;
      }
    },

    _styleGhost: function (el) {
      el.setAttribute('stroke', '#000');
      el.setAttribute('stroke-opacity', '0.003');
      el.setAttribute('stroke-width', '12');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('fill', 'none');
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'stroke';
    },

    _bindEdgeEvents: function (hitEl, pathEl, edgeEl, idx, ctx) {
      hitEl.addEventListener('mouseenter', function () {
        edgeEl.classList.add('edge-hovered');
        hitEl.setAttribute('stroke-opacity', '0.08');
        hitEl.setAttribute('stroke', '#4f46e5');
      });

      hitEl.addEventListener('mouseleave', function () {
        var selectedEdgeIndex = ctx.getState().selectedEdgeIndex;
        if (selectedEdgeIndex !== idx) {
          edgeEl.classList.remove('edge-hovered');
        }
        hitEl.setAttribute('stroke', '#000');
        hitEl.setAttribute('stroke-opacity', '0.003');
      });

      hitEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        var localX = Math.round(previewRect ? e.clientX - previewRect.left : e.clientX);
        var localY = Math.round(previewRect ? e.clientY - previewRect.top : e.clientY);
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId: null,
          contextMenu: null,
          flowEdgeColorPicker: false,
          flowEdgeBodyPicker: false,
          flowEdgeHeadPicker: false,
          edgeToolbar: {
            x: localX,
            y: localY,
            edgeIndex: idx
          }
        });
        ctx.emit('edge-selected', idx);
      });
    },

    startInlineEdit: function (index, clientX, clientY, svgEl, positions, ctx) {
      var edge = ctx.getModel().edges[index];
      if (!edge) return;

      var x = clientX - 70;
      var y = clientY - 24;
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      if (previewRect) {
        x = clientX - previewRect.left - 70;
        y = clientY - previewRect.top - 24;
      }

      ctx.setState({
        selectedEdgeIndex: index,
        selectedNodeId: null,
        edgeToolbar: null,
        editingEdgeIndex: index,
        editingEdgeText: edge.text || '',
        editingEdgeColor: edge.color || '#5c7ab0',
        edgeEditInputStyle: {
          position: 'absolute',
          left: x + 'px',
          top: y + 'px',
          zIndex: 1000,
          width: '160px'
        }
      });
      ctx.focusEdgeEditInput();
    }
  };

  global.SvgEdgeHandler = SvgEdgeHandler;

})(typeof window !== 'undefined' ? window : this);
