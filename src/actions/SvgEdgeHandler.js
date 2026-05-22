(function (global) {
  'use strict';

  function isGraphModel(model) {
    return !!(model && (model.headerKeyword === 'graph' || model.profile === 'graph'));
  }

  function toEditableGraphText(model, text) {
    if (global.SvgNodeHandler && global.SvgNodeHandler.toEditableText) {
      return global.SvgNodeHandler.toEditableText(model, text);
    }
    return String(text || '').replace(/<br\s*\/?>/gi, '\n');
  }

  function getGraphEdgeEditBoxSize(text) {
    var lines = String(text || '').split(/\r\n|\r|\n/).length;
    if (lines <= 1) {
      return { width: 260, height: 56 };
    }
    return {
      width: lines >= 4 ? 320 : 300,
      height: Math.min(130, Math.max(76, lines * 20 + 30))
    };
  }

  function normalizeLabelText(text) {
    return String(text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map(function (line) { return line.trim(); })
      .join('\n')
      .trim();
  }

  function getLabelText(labelEl) {
    if (!labelEl) return '';
    if (typeof labelEl.innerText === 'string' && labelEl.innerText.trim()) return labelEl.innerText;
    if (typeof labelEl.textContent === 'string' && labelEl.textContent.trim()) return labelEl.textContent;
    var htmlEl = labelEl.querySelector && labelEl.querySelector('p, span, div');
    if (htmlEl && typeof htmlEl.innerHTML === 'string') {
      return htmlEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    }
    return '';
  }

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

      // Keep regular flowchart labels passive; graph labels get explicit hit boxes.
      var allLabels = svgEl.querySelectorAll('.edgeLabel');
      var model = ctx.getModel ? ctx.getModel() : null;
      var enableLabelEdit = isGraphModel(model);
      var edges = (model && model.edges) || [];
      for (var l = 0; l < allLabels.length; l++) {
        if (!enableLabelEdit) {
          allLabels[l].style.pointerEvents = 'none';
          allLabels[l].style.cursor = 'default';
        }
      }
      if (enableLabelEdit) SvgEdgeHandler._scheduleLabelHits(svgEl, overlay, edges, positions, ctx);
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

    _collectLabelTargets: function (svgEl) {
      var foreignObjects = svgEl.querySelectorAll('g.edgeLabel foreignObject, .edgeLabel foreignObject');
      var out = [];
      for (var i = 0; i < foreignObjects.length; i++) {
        var fo = foreignObjects[i];
        var labelEl = (fo.querySelector && (fo.querySelector('span.edgeLabel') || fo.querySelector('.edgeLabel') || fo.querySelector('p'))) || fo;
        var text = normalizeLabelText(getLabelText(labelEl));
        if (!text) continue;
        var hitEl = (labelEl.closest && labelEl.closest('.labelBkg')) ||
          (fo.querySelector && (fo.querySelector('.labelBkg') || fo.querySelector('span.edgeLabel') || fo.querySelector('p'))) ||
          fo;
        out.push({ labelEl: labelEl, hitEl: hitEl });
      }
      if (!out.length) {
        var labels = svgEl.querySelectorAll('span.edgeLabel');
        for (var j = 0; j < labels.length; j++) {
          if (!normalizeLabelText(getLabelText(labels[j]))) continue;
          out.push({
            labelEl: labels[j],
            hitEl: (labels[j].closest && labels[j].closest('.labelBkg')) || labels[j]
          });
        }
      }
      return out;
    },

    _mapLabelEdgeIndices: function (labelTargets, edges) {
      var out = [];
      var used = {};
      var fallback = [];
      for (var e = 0; e < edges.length; e++) {
        if (edges[e] && String(edges[e].text || '').trim()) fallback.push(e);
      }

      for (var l = 0; l < labelTargets.length; l++) {
        var labelText = normalizeLabelText(getLabelText(labelTargets[l].labelEl));
        var found = -1;
        if (labelText) {
          for (var i = 0; i < edges.length; i++) {
            if (used[i] || !edges[i]) continue;
            if (normalizeLabelText(edges[i].text) === labelText) {
              found = i;
              break;
            }
          }
        }
        if (found === -1 && fallback[l] !== undefined) found = fallback[l];
        if (found === -1 && edges[l]) found = l;
        if (found !== -1) used[found] = true;
        out.push(found);
      }
      return out;
    },

    _getLabelScreenRect: function (labelEl) {
      if (!labelEl || !labelEl.getBoundingClientRect) return null;
      var rect = labelEl.getBoundingClientRect();
      if ((!rect || rect.width <= 0 || rect.height <= 0) && labelEl.querySelector) {
        var child = labelEl.querySelector('.labelBkg, span.edgeLabel, p, foreignObject, rect, text, .label');
        if (child && child.getBoundingClientRect) rect = child.getBoundingClientRect();
      }
      return rect && rect.width > 0 && rect.height > 0 ? rect : null;
    },

    _screenRectToSvgRect: function (svgEl, rect, pad) {
      if (!svgEl || !rect || !svgEl.createSVGPoint) return null;
      var ctm = svgEl.getScreenCTM && svgEl.getScreenCTM();
      if (!ctm) return null;
      var inv = ctm.inverse();
      var corners = [
        [rect.left - pad, rect.top - pad],
        [rect.right + pad, rect.top - pad],
        [rect.right + pad, rect.bottom + pad],
        [rect.left - pad, rect.bottom + pad]
      ];
      var minX = Infinity;
      var minY = Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;
      for (var i = 0; i < corners.length; i++) {
        var pt = svgEl.createSVGPoint();
        pt.x = corners[i][0];
        pt.y = corners[i][1];
        var svgPt = pt.matrixTransform(inv);
        minX = Math.min(minX, svgPt.x);
        minY = Math.min(minY, svgPt.y);
        maxX = Math.max(maxX, svgPt.x);
        maxY = Math.max(maxY, svgPt.y);
      }
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
      return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    },

    _clearLabelHits: function (overlay) {
      if (!overlay || !overlay.querySelectorAll) return;
      var hits = overlay.querySelectorAll('.edge-label-hit');
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].parentNode) hits[i].parentNode.removeChild(hits[i]);
      }
    },

    _scheduleLabelHits: function (svgEl, overlay, edges, positions, ctx) {
      SvgEdgeHandler._attachLabelHits(svgEl, overlay, edges, positions, ctx);
      if (global.requestAnimationFrame) {
        global.requestAnimationFrame(function () {
          global.requestAnimationFrame(function () {
            SvgEdgeHandler._attachLabelHits(svgEl, overlay, edges, positions, ctx);
          });
        });
      }
    },

    _attachLabelHits: function (svgEl, overlay, edges, positions, ctx) {
      SvgEdgeHandler._clearLabelHits(overlay);
      var labelTargets = SvgEdgeHandler._collectLabelTargets(svgEl);
      if (!labelTargets.length) return;
      var indices = SvgEdgeHandler._mapLabelEdgeIndices(labelTargets, edges);
      for (var i = 0; i < labelTargets.length; i++) {
        var idx = indices[i];
        if (idx === undefined || idx < 0 || !edges[idx]) continue;
        var screenRect = SvgEdgeHandler._getLabelScreenRect(labelTargets[i].hitEl);
        var svgRect = SvgEdgeHandler._screenRectToSvgRect(svgEl, screenRect, 2);
        if (!svgRect) continue;
        SvgEdgeHandler._makeLabelHit(svgEl, overlay, svgRect, idx, positions, ctx);
      }
    },

    _makeLabelHit: function (svgEl, overlay, rect, idx, positions, ctx) {
      var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hit.setAttribute('class', 'edge-label-hit');
      hit.setAttribute('data-edge-index', String(idx));
      hit.setAttribute('x', rect.x.toFixed(2));
      hit.setAttribute('y', rect.y.toFixed(2));
      hit.setAttribute('width', rect.width.toFixed(2));
      hit.setAttribute('height', rect.height.toFixed(2));
      hit.setAttribute('fill', '#000');
      hit.setAttribute('fill-opacity', '0.003');
      hit.setAttribute('stroke', 'none');
      hit.style.cursor = 'pointer';
      hit.style.pointerEvents = 'all';
      hit.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        SvgEdgeHandler.startInlineEdit(idx, e.clientX, e.clientY, svgEl, positions, ctx);
      });
      overlay.appendChild(hit);
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
      var model = ctx.getModel();
      var edge = model.edges[index];
      if (!edge) return;

      var graphMode = isGraphModel(model);
      var editText = graphMode ? toEditableGraphText(model, edge.text || '') : (edge.text || '');
      var editBox = graphMode ? getGraphEdgeEditBoxSize(editText) : { width: 160, height: 0 };
      var x = clientX - (graphMode ? Math.round(editBox.width / 2) : 70);
      var y = clientY - (graphMode ? Math.round(editBox.height / 2) : 24);
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      if (previewRect) {
        x = clientX - previewRect.left - (graphMode ? Math.round(editBox.width / 2) : 70);
        y = clientY - previewRect.top - (graphMode ? Math.round(editBox.height / 2) : 24);
      }

      ctx.setState({
        selectedEdgeIndex: index,
        selectedNodeId: null,
        edgeToolbar: null,
        editingEdgeIndex: index,
        editingEdgeText: editText,
        editingEdgeColor: edge.color || '#5c7ab0',
        edgeEditInputStyle: {
          position: 'absolute',
          left: x + 'px',
          top: y + 'px',
          zIndex: 1000,
          width: graphMode ? editBox.width + 'px' : '160px',
          height: graphMode ? editBox.height + 'px' : undefined
        }
      });
      ctx.focusEdgeEditInput();
    }
  };

  global.SvgEdgeHandler = SvgEdgeHandler;

})(typeof window !== 'undefined' ? window : this);
