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

      // Labels — click selects, dblclick edits
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        SvgEdgeHandler._attachLabel(labels[l], edgePathEls, svgEl, positions, ctx);
      }
    },

    // Build a wide ghost element on the root-level overlay so no parent
    // pointer-events setting can block it.
    _attachOne: function (edgeData, svgEl, overlay, positions, ctx) {
      var pathEl = edgeData.path;
      if (!pathEl) return;
      var idx = edgeData.index;

      var ghost = SvgEdgeHandler._makeGhost(pathEl, svgEl, overlay);
      if (!ghost) {
        SvgEdgeHandler._bindEdgeEvents(pathEl, pathEl, idx, ctx);
        return;
      }

      SvgEdgeHandler._bindEdgeEvents(ghost, pathEl, idx, ctx);
    },

    // Strategy 1: getPointAtLength + getScreenCTM (correct for any transform depth)
    // Strategy 2: copy 'd' attr + concatenated ancestor transforms (fallback)
    _makeGhost: function (pathEl, svgEl, overlay) {
      // ── Strategy 1 ───────────────────────────────────────────────
      if (typeof pathEl.getTotalLength === 'function') {
        try {
          var len = pathEl.getTotalLength();
          if (len > 1) {
            var pathCTM = pathEl.getScreenCTM();
            var svgCTM  = svgEl.getScreenCTM();
            if (pathCTM && svgCTM) {
              var invSvg  = svgCTM.inverse();
              var samples = Math.max(8, Math.ceil(len / 12));
              var pts     = [];
              for (var i = 0; i <= samples; i++) {
                var lp = pathEl.getPointAtLength((i / samples) * len);
                var sp = svgEl.createSVGPoint();
                sp.x = lp.x; sp.y = lp.y;
                // path-local → screen → SVG-root
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
        } catch (e) { /* fall through to strategy 2 */ }
      }

      // ── Strategy 2: copy d + ancestor transforms ──────────────────
      try {
        var d = pathEl.getAttribute('d');
        if (!d) return null;

        // Collect transforms from ancestors (outer → inner order)
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
      } catch (e) { return null; }
    },

    _styleGhost: function (el) {
      // Keep a real stroke color and near-zero opacity so browsers still expose
      // the stroke geometry to hit-testing.
      el.setAttribute('stroke', '#000');
      el.setAttribute('stroke-opacity', '0.01');
      el.setAttribute('stroke-width', '40');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('fill', 'none');
      el.style.cursor        = 'pointer';
      el.style.pointerEvents = 'stroke';
    },

    _bindEdgeEvents: function (hitEl, pathEl, idx, ctx) {
      hitEl.addEventListener('mouseenter', function () {
        pathEl.classList.add('edge-hovered');
        hitEl.setAttribute('stroke-opacity', '0.12');
        hitEl.setAttribute('stroke', 'rgba(99,102,241,0.12)');
      });
      hitEl.addEventListener('mouseleave', function () {
        pathEl.classList.remove('edge-hovered');
        hitEl.setAttribute('stroke', '#000');
        hitEl.setAttribute('stroke-opacity', '0.01');
      });
      hitEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId:    null,
          contextMenu:       null,
          edgeToolbar:       { x: e.clientX, y: e.clientY, edgeIndex: idx }
        });
        ctx.emit('edge-selected', idx);
      });
    },

    _attachLabel: function (labelEl, edgePathEls, svgEl, positions, ctx) {
      labelEl.style.cursor = 'pointer';

      var findIdx = function () {
        var txt = (labelEl.textContent || '').trim();
        var edges = ctx.getModel().edges;
        for (var m = 0; m < edges.length; m++) {
          if ((edges[m].text || '').trim() === txt) return m;
        }
        return -1;
      };

      labelEl.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var idx = findIdx();
        if (idx === -1) return;
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId:    null,
          contextMenu:       null,
          edgeToolbar:       { x: e.clientX, y: e.clientY, edgeIndex: idx }
        });
        ctx.emit('edge-selected', idx);
      });

      labelEl.addEventListener('dblclick', function (e) {
        e.preventDefault(); e.stopPropagation();
        var idx = findIdx();
        if (idx === -1) return;
        SvgEdgeHandler.startInlineEdit(idx, e.clientX, e.clientY, svgEl, positions, ctx);
      });
    },

    startInlineEdit: function (index, clientX, clientY, svgEl, positions, ctx) {
      var edge = ctx.getModel().edges[index];
      if (!edge) return;

      var x = clientX - 70;
      var y = clientY - 24;

      if (svgEl && positions) {
        var fp = positions[edge.from];
        var tp = positions[edge.to];
        if (fp && tp) {
          var screenPt = SvgPositionTracker.svgToScreen(svgEl,
            (fp.cx + tp.cx) / 2, (fp.cy + tp.cy) / 2);
          x = screenPt.x - 70;
          y = screenPt.y - 24;
        }
      }

      ctx.setState({
        edgeToolbar:         null,
        editingEdgeIndex:    index,
        editingEdgeText:     edge.text || '',
        edgeEditInputStyle: {
          position: 'fixed',
          left:  x + 'px',
          top:   y + 'px',
          zIndex: 1000,
          width: '160px'
        }
      });
      ctx.focusEdgeEditInput();
    }
  };

  global.SvgEdgeHandler = SvgEdgeHandler;

})(typeof window !== 'undefined' ? window : this);
