/**
 * previewSubgraphMixin
 * MermaidPreview의 subgraph title과 rubber-band 선택 메서드를 동작 변경 없이 분리한 mixin.
 */
(function (global) {
  'use strict';

  global.previewSubgraphMixin = {
    methods: {
    _attachSubgraphInteractions: function (svgEl) {
      var self = this;
      var subgraphs = (this.model && this.model.subgraphs) || [];
      if (!subgraphs.length) return;

      // id → subgraph 빠른 탐색용 맵
      var sgById = {};
      for (var k = 0; k < subgraphs.length; k++) sgById[subgraphs[k].id] = subgraphs[k];

      function normalizeClusterId(rawId) {
        rawId = String(rawId || '');
        if (!rawId) return '';
        if (sgById[rawId]) return rawId;

        var candidates = [
          rawId.replace(/^cluster_/, ''),
          rawId.replace(/^subGraph/i, ''),
          rawId.replace(/^.*flowchart-/, '').replace(/-\d+$/, '')
        ];
        for (var c = 0; c < candidates.length; c++) {
          if (sgById[candidates[c]]) return candidates[c];
        }
        return '';
      }

      function getSubgraphIdFromDom(clusterEl) {
        var rawIds = [
          clusterEl.getAttribute('data-id'),
          clusterEl.getAttribute('data-node'),
          clusterEl.id
        ];
        for (var r = 0; r < rawIds.length; r++) {
          var normalized = normalizeClusterId(rawIds[r]);
          if (normalized) return normalized;
        }
        return '';
      }

      function usableRect(el) {
        if (!el || !el.getBoundingClientRect) return null;
        var rect = el.getBoundingClientRect();
        return rect && rect.width > 0 && rect.height > 0 ? rect : null;
      }

      function getLabelText(labelEl) {
        if (!labelEl) return '';
        var text = labelEl.textContent || '';
        return String(text).replace(/\u00a0/g, ' ').trim();
      }

      function getSubgraphIdFromLabel(labelEl) {
        var labelText = getLabelText(labelEl);
        if (!labelText) return '';
        for (var s = 0; s < subgraphs.length; s++) {
          var title = String(subgraphs[s].title || subgraphs[s].id || '').trim();
          if (title && title === labelText) return subgraphs[s].id;
        }
        return '';
      }

      function sameNodeSet(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        var seen = {};
        for (var i = 0; i < a.length; i++) seen[a[i]] = true;
        for (var j = 0; j < b.length; j++) {
          if (!seen[b[j]]) return false;
        }
        return true;
      }

      function getSubgraphIdFromContainedNodes(nodeIdsInCluster) {
        if (!nodeIdsInCluster || !nodeIdsInCluster.length) return '';

        for (var exact = 0; exact < subgraphs.length; exact++) {
          if (sameNodeSet(subgraphs[exact].nodeIds || [], nodeIdsInCluster)) {
            return subgraphs[exact].id;
          }
        }

        var bestId = '';
        var bestScore = 0;
        var tied = false;
        for (var j = 0; j < subgraphs.length; j++) {
          var nodeIds = subgraphs[j].nodeIds || [];
          var score = 0;
          for (var m = 0; m < nodeIdsInCluster.length; m++) {
            if (nodeIds.indexOf(nodeIdsInCluster[m]) !== -1) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestId = subgraphs[j].id;
            tied = false;
          } else if (score > 0 && score === bestScore) {
            tied = true;
          }
        }

        return tied ? '' : bestId;
      }

      function openSubgraphToolbar(e, sgId, clusterEl, labelEl) {
        e.preventDefault();
        e.stopPropagation();
        var canvas = self.$refs.canvas;
        var cr = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        var labelRect = usableRect(labelEl);
        var clusterRect = usableRect(clusterEl);
        var anchorX = e.clientX;
        var anchorY = e.clientY;

        if (labelRect) {
          anchorX = labelRect.left + labelRect.width / 2;
          anchorY = labelRect.top + labelRect.height / 2;
        } else if (clusterRect) {
          anchorX = clusterRect.left + clusterRect.width / 2;
          anchorY = clusterRect.top + 12;
        }

        self.subgraphTitleToolbar = {
          sgId: sgId,
          x: Math.round(anchorX - cr.left),
          y: Math.round(anchorY - cr.top)
        };
      }

      function attachTitleHit(clusterEl, labelEl, sgId) {
        var rectEl = clusterEl.querySelector('rect');
        if (!rectEl || !rectEl.parentNode || rectEl.parentNode !== clusterEl) return;

        var x = parseFloat(rectEl.getAttribute('x') || '0');
        var y = parseFloat(rectEl.getAttribute('y') || '0');
        var width = parseFloat(rectEl.getAttribute('width') || '0');
        if (!width) return;

        var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('class', 'subgraph-title-hit');
        hit.setAttribute('x', x);
        hit.setAttribute('y', y);
        hit.setAttribute('width', width);
        hit.setAttribute('height', '28');
        hit.setAttribute('fill', '#000');
        hit.setAttribute('fill-opacity', '0.003');
        hit.setAttribute('stroke', 'none');
        // Mermaid의 `.cluster rect` 규칙이 presentation attribute보다 우선하므로
        // 제목 클릭용 hit rect는 inline priority로 다시 투명하게 고정한다.
        hit.style.setProperty('fill', '#000', 'important');
        hit.style.setProperty('fill-opacity', '0.003', 'important');
        hit.style.setProperty('stroke', 'none', 'important');
        hit.style.cursor = 'pointer';
        hit.style.pointerEvents = 'all';
        hit.addEventListener('click', function (e) {
          openSubgraphToolbar(e, sgId, clusterEl, labelEl);
        });
        clusterEl.appendChild(hit);
      }

      var clusters = svgEl.querySelectorAll('.cluster');
      for (var i = 0; i < clusters.length; i++) {
        (function (clusterEl) {
          var labelEl = clusterEl.querySelector('.cluster-label');
          var sgId = getSubgraphIdFromDom(clusterEl) || getSubgraphIdFromLabel(labelEl);

          if (!sgId) {
            // Mermaid SVG에서 .node는 .cluster의 DOM 자식이 아닌 형제다.
            // DOM id가 없는 구버전/특수 렌더만 화면 좌표 기준 포함 여부로 fallback 매핑.
            var clusterRect = clusterEl.getBoundingClientRect();
            var nodeIdsInCluster = [];
            var elements = self._elements || {};
            for (var nodeId in elements) {
              var nodeEl = elements[nodeId];
              if (!nodeEl) continue;
              var nr = nodeEl.getBoundingClientRect();
              var nCx = nr.left + nr.width  / 2;
              var nCy = nr.top  + nr.height / 2;
              if (nCx >= clusterRect.left && nCx <= clusterRect.right &&
                  nCy >= clusterRect.top  && nCy <= clusterRect.bottom) {
                nodeIdsInCluster.push(nodeId);
              }
            }
            if (nodeIdsInCluster.length > 0) {
              sgId = getSubgraphIdFromContainedNodes(nodeIdsInCluster);
            }
          }

          if (!sgId) return;

          if (labelEl) {
            labelEl.style.cursor = 'pointer';
            labelEl.addEventListener('click', function (e) {
              openSubgraphToolbar(e, sgId, clusterEl, labelEl);
            });
          }
          attachTitleHit(clusterEl, labelEl, sgId);
        })(clusters[i]);
      }
    },

    subgraphTitleDelete: function () {
      var tb = this.subgraphTitleToolbar;
      if (!tb) return;
      this.subgraphTitleToolbar = null;
      this.$emit('remove-subgraph', tb.sgId);
    },

    _attachFlowchartRubberBand: function (canvas, svgEl) {
      var self = this;
      var suppressContextMenu = false;

      // 캡처 단계에서 contextmenu를 가로채 브라우저 메뉴와 노드 GUI 메뉴 모두 차단
      canvas.addEventListener('contextmenu', function (e) {
        e.preventDefault();                    // 브라우저 기본 메뉴 항상 차단
        if (suppressContextMenu) {
          e.stopPropagation();                 // 드래그 후엔 노드 GUI 메뉴도 차단
          suppressContextMenu = false;
        }
      }, true); // capture phase

      canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 2) return;
        // 노드 위에서 시작하면 rubber-band 대신 노드 contextmenu로 위임
        if (e.target && e.target.closest && e.target.closest('.node')) return;

        e.preventDefault();
        var cr = canvas.getBoundingClientRect();
        var startX = e.clientX - cr.left;
        var startY = e.clientY - cr.top;
        var didDrag = false;

        self._rubberBand = { startX: startX, startY: startY };
        self.rubberBandRect = null;
        self.subgraphToolbar = null;
        self.selectedNodeIds = [];

        var onMove = function (me) {
          var cr2 = canvas.getBoundingClientRect();
          var curX = me.clientX - cr2.left;
          var curY = me.clientY - cr2.top;
          var w = Math.abs(curX - startX);
          var h = Math.abs(curY - startY);
          if (w > 4 || h > 4) {
            didDrag = true;
            self.rubberBandRect = {
              left:   Math.min(startX, curX),
              top:    Math.min(startY, curY),
              width:  w,
              height: h
            };
          }
        };

        var onUp = function (ue) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);

          var rb = self.rubberBandRect;
          self.rubberBandRect = null;
          self._rubberBand = null;

          if (!didDrag) {
            // 단순 우클릭 → contextmenu 이벤트 허용 (노드 GUI 메뉴용)
            suppressContextMenu = false;
            return;
          }

          // 드래그였으면 뒤따라오는 contextmenu를 억제
          suppressContextMenu = true;

          if (!rb || rb.width < 5 || rb.height < 5) return;

          var cr3 = canvas.getBoundingClientRect();
          var rLeft   = cr3.left + rb.left;
          var rTop    = cr3.top  + rb.top;
          var rRight  = rLeft + rb.width;
          var rBottom = rTop  + rb.height;

          var selectedIds = [];
          var nodeEls = svgEl.querySelectorAll('.node');
          for (var i = 0; i < nodeEls.length; i++) {
            var nodeId = SvgPositionTracker.extractNodeId(nodeEls[i]);
            if (!nodeId) continue;
            var nr = nodeEls[i].getBoundingClientRect();
            var cx = nr.left + nr.width  / 2;
            var cy = nr.top  + nr.height / 2;
            if (cx >= rLeft && cx <= rRight && cy >= rTop && cy <= rBottom) {
              selectedIds.push(nodeId);
            }
          }

          if (!selectedIds.length) return;

          self.selectedNodeIds = selectedIds;
          self._showFlowchartSelectionHighlight(selectedIds);
          var cr4 = canvas.getBoundingClientRect();
          self.subgraphToolbar = {
            x: ue.clientX - cr4.left,
            y: ue.clientY - cr4.top
          };
          self.subgraphTitleInput = '';

          // 다음 mousedown(새 드래그/클릭) 시 툴바 닫기
          var onNextMouseDown = function () {
            self._showFlowchartSelectionHighlight([]);
            self.subgraphToolbar = null;
            self.selectedNodeIds = [];
            document.removeEventListener('mousedown', onNextMouseDown);
          };
          document.addEventListener('mousedown', onNextMouseDown);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    },

    _showFlowchartSelectionHighlight: function (selectedIds) {
      var svgEl = this._svgEl;
      if (!svgEl) return;
      var old = svgEl.querySelector('#flowchart-sel-highlight');
      if (old) old.remove();
      if (!selectedIds || !selectedIds.length) return;

      var pad = 12;
      var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (var i = 0; i < selectedIds.length; i++) {
        var pos = this._positions[selectedIds[i]];
        if (!pos) continue;
        var x = pos.origTx + pos.bboxX;
        var y = pos.origTy + pos.bboxY;
        left   = Math.min(left,   x);
        top    = Math.min(top,    y);
        right  = Math.max(right,  x + pos.width);
        bottom = Math.max(bottom, y + pos.height);
      }
      if (!isFinite(left)) return;

      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('id', 'flowchart-sel-highlight');
      rect.setAttribute('x', left - pad);
      rect.setAttribute('y', top - pad);
      rect.setAttribute('width',  right - left + pad * 2);
      rect.setAttribute('height', bottom - top + pad * 2);
      rect.setAttribute('rx', '6');
      rect.setAttribute('class', 'flowchart-sel-highlight');
      rect.style.pointerEvents = 'none';
      svgEl.appendChild(rect);
    },

    confirmWrapSubgraph: function () {
      if (!this.selectedNodeIds.length) return;

      // 선택된 노드 중 이미 subgraph에 속한 게 있으면 생성 차단
      var subgraphs = (this.model && this.model.subgraphs) || [];
      for (var i = 0; i < subgraphs.length; i++) {
        var sg = subgraphs[i];
        for (var j = 0; j < sg.nodeIds.length; j++) {
          if (this.selectedNodeIds.indexOf(sg.nodeIds[j]) !== -1) {
            this._showHint('Selected nodes are already in a subgraph');
            this._showFlowchartSelectionHighlight([]);
            this.subgraphToolbar = null;
            this.selectedNodeIds = [];
            return;
          }
        }
      }

      this._showFlowchartSelectionHighlight([]);
      this.$emit('wrap-nodes-in-subgraph', {
        nodeIds: this.selectedNodeIds.slice(),
        title: this.subgraphTitleInput || 'Group'
      });
      this.subgraphToolbar = null;
      this.selectedNodeIds = [];
      this.subgraphTitleInput = '';
    },

    cancelSubgraphToolbar: function () {
      this._showFlowchartSelectionHighlight([]);
      this.subgraphToolbar = null;
      this.selectedNodeIds = [];
      this.subgraphTitleInput = '';
    }
    }
  };

})(typeof window !== 'undefined' ? window : this);
