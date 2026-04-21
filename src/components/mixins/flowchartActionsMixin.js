/**
 * flowchartActionsMixin
 * LiveEditor와 FullEditor가 공유하는 flowchart 액션을 믹스인으로 추출한 것.
 * 이전에는 같은 메서드가 양쪽 컴포넌트에 복붙돼 있어 수정할 때마다 둘 다 손봐야 했다.
 *
 * 호출부 요구사항:
 *   - data: model (type, nodes, edges, direction)
 *   - data: nodeIdAllocator (IdAllocator 인스턴스)
 *   - methods: _snapshot, updateScriptFromModel, _schedulePreviewFit
 *   - computed: isFlowchart
 *
 * deleteSelected dispatcher는 컴포넌트에 남고, flowchart 삭제 분기만 여기서 처리.
 */
(function (global) {
  'use strict';

  global.flowchartActionsMixin = {
    methods: {
      addNode: function (shape) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var nodeShape = shape;
        var nodeText = 'Node';
        var nodeFill = '';

        if (shape && typeof shape === 'object') {
          nodeShape = shape.shape;
          nodeText = shape.text || nodeText;
          nodeFill = shape.fill || '';
        }

        if (!nodeShape) nodeShape = 'rect';
        var newId   = this.nodeIdAllocator.next(this.script, this.model.nodes);
        var newNode = { id: newId, text: nodeText, shape: nodeShape };
        if (nodeFill) newNode.fill = nodeFill;
        var nodes   = this.model.nodes.slice();
        nodes.push(newNode);
        this.model = Object.assign({}, this.model, { nodes: nodes });
        this.updateScriptFromModel();
        this._schedulePreviewFit();
      },

      addEdge: function (data) {
        if (!this.isFlowchart) return;
        var edges = this.model.edges;
        if (data.from === data.to) {
          for (var i = 0; i < edges.length; i++) {
            if (edges[i].from === data.from && edges[i].to === data.to) return;
          }
        }
        this._snapshot();
        var newEdges = edges.slice();
        newEdges.push({ from: data.from, to: data.to, text: '', type: '-->' });
        this.model = Object.assign({}, this.model, { edges: newEdges });
        this.updateScriptFromModel();
      },

      updateNodeText: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var nodes = this.model.nodes.map(function (n) {
          return n.id === data.nodeId ? Object.assign({}, n, { text: data.text }) : n;
        });
        this.model = Object.assign({}, this.model, { nodes: nodes });
        this.updateScriptFromModel();
      },

      updateNodeShape: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var nodes = this.model.nodes.map(function (n) {
          return n.id === data.nodeId ? Object.assign({}, n, { shape: data.shape }) : n;
        });
        this.model = Object.assign({}, this.model, { nodes: nodes });
        this.updateScriptFromModel();
      },

      updateNodeStyle: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var nodes = this.model.nodes.map(function (n) {
          if (n.id !== data.nodeId) return n;
          return Object.assign({}, n, {
            text: data.text,
            fill: data.fill
          });
        });
        this.model = Object.assign({}, this.model, { nodes: nodes });
        this.updateScriptFromModel();
      },

      updateNodeFill: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var nodes = this.model.nodes.map(function (n) {
          if (n.id !== data.nodeId) return n;
          return Object.assign({}, n, { fill: data.fill });
        });
        this.model = Object.assign({}, this.model, { nodes: nodes });
        this.updateScriptFromModel();
      },

      updateEdgeText: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var edges = this.model.edges.map(function (e, idx) {
          return idx === data.index ? Object.assign({}, e, { text: data.text }) : e;
        });
        this.model = Object.assign({}, this.model, { edges: edges });
        this.updateScriptFromModel();
      },

      updateEdgeType: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var edges = this.model.edges.map(function (e, idx) {
          return idx !== data.index ? e : Object.assign({}, e, { type: data.type });
        });
        this.model = Object.assign({}, this.model, { edges: edges });
        this.updateScriptFromModel();
      },

      updateEdgeStyle: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var edges = this.model.edges.map(function (e, idx) {
          if (idx !== data.index) return e;
          return Object.assign({}, e, {
            text: data.text,
            color: data.color
          });
        });
        this.model = Object.assign({}, this.model, { edges: edges });
        this.updateScriptFromModel();
      },

      updateEdgeColor: function (data) {
        if (!this.isFlowchart) return;
        this._snapshot();
        var edges = this.model.edges.map(function (e, idx) {
          if (idx !== data.index) return e;
          return Object.assign({}, e, { color: data.color });
        });
        this.model = Object.assign({}, this.model, { edges: edges });
        this.updateScriptFromModel();
      },

      changeDirection: function (dir) {
        if (!this.isFlowchart) return;
        this._snapshot();
        this.model = Object.assign({}, this.model, { direction: dir });
        this.updateScriptFromModel();
        this._schedulePreviewFit();
      },

      // deleteSelected dispatcher가 flowchart 분기일 때 호출. _snapshot은 dispatcher 쪽에서 이미 찍었음.
      _deleteFlowchartSelection: function (data) {
        if (data.nodeId) {
          var nodes = this.model.nodes.filter(function (n) { return n.id !== data.nodeId; });
          var edges = this.model.edges.filter(function (e) {
            return e.from !== data.nodeId && e.to !== data.nodeId;
          });
          this.model = Object.assign({}, this.model, { nodes: nodes, edges: edges });
          return true;
        }
        if (data.edgeIndex !== null && data.edgeIndex !== undefined) {
          var ec = this.model.edges.slice();
          ec.splice(data.edgeIndex, 1);
          this.model = Object.assign({}, this.model, { edges: ec });
          return true;
        }
        return false;
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
