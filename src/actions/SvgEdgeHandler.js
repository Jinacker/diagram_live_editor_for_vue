(function (global) {
  'use strict';

  var SvgEdgeHandler = {

    initGhostOverlay: function (svgEl) {
      // Mermaid가 만든 엣지 그룹 내부에 보조 클릭선을 넣으면 부모 pointer-events 영향을 받는다.
      // 그래서 루트 SVG 바로 아래에 전용 레이어를 두고 매 렌더마다 다시 만든다.
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

      // 레이블은 클릭 시 선택, 더블클릭 시 편집
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        SvgEdgeHandler._attachLabel(labels[l], edgePathEls, svgEl, positions, ctx);
      }
    },

    // 실제 엣지 선은 가늘고, Mermaid 구조에 따라 클릭이 막힐 수 있다.
    // 별도 보조 클릭 영역을 루트 레이어에 만들어 이벤트를 받는다.
    _attachOne: function (edgeData, svgEl, overlay, positions, ctx) {
      var pathEl = edgeData.path;
      if (!pathEl) return;
      var idx = edgeData.index;
      var edgeEl = edgeData.el || pathEl;

      var ghost = SvgEdgeHandler._makeGhost(pathEl, svgEl, overlay);
      // 보조 클릭 영역 생성에 실패해도 최소한 실제 선에는 직접 바인딩해서
      // 엣지 상호작용이 완전히 죽지 않게 한다.
      if (!ghost) {
        edgeData.hit = pathEl;
        SvgEdgeHandler._bindEdgeEvents(pathEl, pathEl, edgeEl, idx, ctx);
        return;
      }

      edgeData.hit = ghost;
      SvgEdgeHandler._bindEdgeEvents(ghost, pathEl, edgeEl, idx, ctx);
    },

    // 1차 시도: 선을 여러 점으로 샘플링해서 루트 좌표계 polyline 보조선을 생성
    // 2차 시도: 실패하면 d + transform을 복사한 path 보조선을 생성
    _makeGhost: function (pathEl, svgEl, overlay) {
      // ── 1차 전략 ────────────────────────────────────────────────
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
                // path 로컬 좌표 -> screen -> SVG 루트 좌표
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
        } catch (e) { /* 2차 전략으로 넘어감 */ }
      }

      // ── 2차 전략: d + 조상 변환 복사 ───────────────────────────
      try {
        var d = pathEl.getAttribute('d');
        if (!d) return null;

        // 조상 변환을 바깥 -> 안쪽 순서로 수집
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
      // 완전 투명 선은 브라우저가 클릭 영역을 만들지 않는 경우가 있다.
      // 그래서 거의 보이지 않는 실색상 + 낮은 opacity 조합을 사용한다.
      el.setAttribute('stroke', '#000');
      el.setAttribute('stroke-opacity', '0.003');
      el.setAttribute('stroke-width', '12');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('fill', 'none');
      el.style.cursor        = 'pointer';
      el.style.pointerEvents = 'stroke';
    },

    _bindEdgeEvents: function (hitEl, pathEl, edgeEl, idx, ctx) {
      ctx.watchEdgeSelection(idx, edgeEl);
      // hover 표현은 보조선보다 실제 선(pathEl)에 주는 쪽이 시각적으로 더 자연스럽다.
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
        var rect = pathEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId:    null,
          contextMenu:       null,
          edgeToolbar:       {
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width / 2),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) - 8),
            edgeIndex: idx,
            anchorType: 'edge'
          }
        });
        ctx.emit('edge-selected', idx);
      });
    },

    _attachLabel: function (labelEl, edgePathEls, svgEl, positions, ctx) {
      labelEl.style.cursor = 'pointer';

      var findIdx = function () {
        var txt = (labelEl.textContent || '').trim();
        var edges = ctx.getModel().edges;
        // 현재는 레이블 텍스트로 엣지를 찾는다.
        // 동일 레이블이 여러 개면 첫 매칭을 집을 수 있으므로 추후 식별자 기반 개선 여지가 있다.
        for (var m = 0; m < edges.length; m++) {
          if ((edges[m].text || '').trim() === txt) return m;
        }
        return -1;
      };

      labelEl.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var idx = findIdx();
        if (idx === -1) return;
        var rect = labelEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId:    null,
          contextMenu:       null,
          edgeToolbar:       {
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width / 2),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) - 8),
            edgeIndex: idx,
            anchorType: 'edge'
          }
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
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      if (previewRect) {
        x = clientX - previewRect.left - 70;
        y = clientY - previewRect.top - 24;
      }

      if (svgEl && positions) {
        var fp = positions[edge.from];
        var tp = positions[edge.to];
        if (fp && tp) {
          // 엣지 편집 입력창은 가능하면 엣지의 기하학적 중간쯤에 띄워서
          // 클릭 지점과 무관하게 일관된 위치에서 편집되게 한다.
          var screenPt = SvgPositionTracker.svgToScreen(svgEl,
            (fp.cx + tp.cx) / 2, (fp.cy + tp.cy) / 2);
          x = (previewRect ? screenPt.x - previewRect.left : screenPt.x) - 70;
          y = (previewRect ? screenPt.y - previewRect.top : screenPt.y) - 24;
        }
      }

      ctx.setState({
        selectedEdgeIndex:   index,
        selectedNodeId:      null,
        edgeToolbar:         null,
        editingEdgeIndex:    index,
        editingEdgeText:     edge.text || '',
        editingEdgeColor:    edge.color || '#5c7ab0',
        edgeEditInputStyle: {
          position: 'absolute',
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
