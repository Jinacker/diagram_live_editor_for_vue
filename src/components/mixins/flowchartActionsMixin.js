/**
 * flowchartActionsMixin
 * Container component가 flowchartModelEditing을 사용할 수 있도록 감싼 얇은 wrapper.
 *
 * 호출부 요구사항:
 *   - data: model (type, nodes, edges, direction)
 *   - data: nodeIdAllocator (IdAllocator 인스턴스)
 *   - data: script
 *   - methods: _snapshot, updateScriptFromModel, _schedulePreviewFit
 *   - computed: isFlowchart
 *
 * deleteSelected dispatcher는 컴포넌트에 남고, flowchart 삭제 분기만 여기서 처리.
 */
(function (global) {
  'use strict';

  global.flowchartActionsMixin = {
    methods: {
      _applyFlowchartEdit: function (nextModel, options) {
        if (!nextModel || nextModel === this.model) return false;
        this._snapshot();
        this.model = nextModel;
        this.updateScriptFromModel();
        if (options && options.fitPreview) this._schedulePreviewFit();
        return true;
      },

      addNode: function (shape) {
        if (!this.isFlowchart) return;

        var nodeShape = shape;
        var nodeText = 'Node';
        var nodeFill = '';

        if (shape && typeof shape === 'object') {
          nodeShape = shape.shape;
          nodeText = shape.text || nodeText;
          nodeFill = shape.fill || '';
        }

        if (!nodeShape) nodeShape = 'rect';

        var newNodeId = this.nodeIdAllocator.next(this.script, this.model.nodes);
        var applied = this._applyFlowchartEdit(
          flowchartModelEditing.addNode(this.model, {
            id: newNodeId,
            text: nodeText,
            shape: nodeShape,
            fill: nodeFill
          }),
          { fitPreview: true }
        );
        if (applied) this._notifyNewNode(newNodeId);
      },

      addEdge: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.addEdge(this.model, data));
      },

      updateNodeText: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeText(this.model, data));
      },

      updateNodeShape: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeShape(this.model, data));
      },

      updateNodeStyle: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeStyle(this.model, data));
      },

      updateNodeFill: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeFill(this.model, data));
      },

      updateEdgeText: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeText(this.model, data));
      },

      updateEdgeType: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeType(this.model, data));
      },

      updateEdgeStyle: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeStyle(this.model, data));
      },

      updateEdgeColor: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeColor(this.model, data));
      },

      changeDirection: function (dir) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(
          flowchartModelEditing.changeDirection(this.model, dir),
          { fitPreview: true }
        );
      },

      // deleteSelected dispatcher가 flowchart 분기를 여기로 위임. _snapshot은 dispatcher 쪽에 이미 찍혔음.
      _deleteFlowchartSelection: function (data) {
        var nextModel = flowchartModelEditing.deleteSelection(this.model, data);
        if (!nextModel || nextModel === this.model) return false;
        this.model = nextModel;
        return true;
      },

      wrapNodesInSubgraph: function (data) {
        if (!this.isFlowchart || !data || !data.nodeIds || !data.nodeIds.length) return;
        this._applyFlowchartEdit(
          flowchartModelEditing.wrapNodesInSubgraph(this.model, data.nodeIds, data.title),
          { fitPreview: false }
        );
      },

      updateSubgraphTitle: function (data) {
        if (!this.isFlowchart || !data || !data.subgraphId) return;
        this._applyFlowchartEdit(
          flowchartModelEditing.updateSubgraphTitle(this.model, data.subgraphId, data.title),
          { fitPreview: false }
        );
      },

      removeSubgraph: function (subgraphId) {
        if (!this.isFlowchart || !subgraphId) return;
        this._applyFlowchartEdit(
          flowchartModelEditing.removeSubgraph(this.model, subgraphId),
          { fitPreview: false }
        );
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
