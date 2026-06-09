(function (global) {
  'use strict';

  var SvgPositionTracker = {

    // Mermaid가 렌더한 .node 요소에서 논리적인 노드 id를 추출한다.
    // Mermaid 11은 "[renderPrefix-]flowchart-{nodeId}-{index}" 형태를 사용한다.
    extractNodeId: function (nodeEl) {
      // data-id가 있으면 그 값을 우선 사용한다.
      var dataId = nodeEl.getAttribute('data-id');
      if (dataId) return dataId;

      var id = nodeEl.id || '';
      if (!id) return null;

      // id 안의 "flowchart-" 구간을 찾는다.
      var marker = 'flowchart-';
      var idx = id.indexOf(marker);
      if (idx !== -1) {
        var after = id.slice(idx + marker.length); // 예: "A-0", "My-Node-3"
        // 뒤쪽 "-숫자" 인덱스를 제거
        var m = after.match(/^([\s\S]*)-\d+$/);
        return m ? m[1] : after;
      }

      // 마지막 fallback: 앞뒤 dash segment를 제거해 추정
      var parts = id.split('-');
      if (parts.length >= 3) return parts.slice(1, -1).join('-');
      if (parts.length === 2) return parts[1];
      return id;
    },

    // { nodeId: { cx, cy, width, height, origTx, origTy, bboxX, bboxY } } 생성
    collectNodePositions: function (svgEl) {
      var positions = {};
      var elements  = {};
      var nodes = svgEl.querySelectorAll('.node');

      for (var i = 0; i < nodes.length; i++) {
        var nodeEl = nodes[i];
        var nodeId = SvgPositionTracker.extractNodeId(nodeEl);
        if (!nodeId) continue;

        var transform = nodeEl.getAttribute('transform') || '';
        var m = transform.match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
        var tx = m ? parseFloat(m[1]) : 0;
        var ty = m ? parseFloat(m[2]) : 0;

        var bbox;
        try { bbox = nodeEl.getBBox(); }
        catch (e) { bbox = { x: 0, y: 0, width: 60, height: 40 }; }

        positions[nodeId] = {
          cx:     tx + bbox.x + bbox.width  / 2,
          cy:     ty + bbox.y + bbox.height / 2,
          width:  bbox.width,
          height: bbox.height,
          origTx: tx,
          origTy: ty,
          bboxX:  bbox.x,
          bboxY:  bbox.y
        };
        elements[nodeId] = nodeEl;
      }

      return { positions: positions, elements: elements };
    },

    // 지정된 방향 포트의 SVG 좌표 반환
    getPortPosition: function (positions, nodeId, side) {
      var p = positions[nodeId];
      if (!p) return { x: 0, y: 0 };
      switch (side) {
        case 'top':    return { x: p.cx,                         y: p.origTy + p.bboxY };
        case 'bottom': return { x: p.cx,                         y: p.origTy + p.bboxY + p.height };
        case 'left':   return { x: p.origTx + p.bboxX,           y: p.cy };
        case 'right':  return { x: p.origTx + p.bboxX + p.width, y: p.cy };
        default:       return { x: p.cx,                         y: p.cy };
      }
    },

    // 렌더된 엣지 DOM을 모델 엣지 index에 매핑한다.
    // 핵심은 wrapper group보다 실제 stroke path를 우선 보는 것이다.
    // Mermaid 버전/케이스에 따라 이름 없는 엣지가 다른 구조로 렌더링되기 때문이다.
    collectEdgePaths: function (svgEl, modelEdges) {
      var results = [];
      var pathCandidates = svgEl.querySelectorAll(
        '.edgePath path.path,' +
        '.edgePath path:not([class*="arrowhead"]),' +
        '.edgePaths path.path,' +
        '.edgePaths > path,' +
        'path.flowchart-link,' +
        'path[id^="L_"]'
      );
      var seenPathEls = [];
      var expectedEdges = [];
      var pairToExpectedEdges = {};

      // 노드 id 정리 규칙은 extractNodeId와 동일하게 맞춘다.
      var sanitize = function (id) {
        var marker = 'flowchart-';
        var idx = id.indexOf(marker);
        if (idx !== -1) {
          var after = id.slice(idx + marker.length);
          var m = after.match(/^([\s\S]*)-\d+$/);
          return m ? m[1] : after;
        }
        var parts = id.split('-');
        if (parts.length >= 3) return parts.slice(1, -1).join('-');
        if (parts.length === 2) return parts[1];
        return id;
      };

      var edgeOccurrences = {};
      var scanIndex = 0;

      for (var me = 0; me < modelEdges.length; me++) {
        var modelEdge = modelEdges[me];
        if (!modelEdge) continue;

        var pairKey = modelEdge.from + '::' + modelEdge.to;
        var repeatCount = modelEdge.from === modelEdge.to ? 3 : 1;
        if (!pairToExpectedEdges[pairKey]) pairToExpectedEdges[pairKey] = [];

        for (var copy = 0; copy < repeatCount; copy++) {
          var expected = {
            from: modelEdge.from,
            to: modelEdge.to,
            modelIndex: me
          };
          expectedEdges.push(expected);
          pairToExpectedEdges[pairKey].push(expected);
        }
      }

      for (var i = 0; i < pathCandidates.length; i++) {
        var pathEl = pathCandidates[i];
        if (!pathEl || seenPathEls.indexOf(pathEl) !== -1) continue;
        seenPathEls.push(pathEl);

        var edgeEl = pathEl.closest ? pathEl.closest('.edgePath') : null;
        if (!edgeEl) edgeEl = pathEl.parentNode;
        if (!edgeEl) edgeEl = pathEl;

        var cls = edgeEl.getAttribute('class') || '';
        var sm  = cls.match(/LS-([^\s]+)/);
        var em  = cls.match(/LE-([^\s]+)/);

        var fId = sm ? sanitize(sm[1]) : null;
        var tId = em ? sanitize(em[1]) : null;

        // 일부 Mermaid 렌더는 시작/끝점을 wrapper id에 넣어 준다.
        if ((!fId || !tId) && edgeEl.id) {
          var idMatch = edgeEl.id.match(/^L_(.+)_(.+?)_\d+$/);
          if (idMatch) {
            fId = fId || sanitize(idMatch[1]);
            tId = tId || sanitize(idMatch[2]);
          }
        }

        if ((!fId || !tId) && pathEl.id) {
          var pathIdMatch = pathEl.id.match(/^L_(.+)_(.+?)_\d+$/);
          if (pathIdMatch) {
            fId = fId || sanitize(pathIdMatch[1]);
            tId = tId || sanitize(pathIdMatch[2]);
          }
        }

        // DOM에서 시작/끝점을 못 읽으면 마지막 보정으로 모델 순서를 쓴다.
        if ((!fId || !tId) && scanIndex < expectedEdges.length) {
          fId = expectedEdges[scanIndex].from;
          tId = expectedEdges[scanIndex].to;
        }

        // 같은 from/to 쌍이 여러 개 있어도, self-loop는 3슬롯을 같은 model edge로 매핑한다.
        var modelIdx = scanIndex;
        if (fId && tId) {
          var key = fId + '::' + tId;
          var matchingExpected = pairToExpectedEdges[key] || [];
          edgeOccurrences[key] = edgeOccurrences[key] || 0;

          if (matchingExpected.length) {
            var occurrence = Math.min(edgeOccurrences[key], matchingExpected.length - 1);
            modelIdx = matchingExpected[occurrence].modelIndex;
          } else {
            var found = 0;
            for (var m = 0; m < modelEdges.length; m++) {
              if (modelEdges[m].from === fId && modelEdges[m].to === tId) {
                if (found === edgeOccurrences[key]) { modelIdx = m; break; }
                found++;
              }
            }
          }
          edgeOccurrences[key]++;
        } else if (scanIndex < expectedEdges.length) {
          modelIdx = expectedEdges[scanIndex].modelIndex;
        }

        results.push(pathEl ? {
          el:     edgeEl,
          path:   pathEl,
          fromId: fId,
          toId:   tId,
          index:  modelIdx
        } : null);

        scanIndex++;
      }

      return results;
    },

    // 마우스 client 좌표를 SVG 로컬 좌표로 변환
    getSVGPoint: function (svgEl, clientX, clientY) {
      var pt  = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var ctm = svgEl.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
    },

    // SVG 좌표를 fixed-position 기준 화면 좌표로 변환
    svgToScreen: function (svgEl, svgX, svgY) {
      var pt  = svgEl.createSVGPoint();
      pt.x = svgX;
      pt.y = svgY;
      var ctm = svgEl.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm) : pt;
    }
  };

  global.SvgPositionTracker = SvgPositionTracker;

})(typeof window !== 'undefined' ? window : this);
