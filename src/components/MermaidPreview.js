/**
 * MermaidPreview Component (v4: Simplified GUI & Enhanced Context Menus)
 * - Auto-layout only (no manual node dragging/persistence)
 * - Bottom-only connection port for edge creation
 * - Edge hover precision and click menus
 * - Node context menu (edit text, change shape, delete)
 */

Vue.component('mermaid-preview', {
  props: {
    model: { type: Object, default: function () { return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] }; } },
    edgeMode: { type: Boolean, default: false }
  },
  data: function () {
    return {
      svgContent: '',
      selectedNodeId: null,
      selectedEdgeIndex: null,
      
      editingNodeId: null,
      editingText: '',
      editInputStyle: {},
      
      edgeContextMenu: null,
      editingEdgeIndex: null,
      editingEdgeText: '',
      edgeEditInputStyle: {},

      edgeModeSource: null,
      contextMenu: null,
      renderError: '',
      renderCounter: 0,
      
      nodePositions: {},   
      edgePathEls: [],     
      nodeElements: {},    
      
      portDragging: false,
      portDragFrom: null,     
      portDragLine: null,     
      portDragTarget: null,   
      hoveredNodeId: null
    };
  },
  watch: {
    model: {
      handler: function () {
        this.renderDiagram();
      },
      deep: true
    },
    edgeMode: function (val) {
      if (!val) {
        this.edgeModeSource = null;
      }
    }
  },
  mounted: function () {
    this.renderDiagram();
    var self = this;
    document.addEventListener('click', function () {
      self.contextMenu = null;
      self.edgeContextMenu = null;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.editingNodeId || self.editingEdgeIndex !== null) return;
        if (self.selectedNodeId || self.selectedEdgeIndex !== null) {
          self.$emit('delete-selected', {
            nodeId: self.selectedNodeId,
            edgeIndex: self.selectedEdgeIndex
          });
          self.selectedNodeId = null;
          self.selectedEdgeIndex = null;
        }
      }
      if (e.key === 'Escape') {
        self.cancelNodeEdit();
        self.cancelEdgeEdit();
        self.selectedNodeId = null;
        self.selectedEdgeIndex = null;
        self.edgeModeSource = null;
        self.portDragging = false;
        self.$emit('cancel-edge-mode');
      }
    });
  },
  methods: {

    // ==================== RENDERING ====================

    renderDiagram: function () {
      if (!this.model || (!this.model.nodes.length && !this.model.edges.length)) {
        this.svgContent = '';
        this.renderError = '';
        return;
      }

      var script = MermaidGenerator.generate(this.model);
      if (!script || /^flowchart\s+(TD|LR|BT|RL)\s*$/.test(script.trim())) {
        this.svgContent = '';
        return;
      }

      var self = this;
      self.renderCounter++;
      var containerId = 'mermaid-render-' + self.renderCounter;

      try {
        if (window.mermaid) {
          window.mermaid.render(containerId, script).then(function (result) {
            self.svgContent = result.svg;
            self.renderError = '';
            self.$nextTick(function () {
              self.postRenderSetup();
            });
          }).catch(function (err) {
            self.renderError = err.message || 'Render error';
            var errEl = document.getElementById('d' + containerId);
            if (errEl) errEl.remove();
          });
        }
      } catch (e) {
        self.renderError = e.message || 'Render error';
      }
    },

    // ==================== POST-RENDER SETUP ====================

    postRenderSetup: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;

      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      this.collectNodePositions(svgEl);
      this.mapEdgePaths(svgEl);
      this.createOverlay(svgEl);
      this.attachNodeHandlers(svgEl);
      this.attachEdgeHandlers(svgEl);

      var self = this;
      svgEl.addEventListener('click', function (e) {
        if (e.target === svgEl || (e.target.tagName === 'rect' && !e.target.closest('.node'))) {
          self.selectedNodeId = null;
          self.selectedEdgeIndex = null;
        }
      });
    },

    // ==================== NODE POSITION TRACKING ====================

    collectNodePositions: function (svgEl) {
      var self = this;
      self.nodePositions = {};
      self.nodeElements = {};

      var nodes = svgEl.querySelectorAll('.node');
      for (var i = 0; i < nodes.length; i++) {
        var nodeEl = nodes[i];
        var nodeId = self.extractNodeId(nodeEl);
        if (!nodeId) continue;

        var transform = nodeEl.getAttribute('transform') || '';
        var match = transform.match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
        var tx = match ? parseFloat(match[1]) : 0;
        var ty = match ? parseFloat(match[2]) : 0;

        var bbox;
        try { bbox = nodeEl.getBBox(); } catch (e) { bbox = { x: 0, y: 0, width: 60, height: 40 }; }

        self.nodePositions[nodeId] = {
          cx: tx + bbox.x + bbox.width / 2,
          cy: ty + bbox.y + bbox.height / 2,
          width: bbox.width,
          height: bbox.height,
          origTx: tx,
          origTy: ty,
          bboxX: bbox.x,
          bboxY: bbox.y
        };
        self.nodeElements[nodeId] = nodeEl;
      }
    },

    getNodePortPosition: function (nodeId, side) {
      var pos = this.nodePositions[nodeId];
      if (!pos) return { x: 0, y: 0 };
      switch (side) {
        case 'top':    return { x: pos.cx, y: pos.origTy + pos.bboxY };
        case 'bottom': return { x: pos.cx, y: pos.origTy + pos.bboxY + pos.height };
        case 'left':   return { x: pos.origTx + pos.bboxX, y: pos.cy };
        case 'right':  return { x: pos.origTx + pos.bboxX + pos.width, y: pos.cy };
        default:       return { x: pos.cx, y: pos.cy };
      }
    },

    // ==================== EDGE PATH MAPPING (Mermaid v11) ====================

    mapEdgePaths: function (svgEl) {
      var self = this;
      self.edgePathEls = [];
      
      // Mermaid v11: edge paths are direct <path> children of <g class="edgePaths">
      var edgePathsGroup = svgEl.querySelector('.edgePaths');
      if (!edgePathsGroup) {
        console.warn('[MermaidPreview] No .edgePaths group found in SVG');
        return;
      }
      
      var paths = edgePathsGroup.querySelectorAll(':scope > path');
      console.log('[EDGE] Found', paths.length, 'edge paths in .edgePaths group');

      for (var i = 0; i < paths.length; i++) {
        // In Mermaid v11 without individual wrappers, use index-based mapping
        if (i < self.model.edges.length) {
          self.edgePathEls.push({
            el: paths[i],
            path: paths[i],
            fromId: self.model.edges[i].from,
            toId: self.model.edges[i].to,
            index: i
          });
        } else {
          self.edgePathEls.push(null);
        }
      }
    },

    // ==================== EDGE HANDLERS & CONTEXT MENU (Mermaid v11) ====================

    attachEdgeHandlers: function (svgEl) {
      var self = this;
      
      // Mermaid v11: edge paths are direct <path> children of <g class="edgePaths">
      var edgePathsGroup = svgEl.querySelector('.edgePaths');
      if (!edgePathsGroup) return;
      
      // Force the container to accept pointer events
      edgePathsGroup.style.pointerEvents = 'all';
      
      var paths = edgePathsGroup.querySelectorAll(':scope > path');
      
      for (var j = 0; j < paths.length; j++) {
        (function (path, idxData, edgeIndex) {
          // Create invisible thick ghost path for click detection
          var ghost = path.cloneNode(false);
          ghost.removeAttribute('id');
          ghost.removeAttribute('marker-end');
          ghost.removeAttribute('marker-start');
          ghost.setAttribute('class', 'edge-click-area');
          ghost.setAttribute('data-edge-index', edgeIndex);
          ghost.setAttribute('stroke', 'transparent');
          ghost.setAttribute('stroke-width', '40');
          ghost.setAttribute('fill', 'none');
          ghost.style.cursor = 'pointer';
          ghost.style.pointerEvents = 'stroke';
          
          // Append ghost AFTER all paths (on top in SVG z-order)
          edgePathsGroup.appendChild(ghost);
          
          // Highlight effect handlers
          ghost.addEventListener('mouseenter', function() { path.classList.add('edge-hovered'); });
          ghost.addEventListener('mouseleave', function() { path.classList.remove('edge-hovered'); });
          
          // Click handler on ghost (primary)
          ghost.addEventListener('click', function(e) { 
             e.preventDefault(); 
             e.stopPropagation(); 
             if (!idxData) return;
             
             self.contextMenu = null;
             self.editingNodeId = null;

             var edgeIdx = idxData.index;
             self.selectedEdgeIndex = edgeIdx;
             self.selectedNodeId = null;
             self.$emit('edge-selected', edgeIdx);
             
             self.edgeContextMenu = {
               x: e.clientX,
               y: e.clientY,
               edgeIndex: edgeIdx
             };
          });
          
          // Also make the original visible path clickable as fallback
          path.style.cursor = 'pointer';
          path.style.pointerEvents = 'stroke';
          path.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!idxData) return;
            
            self.contextMenu = null;
            self.editingNodeId = null;

            var edgeIdx = idxData.index;
            self.selectedEdgeIndex = edgeIdx;
            self.selectedNodeId = null;
            self.$emit('edge-selected', edgeIdx);
            
            self.edgeContextMenu = {
              x: e.clientX,
              y: e.clientY,
              edgeIndex: edgeIdx
            };
          });
        })(paths[j], self.edgePathEls[j], j);
      }
      
      // Make edge labels clickable too
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        (function (labelEl) {
          labelEl.style.cursor = 'pointer';
          labelEl.style.pointerEvents = 'all';
          labelEl.addEventListener('click', function(e) {
             e.preventDefault(); e.stopPropagation();
             var txt = (labelEl.textContent || '').trim();
             var idx = -1;
             for(var m=0; m<self.model.edges.length; m++) {
                if(self.model.edges[m].text && self.model.edges[m].text.trim() === txt) { idx = m; break; }
             }
             if (idx !== -1) {
               self.contextMenu = null;
               self.editingNodeId = null;

               self.selectedEdgeIndex = idx;
               self.selectedNodeId = null;
               self.$emit('edge-selected', idx);
               self.edgeContextMenu = { x: e.clientX, y: e.clientY, edgeIndex: idx };
             }
          });
        })(labels[l]);
      }
    },

    contextEditEdge: function () {
      if (this.edgeContextMenu) {
        var idx = this.edgeContextMenu.edgeIndex;
        this.edgeContextMenu = null;
        this.startEditEdge(idx);
      }
    },

    contextDeleteEdge: function () {
      if (this.edgeContextMenu) {
        this.$emit('delete-selected', {
          nodeId: null,
          edgeIndex: this.edgeContextMenu.edgeIndex
        });
        this.edgeContextMenu = null;
        this.selectedEdgeIndex = null;
      }
    },

    startEditEdge: function (index) {
      var edgeObj = this.model.edges[index];
      if (!edgeObj) return;

      var fp = this.nodePositions[edgeObj.from];
      var tp = this.nodePositions[edgeObj.to];
      if (!fp || !tp) return;

      var canvas = this.$refs.canvas;
      var svgEl = canvas.querySelector('svg');
      var ctm = svgEl.getScreenCTM();
      
      var svgMidX = (fp.cx + tp.cx) / 2;
      var svgMidY = (fp.cy + tp.cy) / 2;
      
      var pt = svgEl.createSVGPoint();
      pt.x = svgMidX; pt.y = svgMidY;
      var screenPt = pt.matrixTransform(ctm);

      this.editingEdgeIndex = index;
      this.editingEdgeText = edgeObj.text || '';
      this.edgeEditInputStyle = {
        position: 'fixed',
        left: (screenPt.x - 60) + 'px',
        top: (screenPt.y - 16) + 'px',
        zIndex: 1000,
        width: '120px'
      };

      var self = this;
      this.$nextTick(function () {
        var input = self.$refs.editEdgeInput;
        if (input) {
          input.focus();
          input.select();
        }
      });
    },

    confirmEdgeEdit: function () {
      if (this.editingEdgeIndex !== null) {
        this.$emit('update-edge-text', {
          index: this.editingEdgeIndex,
          text: this.editingEdgeText.trim()
        });
      }
      this.editingEdgeIndex = null;
      this.editingEdgeText = '';
    },

    cancelEdgeEdit: function () {
      this.editingEdgeIndex = null;
      this.editingEdgeText = '';
    },

    onEdgeEditKeyDown: function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmEdgeEdit();
      } else if (e.key === 'Escape') {
        this.cancelEdgeEdit();
      }
    },

    // ==================== SVG OVERLAY (PORTS) ====================

    createOverlay: function (svgEl) {
      var old = svgEl.querySelector('#conn-port-overlay');
      if (old) old.remove();

      var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'conn-port-overlay');
      svgEl.appendChild(overlay);
      this._overlay = overlay;

      var dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dragLine.setAttribute('class', 'drag-edge-line');
      dragLine.setAttribute('stroke', '#818cf8');
      dragLine.setAttribute('stroke-width', '2.5');
      dragLine.setAttribute('stroke-dasharray', '6,4');
      dragLine.setAttribute('marker-end', '');
      dragLine.style.display = 'none';
      overlay.appendChild(dragLine);
      this.portDragLine = dragLine;
    },

    showPortsForNode: function (svgEl, nodeId) {
      if (!this._overlay) return;
      this.clearPorts();

      var pos = this.nodePositions[nodeId];
      if (!pos) return;

      // Only show bottom port according to new requirements
      var side = 'bottom';
      var self = this;

      var pt = self.getNodePortPosition(nodeId, side);

      var glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glow.setAttribute('class', 'conn-port-glow');
      glow.setAttribute('cx', pt.x);
      glow.setAttribute('cy', pt.y);
      glow.setAttribute('r', '10');
      glow.setAttribute('fill', 'rgba(99, 102, 241, 0.15)');
      glow.setAttribute('stroke', 'none');
      self._overlay.appendChild(glow);

      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'conn-port');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', '#6366f1');
      circle.setAttribute('stroke', '#a5b4fc');
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('data-node-id', nodeId);
      circle.setAttribute('data-side', side);
      circle.style.cursor = 'crosshair';

      circle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();

        self.portDragging = true;
        self.portDragFrom = { nodeId: nodeId, side: side };
        self.portDragTarget = null;

        self.portDragLine.setAttribute('x1', pt.x);
        self.portDragLine.setAttribute('y1', pt.y);
        self.portDragLine.setAttribute('x2', pt.x);
        self.portDragLine.setAttribute('y2', pt.y);
        self.portDragLine.style.display = '';

        var onMove = function (me) {
          var svgPt = self.getSVGPoint(svgEl, me);
          self.portDragLine.setAttribute('x2', svgPt.x);
          self.portDragLine.setAttribute('y2', svgPt.y);
          self.portDragTarget = self.findPortAt(svgPt.x, svgPt.y, nodeId);
        };

        var onUp = function (me) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          self.portDragLine.style.display = 'none';

          if (self.portDragTarget && self.portDragTarget.nodeId !== nodeId) {
            self.$emit('add-edge', {
              from: self.portDragFrom.nodeId,
              to: self.portDragTarget.nodeId
            });
          }

          self.portDragging = false;
          self.portDragFrom = null;
          self.portDragTarget = null;
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      self._overlay.appendChild(circle);
    },

    clearPorts: function () {
      if (!this._overlay) return;
      var ports = this._overlay.querySelectorAll('.conn-port, .conn-port-glow');
      for (var i = 0; i < ports.length; i++) {
        ports[i].remove();
      }
    },

    findPortAt: function (x, y, excludeNodeId) {
      var threshold = 25; // Slightly larger snap radius
      for (var nodeId in this.nodePositions) {
        if (nodeId === excludeNodeId) continue;
        // Snap to any point inside the node bounding box or roughly near the "top" area for receiving
        var p = this.nodePositions[nodeId];
        // Usually nodes receive edges from top relative to their geometry
        var dx = x - p.cx;
        var topY = p.origTy + p.bboxY;
        var dy = y - topY;
        var centerDist = Math.sqrt((x - p.cx)*(x - p.cx) + (y - p.cy)*(y - p.cy));
        
        if (Math.abs(dx) < p.width/2 && Math.abs(y - p.cy) < p.height/2) {
          return { nodeId: nodeId, side: 'top' };
        } else if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          return { nodeId: nodeId, side: 'top' };
        } else if (centerDist < threshold * 2) {
          return { nodeId: nodeId, side: 'top' };
        }
      }
      return null;
    },

    // ==================== NODE HANDLERS (EDIT + MENU) ====================

    attachNodeHandlers: function (svgEl) {
      var self = this;
      var nodes = svgEl.querySelectorAll('.node');

      for (var i = 0; i < nodes.length; i++) {
        (function (nodeEl) {
          var nodeId = self.extractNodeId(nodeEl);
          if (!nodeId) return;

          nodeEl.style.cursor = 'pointer';

          nodeEl.addEventListener('mouseenter', function () {
            self.hoveredNodeId = nodeId;
            self.showPortsForNode(svgEl, nodeId);
            nodeEl.classList.add('node-hovered');
          });

          nodeEl.addEventListener('mouseleave', function (e) {
            nodeEl.classList.remove('node-hovered');
            var related = e.relatedTarget;
            if (related && (related.classList.contains('conn-port') || related.classList.contains('conn-port-glow'))) {
              return;
            }
            setTimeout(function () {
              if (self.hoveredNodeId === nodeId && !self.portDragging) {
                self.clearPorts();
                self.hoveredNodeId = null;
              }
            }, 200);
          });

          nodeEl.addEventListener('click', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            if (self.edgeMode) {
              self.handleEdgeModeClick(nodeId);
              return;
            }

            // VERY IMPORTANT: Close the edge menu if open
            self.edgeContextMenu = null;
            self.editingEdgeIndex = null;

            self.selectedNodeId = nodeId;
            self.selectedEdgeIndex = null;
            self.$emit('node-selected', nodeId);

            // Directly show context menu on left click as requested (옵션 영역 호출)
            self.showContextMenu(e, nodeId);
          });

          self.$watch('selectedNodeId', function (val) {
            if (val === nodeId) {
              nodeEl.classList.add('selected');
            } else {
              nodeEl.classList.remove('selected');
            }
          }, { immediate: true });

        })(nodes[i]);
      }
    },

    // ==================== NODE EDIT & UTILS ====================

    extractNodeId: function (nodeEl) {
      if (!nodeEl) return null;
      var dataId = nodeEl.getAttribute('data-id');
      if (dataId) return dataId;
      var id = nodeEl.getAttribute('id');
      if (!id) return null;

      // Extract the actual base ID.
      // Mermaid v11 generates IDs like: mermaid-render-4_flowchart-Start-1
      // 1. Remove the instance prefix (anything before 'flowchart-')
      var flowchartIdx = id.indexOf('flowchart-');
      var baseId = flowchartIdx !== -1 ? id.substring(flowchartIdx) : id;
      
      // 2. Remove the standard 'flowchart-' prefix
      baseId = baseId.replace(/^flowchart-/, '');
      
      // 3. Remove the suffix counter (e.g. '-1', '-24')
      baseId = baseId.replace(/-\d+$/, '');
      
      return baseId;
    },

    getSVGPoint: function (svgEl, evt) {
      var pt = svgEl.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      var ctm = svgEl.getScreenCTM();
      if (ctm) {
        return pt.matrixTransform(ctm.inverse());
      }
      return pt;
    },

    handleEdgeModeClick: function (nodeId) {
      if (!this.edgeModeSource) {
        this.edgeModeSource = nodeId;
      } else if (this.edgeModeSource !== nodeId) {
        this.$emit('add-edge', {
          from: this.edgeModeSource,
          to: nodeId
        });
        this.edgeModeSource = null;
      }
    },

    startEditNode: function (nodeId, nodeEl) {
      var node = this.findNodeInModel(nodeId);
      if (!node) return;

      var rect = nodeEl.getBoundingClientRect();
      this.editingNodeId = nodeId;
      this.editingText = node.text || node.id;
      this.editInputStyle = {
        position: 'fixed',
        left: (rect.left + rect.width / 2 - 60) + 'px',
        top: (rect.top + rect.height / 2 - 16) + 'px',
        zIndex: 1000,
        width: Math.max(120, rect.width + 20) + 'px'
      };

      var self = this;
      this.$nextTick(function () {
        var input = self.$refs.editInput;
        if (input) {
          input.focus();
          input.select();
        }
      });
    },

    confirmNodeEdit: function () {
      if (this.editingNodeId && this.editingText.trim()) {
        this.$emit('update-node-text', {
          nodeId: this.editingNodeId,
          text: this.editingText.trim()
        });
      }
      this.editingNodeId = null;
      this.editingText = '';
    },

    cancelNodeEdit: function () {
      this.editingNodeId = null;
      this.editingText = '';
    },

    onNodeEditKeyDown: function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmNodeEdit();
      } else if (e.key === 'Escape') {
        this.cancelNodeEdit();
      }
    },

    findNodeInModel: function (nodeId) {
      if (!this.model || !this.model.nodes) return null;
      for (var i = 0; i < this.model.nodes.length; i++) {
        if (this.model.nodes[i].id === nodeId) return this.model.nodes[i];
      }
      return null;
    },

    showContextMenu: function (e, nodeId) {
      this.contextMenu = {
        x: e.clientX,
        y: e.clientY,
        nodeId: nodeId
      };
    },

    contextEditNode: function () {
      if (this.contextMenu) {
        var nodeId = this.contextMenu.nodeId;
        this.contextMenu = null;
        var nodeEl = this.nodeElements[nodeId];
        if (nodeEl) {
          this.startEditNode(nodeId, nodeEl);
        }
      }
    },

    contextDeleteNode: function () {
      if (this.contextMenu) {
        this.$emit('delete-selected', {
          nodeId: this.contextMenu.nodeId,
          edgeIndex: null
        });
        this.contextMenu = null;
        this.selectedNodeId = null;
      }
    },
    
    contextChangeShape: function(shape) {
      if (this.contextMenu) {
        this.$emit('update-node-shape', {
          nodeId: this.contextMenu.nodeId,
          shape: shape
        });
        this.contextMenu = null;
      }
    },

    fitView: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
      }
    }
  },
  template: '\
    <div class="preview-area" @click.self="selectedNodeId = null; selectedEdgeIndex = null;">\
      <div v-if="edgeMode" class="edge-mode-overlay">\
        {{ edgeModeSource ? "Click target node to connect from \'" + edgeModeSource + "\'" : "Click a source node" }}\
      </div>\
      <div v-if="portDragging" class="edge-mode-overlay" style="background: var(--success);">\
        Drag to a target node to connect\
      </div>\
      <div v-if="svgContent" ref="canvas" class="preview-area__canvas" v-html="svgContent"></div>\
      <div v-else class="preview-area__empty">\
        <div class="preview-area__empty-icon">◇</div>\
        <div class="preview-area__empty-text">Write Mermaid script to see the diagram</div>\
        <div style="color: var(--text-muted); font-size: 12px;">Supports flowchart syntax</div>\
      </div>\
      \
      <!-- Node Edit Overlay -->\
      <div v-if="editingNodeId" class="node-edit-overlay" :style="editInputStyle">\
        <input ref="editInput" class="node-edit-input" v-model="editingText" @keydown="onNodeEditKeyDown" @blur="confirmNodeEdit" />\
      </div>\
      \
      <!-- Edge Edit Overlay -->\
      <div v-if="editingEdgeIndex !== null" class="node-edit-overlay" :style="edgeEditInputStyle">\
        <input ref="editEdgeInput" class="node-edit-input" v-model="editingEdgeText" @keydown="onEdgeEditKeyDown" @blur="confirmEdgeEdit" />\
      </div>\
      \
      <!-- Node Context Menu -->\
      <div v-if="contextMenu" class="context-menu" :style="{ left: contextMenu.x + \'px\', top: contextMenu.y + \'px\' }">\
        <div class="context-menu__section-title">Change Shape</div>\
        <div class="context-menu__shapes">\
           <button class="context-menu__shape-btn" @click="contextChangeShape(\'rect\')" title="Rectangle">[&nbsp;&nbsp;]</button>\
           <button class="context-menu__shape-btn" @click="contextChangeShape(\'round\')" title="Rounded">(&nbsp;&nbsp;)</button>\
           <button class="context-menu__shape-btn" @click="contextChangeShape(\'rhombus\')" title="Diamond">{&nbsp;&nbsp;}</button>\
           <button class="context-menu__shape-btn" @click="contextChangeShape(\'double_circle\')" title="Circle">((&nbsp;))</button>\
        </div>\
        <div class="context-menu__separator"></div>\
        <div class="context-menu__item" @click="contextEditNode"><span class="context-menu__item-icon">✎</span> Edit Text</div>\
        <div class="context-menu__item context-menu__item--danger" @click="contextDeleteNode"><span class="context-menu__item-icon">✕</span> Delete</div>\
      </div>\
      \
      <!-- Edge Context Menu -->\
      <div v-if="edgeContextMenu" class="context-menu" :style="{ left: edgeContextMenu.x + \'px\', top: edgeContextMenu.y + \'px\' }">\
        <div class="context-menu__item" @click="contextEditEdge"><span class="context-menu__item-icon">✎</span> Edit Text</div>\
        <div class="context-menu__separator"></div>\
        <div class="context-menu__item context-menu__item--danger" @click="contextDeleteEdge"><span class="context-menu__item-icon">✕</span> Delete</div>\
      </div>\
    </div>\
  '
});
