(function (global) {
  'use strict';

  // Flowchart model을 순수하게 편집하는 계층.
  // Vue 상태, emit, snapshot 같은 부수효과는 여기서 다루지 않는다.

  function sameEdge(edge, from, to) {
    return edge && edge.from === from && edge.to === to;
  }

  // 노드 배열만 바꾸는 공통 패턴을 한곳에 모은다.
  // updater가 아무 변경도 하지 않으면 기존 model을 그대로 반환한다.
  function updateNodes(model, updater) {
    var nodes = model.nodes || [];
    var nextNodes = [];
    var changed = false;

    for (var i = 0; i < nodes.length; i++) {
      var nextNode = updater(nodes[i], i);
      nextNodes.push(nextNode);
      if (nextNode !== nodes[i]) changed = true;
    }

    return changed ? Object.assign({}, model, { nodes: nextNodes }) : model;
  }

  // edge 관련 수정도 같은 방식으로 immutable update를 유지한다.
  function updateEdges(model, updater) {
    var edges = model.edges || [];
    var nextEdges = [];
    var changed = false;

    for (var i = 0; i < edges.length; i++) {
      var nextEdge = updater(edges[i], i);
      nextEdges.push(nextEdge);
      if (nextEdge !== edges[i]) changed = true;
    }

    return changed ? Object.assign({}, model, { edges: nextEdges }) : model;
  }

  var flowchartModelEditing = {
    // 새 노드를 model에 추가한다.
    addNode: function (model, data) {
      if (!model || !data || !data.id) return model;

      var nodes = (model.nodes || []).slice();
      var nextNode = {
        id: data.id,
        text: data.text || 'Node',
        shape: data.shape || 'rect'
      };
      if (data.fill) nextNode.fill = data.fill;
      nodes.push(nextNode);
      return Object.assign({}, model, { nodes: nodes });
    },

    // self-loop는 동일 edge 중복 추가를 막는다.
    addEdge: function (model, data) {
      if (!model || !data || !data.from || !data.to) return model;

      var edges = model.edges || [];
      if (data.from === data.to) {
        for (var i = 0; i < edges.length; i++) {
          if (sameEdge(edges[i], data.from, data.to)) return model;
        }
      }

      var nextEdges = edges.slice();
      nextEdges.push({
        from: data.from,
        to: data.to,
        text: data.text || '',
        type: data.type || '-->'
      });
      return Object.assign({}, model, { edges: nextEdges });
    },

    // 아래 update* 계열은 각각 한 가지 field 책임만 가진다.
    updateNodeText: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        return node.id === data.nodeId
          ? Object.assign({}, node, { text: data.text })
          : node;
      });
    },

    updateNodeShape: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        return node.id === data.nodeId
          ? Object.assign({}, node, { shape: data.shape })
          : node;
      });
    },

    updateNodeStyle: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        if (node.id !== data.nodeId) return node;
        return Object.assign({}, node, {
          text: data.text,
          fill: data.fill
        });
      });
    },

    updateNodeFill: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        return node.id === data.nodeId
          ? Object.assign({}, node, { fill: data.fill })
          : node;
      });
    },

    updateEdgeText: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        return index === data.index
          ? Object.assign({}, edge, { text: data.text })
          : edge;
      });
    },

    updateEdgeType: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        return index === data.index
          ? Object.assign({}, edge, { type: data.type })
          : edge;
      });
    },

    updateEdgeStyle: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        if (index !== data.index) return edge;
        return Object.assign({}, edge, {
          text: data.text,
          color: data.color
        });
      });
    },

    updateEdgeColor: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        return index === data.index
          ? Object.assign({}, edge, { color: data.color })
          : edge;
      });
    },

    changeDirection: function (model, dir) {
      if (!model || !dir) return model;
      if (model.profile === 'static') {
        var subgraphs = model.subgraphs || [];
        var subgraphChanged = false;
        for (var i = 0; i < subgraphs.length; i++) {
          if (subgraphs[i].direction !== dir) {
            subgraphChanged = true;
            break;
          }
        }
        if (model.direction === dir && !subgraphChanged) return model;
        var nextSubgraphs = subgraphs.map(function (sg) {
          return Object.assign({}, sg, { direction: dir });
        });
        return Object.assign({}, model, {
          direction: dir,
          subgraphs: nextSubgraphs
        });
      }
      if (model.direction === dir) return model;
      return Object.assign({}, model, { direction: dir });
    },

    // selection payload를 받아 node 또는 edge 삭제를 처리한다.
    // 삭제 대상이 없으면 원본 model을 그대로 돌려준다.
    deleteSelection: function (model, data) {
      if (!model || !data) return model;

      if (data.nodeId) {
        var nodes = (model.nodes || []).filter(function (node) {
          return node.id !== data.nodeId;
        });
        var edges = (model.edges || []).filter(function (edge) {
          return edge.from !== data.nodeId && edge.to !== data.nodeId;
        });
        if (nodes.length === (model.nodes || []).length && edges.length === (model.edges || []).length) {
          return model;
        }
        return Object.assign({}, model, { nodes: nodes, edges: edges });
      }

      if (data.edgeIndex !== null && data.edgeIndex !== undefined) {
        if (!model.edges || data.edgeIndex < 0 || data.edgeIndex >= model.edges.length) return model;
        var nextEdges = model.edges.slice();
        nextEdges.splice(data.edgeIndex, 1);
        return Object.assign({}, model, { edges: nextEdges });
      }

      return model;
    }
  };

  flowchartModelEditing.updateSubgraphTitle = function (model, subgraphId, title) {
    if (!model || !subgraphId) return model;
    var subgraphs = model.subgraphs || [];
    var found = false;
    var nextSubgraphs = subgraphs.map(function (sg) {
      if (sg.id !== subgraphId) return sg;
      found = true;
      return Object.assign({}, sg, { title: title });
    });
    return found ? Object.assign({}, model, { subgraphs: nextSubgraphs }) : model;
  };

  flowchartModelEditing.removeSubgraph = function (model, subgraphId) {
    if (!model || !subgraphId) return model;
    var subgraphs = model.subgraphs || [];
    var nextSubgraphs = subgraphs.filter(function (sg) { return sg.id !== subgraphId; });
    if (nextSubgraphs.length === subgraphs.length) return model;
    return Object.assign({}, model, { subgraphs: nextSubgraphs });
  };

  flowchartModelEditing.wrapNodesInSubgraph = function (model, nodeIds, title) {
    if (!model || !nodeIds || !nodeIds.length) return model;

    // 유효한 node ID만 포함
    var validIds = [];
    var nodeMap = {};
    for (var i = 0; i < (model.nodes || []).length; i++) {
      nodeMap[model.nodes[i].id] = true;
    }
    for (var j = 0; j < nodeIds.length; j++) {
      if (nodeMap[nodeIds[j]]) validIds.push(nodeIds[j]);
    }
    if (!validIds.length) return model;

    // 기존 subgraph ID와 충돌하지 않는 ID 생성
    var existing = {};
    var prevSgs = model.subgraphs || [];
    for (var k = 0; k < prevSgs.length; k++) existing[prevSgs[k].id] = true;
    var counter = prevSgs.length + 1;
    var sgId = 'SG_' + counter;
    while (existing[sgId]) sgId = 'SG_' + (++counter);

    var newSg = { id: sgId, title: title && title.trim() ? title.trim() : sgId, nodeIds: validIds.slice() };
    return Object.assign({}, model, { subgraphs: prevSgs.concat([newSg]) });
  };

  global.flowchartModelEditing = flowchartModelEditing;
})(typeof window !== 'undefined' ? window : this);
