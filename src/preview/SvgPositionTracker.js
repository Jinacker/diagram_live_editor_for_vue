(function (global) {
  'use strict';

  var SvgPositionTracker = {

    // Extract the logical node ID from a Mermaid-rendered .node element.
    // Mermaid 11 renders IDs as "[renderPrefix-]flowchart-{nodeId}-{index}".
    // We locate the "flowchart-" substring and strip the trailing index.
    extractNodeId: function (nodeEl) {
      // data-id attribute (most reliable, used by newer Mermaid builds)
      var dataId = nodeEl.getAttribute('data-id');
      if (dataId) return dataId;

      var id = nodeEl.id || '';
      if (!id) return null;

      // Find "flowchart-" anywhere in the id string
      var marker = 'flowchart-';
      var idx = id.indexOf(marker);
      if (idx !== -1) {
        var after = id.slice(idx + marker.length); // e.g. "A-0" or "My-Node-3"
        // Strip trailing "-<digits>" index
        var m = after.match(/^([\s\S]*)-\d+$/);
        return m ? m[1] : after;
      }

      // Fallback: strip first and last dash-segment
      var parts = id.split('-');
      if (parts.length >= 3) return parts.slice(1, -1).join('-');
      if (parts.length === 2) return parts[1];
      return id;
    },

    // Build { nodeId: { cx, cy, width, height, origTx, origTy, bboxX, bboxY } }
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

    // Returns SVG-space coordinates of a port on the given side
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

    // Map rendered edgePath elements → model edge indices
    // Returns array parallel to SVG .edgePath NodeList; each entry is { el, path, fromId, toId, index } or null
    collectEdgePaths: function (svgEl, modelEdges) {
      var results = [];
      var edgePaths = svgEl.querySelectorAll('.edgePath');

      // Same logic as extractNodeId: find "flowchart-" prefix and strip trailing index
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

      for (var i = 0; i < edgePaths.length; i++) {
        var edgeEl = edgePaths[i];
        var cls = edgeEl.getAttribute('class') || '';
        var sm  = cls.match(/LS-([^\s]+)/);
        var em  = cls.match(/LE-([^\s]+)/);

        var fId = sm ? sanitize(sm[1]) : null;
        var tId = em ? sanitize(em[1]) : null;

        // Fallback: use model index order
        if ((!fId || !tId) && i < modelEdges.length) {
          fId = modelEdges[i].from;
          tId = modelEdges[i].to;
        }

        var modelIdx = i;
        if (fId && tId) {
          var key = fId + '::' + tId;
          edgeOccurrences[key] = edgeOccurrences[key] || 0;
          var found = 0;
          for (var m = 0; m < modelEdges.length; m++) {
            if (modelEdges[m].from === fId && modelEdges[m].to === tId) {
              if (found === edgeOccurrences[key]) { modelIdx = m; break; }
              found++;
            }
          }
          edgeOccurrences[key]++;
        }

        var pathEl = edgeEl.querySelector('path') || edgeEl;
        results.push(fId && tId ? {
          el:     edgeEl,
          path:   pathEl,
          fromId: fId,
          toId:   tId,
          index:  modelIdx
        } : null);
      }

      return results;
    },

    // Convert a mouse event (clientX/Y) into SVG-local coordinates
    getSVGPoint: function (svgEl, clientX, clientY) {
      var pt  = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var ctm = svgEl.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
    },

    // Convert an SVG-space point to fixed-position screen coordinates
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
