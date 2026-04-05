/**
 * Mermaid 플로우차트 파서
 * Mermaid flowchart/graph 문법을 내부 모델로 변환한다.
 */

(function (global) {
  'use strict';

  // shape 정의: [여는 bracket, 닫는 bracket, shape 이름]
  var SHAPE_MAP = [
    { open: '((', close: '))', shape: 'double_circle' },
    { open: '([', close: '])', shape: 'stadium' },
    { open: '[[', close: ']]', shape: 'subroutine' },
    { open: '[(', close: ')]', shape: 'cylinder' },
    { open: '{', close: '}', shape: 'rhombus' },
    { open: '{{', close: '}}', shape: 'hexagon' },
    { open: '[/', close: '/]', shape: 'parallelogram' },
    { open: '[\\', close: '\\]', shape: 'parallelogram_alt' },
    { open: '[/', close: '\\]', shape: 'trapezoid' },
    { open: '[\\', close: '/]', shape: 'trapezoid_alt' },
    { open: '>', close: ']', shape: 'asymmetric' },
    { open: '(', close: ')', shape: 'round' },
    { open: '[', close: ']', shape: 'rect' },
  ];

  // 엣지 파싱 패턴.
  // 순서가 중요하다. label 포함 패턴이 plain edge보다 먼저 와야
  // "-->" 앞부분에서 잘못 소비되지 않는다.
  // 주의: "-- label -->" 패턴은 plain "-->" 보다 먼저 와야 한다.
  // "-->" 역시 "--"로 시작하므로 순서가 바뀌면 앞에서 잘못 소비된다.
  var EDGE_PATTERNS = [
    // "-- label -->" / "== label ==>" 형태의 대체 레이블 문법
    { regex: /^==\s+(.+?)\s*==>/, type: '==>', hasLabel: true },
    { regex: /^--\s+(.+?)\s*-->/, type: '-->', hasLabel: true },
    { regex: /^--\s+(.+?)\s*-\.->/, type: '-.->',  hasLabel: true },
    { regex: /^--\s+(.+?)\s*---/, type: '---', hasLabel: true },
    // 파이프 레이블 문법: -->|label|
    { regex: /^==>\|([^|]*)\|/, type: '==>', hasLabel: true },
    { regex: /^==>\s*/, type: '==>', hasLabel: false },
    { regex: /^-->\|([^|]*)\|/, type: '-->', hasLabel: true },
    { regex: /^-->\s*/, type: '-->', hasLabel: false },
    { regex: /^-\.->\|([^|]*)\|/, type: '-.->',  hasLabel: true },
    { regex: /^-\.->\s*/, type: '-.->',  hasLabel: false },
    { regex: /^---\|([^|]*)\|/, type: '---', hasLabel: true },
    { regex: /^---\s*/, type: '---', hasLabel: false },
    { regex: /^-\.-\|([^|]*)\|/, type: '-.-', hasLabel: true },
    { regex: /^-\.-\s*/, type: '-.-', hasLabel: false },
    { regex: /^===\|([^|]*)\|/, type: '===', hasLabel: true },
    { regex: /^===\s*/, type: '===', hasLabel: false },
  ];

  /**
   * 주어진 문자열 시작 위치에서 노드 정의 1개를 파싱한다.
   * 반환값: { id, text, shape, endIndex } 또는 null
   */
  function parseNodeDef(str) {
    str = str.trim();
    if (!str) return null;

    // node id 추출
    var idMatch = str.match(/^([a-zA-Z_\u3131-\uD79D][a-zA-Z0-9_\u3131-\uD79D]*)/);
    if (!idMatch) return null;

    var id = idMatch[1];
    var rest = str.substring(id.length);

    if (!rest || /^[\s;]/.test(rest) || /^[-=.]/.test(rest) || rest.charAt(0) === '&') {
      return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
    }

    // shape별 bracket 조합을 순서대로 검사한다.
    // 길이가 긴 토큰이 앞에 있으므로 [[ ]] 와 [ ]가 섞여도 긴 쪽이 먼저 잡힌다.
    for (var i = 0; i < SHAPE_MAP.length; i++) {
      var shapeDef = SHAPE_MAP[i];
      if (rest.indexOf(shapeDef.open) === 0) {
        var openLen = shapeDef.open.length;
        var innerStart = rest.substring(openLen);
        var text, totalLen, closeIdx;

        // quoted label은 단순히 첫 닫는 bracket을 찾으면 안 된다.
        // 예: A["char (*buf)[16]"] 에서 ]는 텍스트 일부이므로, 실제 닫힘은 "] 시퀀스다.
        if (innerStart.charAt(0) === '"') {
          var closeSeq = '"' + shapeDef.close;
          var seqIdx = rest.indexOf(closeSeq, openLen + 1);
          if (seqIdx !== -1) {
            text = rest.substring(openLen + 1, seqIdx)
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\'); // 양끝 quote 제거 후 escape 복원
            totalLen = id.length + seqIdx + closeSeq.length;
            return {
              id: id,
              text: text || id,
              shape: shapeDef.shape,
              endIndex: totalLen,
              raw: str.substring(0, totalLen)
            };
          }
        }

        // quote가 없는 경우 첫 닫는 bracket을 기준으로 읽는다.
        closeIdx = rest.indexOf(shapeDef.close, openLen);
        if (closeIdx !== -1) {
          text = rest.substring(openLen, closeIdx).trim();
          totalLen = id.length + closeIdx + shapeDef.close.length;
          return {
            id: id,
            text: text || id,
            shape: shapeDef.shape,
            endIndex: totalLen,
            raw: str.substring(0, totalLen)
          };
        }
      }
    }

    return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
  }

  /**
   * 남은 문자열에서 edge를 파싱한다.
   * 반환값: { type, label, endIndex } 또는 null
   */
  function parseEdge(str) {
    str = str.trim();
    for (var i = 0; i < EDGE_PATTERNS.length; i++) {
      var pattern = EDGE_PATTERNS[i];
      var match = str.match(pattern.regex);
      if (match) {
        return {
          type: pattern.type,
          label: pattern.hasLabel ? match[1].trim() : '',
          endIndex: match[0].length
        };
      }
    }
    return null;
  }

  /**
   * node-edge-node가 연쇄된 한 줄을 파싱한다.
   * 예: A[Start] --> B[Process] --> C[End]
   */
  function parseFlowLine(line, model) {
    line = line.trim();
    if (!line) return;

    var remaining = line;
    var prevNodeId = null;

    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (!remaining) break;

      // 현재 위치에서 노드 1개를 읽는다.
      var node = parseNodeDef(remaining);
      if (!node) break;

      // 노드가 처음 나오면 등록한다.
      if (!model._nodeMap[node.id]) {
        var nodeObj = { id: node.id, text: node.text, shape: node.shape };
        model.nodes.push(nodeObj);
        model._nodeMap[node.id] = nodeObj;
      } else {
        // 이미 있던 노드라도 텍스트/shape가 명시돼 있으면 갱신한다.
        if (node.text !== node.id || node.shape !== 'rect') {
          model._nodeMap[node.id].text = node.text;
          model._nodeMap[node.id].shape = node.shape;
        }
      }

      remaining = remaining.substring(node.endIndex).trim();

      // chained 문법(A --> B --> C)을 지원하기 위해
      // 직전에 읽어 둔 pending edge가 있으면 지금 노드와 연결한다.
      if (prevNodeId !== null && model._pendingEdge) {
        model.edges.push({
          from: prevNodeId,
          to: node.id,
          text: model._pendingEdge.label,
          type: model._pendingEdge.type
        });
        model._pendingEdge = null;
      }

      // 현재 노드 뒤에 엣지가 이어지면 pending 상태로 보관하고,
      // 다음 루프에서 읽은 노드와 연결한다.
      var edge = parseEdge(remaining);
      if (edge) {
        model._pendingEdge = edge;
        prevNodeId = node.id;
        remaining = remaining.substring(edge.endIndex).trim();
      } else {
        prevNodeId = null;
        model._pendingEdge = null;
        break;
      }
    }
  }

  /**
   * 메인 파싱 함수
   * @param {string} script - Mermaid 스크립트 문자열
   * @returns {object} 내부 모델 { type, direction, nodes, edges }
   */
  function parseMermaid(script) {
    if (!script || typeof script !== 'string') {
      return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
    }

    var trimmed = script.trim();
    if (/^sequenceDiagram\b/i.test(trimmed) && global.SequenceParser) {
      return global.SequenceParser.parse(script);
    }

    var lines = script.split('\n');
    var model = {
      type: 'flowchart',
      direction: 'TD',
      nodes: [],
      edges: [],
      _nodeMap: {},
      _pendingEdge: null
    };

    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      // 빈 줄과 주석은 건너뛴다.
      if (!line || line.indexOf('%%') === 0) continue;

      // classDef / class 라인은 현재 모델에 반영하지 않는다.
      if (line.indexOf('classDef') === 0 || line.indexOf('class ') === 0) continue;
      
      // style 라인도 현재는 무시한다.
      if (line.indexOf('style ') === 0) continue;

      // 헤더(flowchart/graph + direction) 파싱
      if (!started) {
        var headerMatch = line.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
        if (headerMatch) {
          model.direction = headerMatch[1].toUpperCase();
          if (model.direction === 'TB') model.direction = 'TD';
          started = true;
          continue;
        }
        // 방향 없이 graph / flowchart만 있는 경우도 허용
        if (/^(?:graph|flowchart)\s*$/.test(line)) {
          started = true;
          continue;
        }
      }

      if (started) {
        // subgraph는 지금은 건너뛰되 파싱 자체가 깨지지 않게만 처리
        if (line.indexOf('subgraph') === 0 || line === 'end') continue;

        parseFlowLine(line, model);
      }
    }

    // 내부 임시 상태 제거
    delete model._nodeMap;
    delete model._pendingEdge;

    return model;
  }

  // 전역 노출
  global.MermaidParser = {
    parse: parseMermaid
  };

})(typeof window !== 'undefined' ? window : this);
