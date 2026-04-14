/**
 * gui-editor.mount.iife.js
 * Built: 2026-04-14T01:46:25.452Z
 *
 * Browser mount bundle for gui-editor (no minification).
 * Requires global Vue 2 and Mermaid loaded separately.
 * Exposes window.GuiEditor.mount(...).
 */

(function (global) {
'use strict';

if (!global.Vue || !/^2\./.test(String(global.Vue.version || ''))) {
  throw new Error('gui-editor.mount.iife.js requires global Vue 2 to be loaded before this bundle.');
}

/* ===== src/sequence-parser.js ===== */
/**
 * Mermaid 시퀀스 다이어그램 파서
 * sequenceDiagram 문법을 내부 모델로 변환한다.
 */

(function (global) {
  'use strict';

  // 지원 operator: ->>, -->>, ->, -->, -x, --x, -), --)  (각각 +/- activation suffix 선택)
  var MESSAGE_RE = /^([A-Za-z0-9_\u3131-\uD79D]+)\s*((?:-->>|--x|--\)|-->|->>|-x|-\)|->)[+-]?)\s*([A-Za-z0-9_\u3131-\uD79D]+)\s*:(.*)$/;

  function ensureParticipant(model, id, label) {
    if (!id || model._participantMap[id]) return;
    var participant = { id: id, label: label || id, kind: 'participant' };
    model.participants.push(participant);
    model._participantMap[id] = participant;
  }

  function parseParticipantLine(line, model) {
    var match = line.match(/^(participant|actor)\s+([A-Za-z0-9_\u3131-\uD79D]+)(?:\s+as\s+(.+))?$/);
    if (!match) return false;
    model.explicitParticipants = true;
    var id = match[2];
    var label = match[3] ? match[3].trim() : id;
    var kind = match[1]; // 'participant' | 'actor'
    if (!model._participantMap[id]) {
      var p = { id: id, label: label, kind: kind };
      model.participants.push(p);
      model._participantMap[id] = p;
    } else {
      model._participantMap[id].kind = kind;
      if (match[3]) model._participantMap[id].label = label;
    }
    return true;
  }

  function parseMessageLine(line, model) {
    var match = line.match(MESSAGE_RE);
    if (!match) return false;

    ensureParticipant(model, match[1], match[1]);
    ensureParticipant(model, match[3], match[3]);

    model.messages.push({
      from: match[1],
      to: match[3],
      operator: match[2],
      text: (match[4] || '').trim()
    });
    return true;
  }

  function parseSequence(script) {
    if (!script || typeof script !== 'string') {
      return {
        type: 'sequenceDiagram',
        explicitParticipants: false,
        participants: [],
        messages: [],
        nodes: [],
        edges: []
      };
    }

    var lines = script.split('\n');
    var model = {
      type: 'sequenceDiagram',
      explicitParticipants: false,
      participants: [],
      messages: [],
      nodes: [],
      edges: [],
      _participantMap: {}
    };
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('%%') === 0) continue;

      if (!started) {
        if (/^sequenceDiagram$/i.test(line)) {
          started = true;
        }
        continue;
      }

      if (line === 'autonumber') { model.autonumber = true; continue; }
      if (parseParticipantLine(line, model)) continue;
      if (parseMessageLine(line, model)) continue;
    }

    delete model._participantMap;
    return model;
  }

  global.SequenceParser = {
    parse: parseSequence
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/sequence-generator.js ===== */
/**
 * Mermaid 시퀀스 다이어그램 생성기
 * 내부 모델을 sequenceDiagram 스크립트로 직렬화한다.
 */

(function (global) {
  'use strict';

  function generateSequence(model) {
    if (!model) return '';

    var lines = ['sequenceDiagram'];
    if (model.autonumber) lines.push('    autonumber');
    var participants = model.participants || [];
    var messages = model.messages || [];
    var referenced = {};
    var mustDeclare = !!model.explicitParticipants;

    for (var r = 0; r < messages.length; r++) {
      if (messages[r].from) referenced[messages[r].from] = true;
      if (messages[r].to) referenced[messages[r].to] = true;
    }

    if (!mustDeclare) {
      for (var d = 0; d < participants.length; d++) {
        var candidate = participants[d];
        if (!candidate || !candidate.id) continue;
        if ((candidate.label && candidate.label !== candidate.id) || !referenced[candidate.id]) {
          mustDeclare = true;
          break;
        }
      }
    }

    if (mustDeclare) {
      for (var i = 0; i < participants.length; i++) {
        var participant = participants[i];
        if (!participant || !participant.id) continue;
        var keyword = participant.kind === 'actor' ? 'actor' : 'participant';
        if (participant.label && participant.label !== participant.id) {
          lines.push('    ' + keyword + ' ' + participant.id + ' as ' + participant.label);
        } else {
          lines.push('    ' + keyword + ' ' + participant.id);
        }
      }
    }

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      if (!message || !message.from || !message.to) continue;
      lines.push(
        '    ' +
        message.from +
        (message.operator || '->>') +
        message.to +
        ': ' +
        (message.text || '')
      );
    }

    return lines.join('\n');
  }

  global.SequenceGenerator = {
    generate: generateSequence
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/mermaid-parser.js ===== */
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

  function parseStyleLine(line, model) {
    var match = line.match(/^style\s+([A-Za-z_\u3131-\uD79D][A-Za-z0-9_\u3131-\uD79D]*)\s+(.+)$/);
    if (!match || !model._nodeMap[match[1]]) return;
    var node = model._nodeMap[match[1]];
    var declarations = match[2].split(',');
    for (var i = 0; i < declarations.length; i++) {
      var parts = declarations[i].split(':');
      if (parts.length < 2) continue;
      var key = parts[0].trim();
      var value = parts.slice(1).join(':').trim();
      if (key === 'fill') node.fill = value;
    }
  }

  function parseLinkStyleLine(line, model) {
    var match = line.match(/^linkStyle\s+(\d+)\s+(.+)$/);
    if (!match) return;
    var edge = model.edges[parseInt(match[1], 10)];
    if (!edge) return;
    var declarations = match[2].split(',');
    for (var i = 0; i < declarations.length; i++) {
      var parts = declarations[i].split(':');
      if (parts.length < 2) continue;
      var key = parts[0].trim();
      var value = parts.slice(1).join(':').trim();
      if (key === 'stroke') edge.color = value;
    }
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
      
      if (line.indexOf('style ') === 0) {
        parseStyleLine(line, model);
        continue;
      }

      if (line.indexOf('linkStyle ') === 0) {
        parseLinkStyleLine(line, model);
        continue;
      }

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


/* ===== src/mermaid-generator.js ===== */
/**
 * Mermaid 플로우차트 생성기
 * 내부 모델을 다시 Mermaid 스크립트 문자열로 직렬화한다.
 */

(function (global) {
  'use strict';

  // shape -> bracket 매핑
  var SHAPE_BRACKETS = {
    rect: ['[', ']'],
    round: ['(', ')'],
    stadium: ['([', '])'],
    subroutine: ['[[', ']]'],
    cylinder: ['[(', ')]'],
    rhombus: ['{', '}'],
    hexagon: ['{{', '}}'],
    parallelogram: ['[/', '/]'],
    parallelogram_alt: ['[\\', '\\]'],
    trapezoid: ['[/', '\\]'],
    trapezoid_alt: ['[\\', '/]'],
    double_circle: ['((', '))'],
    asymmetric: ['>', ']'],
  };

  function escapeLabel(text) {
    // generator는 항상 quoted label을 쓰므로, 최소 escape만 여기서 처리한다.
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHex(color) {
    if (!color) return '';
    var trimmed = String(color).trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return '';
    if (trimmed.length === 4) {
      return '#' + trimmed.charAt(1) + trimmed.charAt(1) +
        trimmed.charAt(2) + trimmed.charAt(2) +
        trimmed.charAt(3) + trimmed.charAt(3);
    }
    return trimmed.toLowerCase();
  }

  function darkenHex(color, amount) {
    var hex = normalizeHex(color);
    if (!hex) return '';
    var ratio = clamp(amount, 0, 1);
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    r = Math.round(r * (1 - ratio));
    g = Math.round(g * (1 - ratio));
    b = Math.round(b * (1 - ratio));
    return '#' + [r, g, b].map(function (v) {
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function contrastText(color) {
    var hex = normalizeHex(color);
    if (!hex) return '';
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68 ? '#1b2a4a' : '#ffffff';
  }

  /**
   * 노드 정의 문자열 생성
   */
  function generateNode(node) {
    var brackets = SHAPE_BRACKETS[node.shape] || SHAPE_BRACKETS.rect;
    var text = node.text || node.id;
    // 텍스트가 id와 같고 기본 사각형이면 bare id만 출력한다.
    if (text === node.id && node.shape === 'rect') {
      return node.id;
    }
    // bare id가 아닌 노드는 항상 quote해서
    // 특수문자/공백/대괄호가 있어도 다시 parser가 안전하게 읽을 수 있게 한다.
    return node.id + brackets[0] + '"' + escapeLabel(text) + '"' + brackets[1];
  }

  /**
   * 내부 모델에서 전체 Mermaid 스크립트 생성
   * 형식:
   *   flowchart TD
   *   A["label"]          ← 노드 정의 먼저
   *   B["label"]
   *   A --> B             ← 그 다음 엣지
   *   C -- text --> D     ← 레이블 엣지는 "-- text -->" 형식 사용
   */
  function generateMermaid(model) {
    if (!model) return '';
    if (model.type === 'sequenceDiagram' && global.SequenceGenerator) {
      return global.SequenceGenerator.generate(model);
    }

    var lines = [];
    var direction = model.direction || 'TD';
    lines.push('flowchart ' + direction);

    // 1. 노드 정의를 먼저 모두 출력한다.
    // inline node definition을 edge line에 섞지 않아서 사람이 읽기 쉽고 diff도 안정적이다.
    if (model.nodes && model.nodes.length > 0) {
      for (var i = 0; i < model.nodes.length; i++) {
        lines.push('    ' + generateNode(model.nodes[i]));
      }
    }

    // 2. 엣지는 node id만 사용해서 별도로 출력한다.
    if (model.edges && model.edges.length > 0) {
      for (var j = 0; j < model.edges.length; j++) {
        var edge = model.edges[j];
        var edgeStr;
        if (edge.text) {
          // "-- label -->" 형식
          edgeStr = '-- ' + edge.text.trim() + ' ' + (edge.type || '-->');
        } else {
          edgeStr = edge.type || '-->';
        }
        lines.push('    ' + edge.from + ' ' + edgeStr + ' ' + edge.to);
      }
    }

    if (model.nodes && model.nodes.length > 0) {
      for (var n = 0; n < model.nodes.length; n++) {
        var node = model.nodes[n];
        var fill = normalizeHex(node.fill);
        if (!fill) continue;
        lines.push(
          '    style ' + node.id +
          ' fill:' + fill +
          ',stroke:' + darkenHex(fill, 0.22) +
          ',color:' + contrastText(fill)
        );
      }
    }

    if (model.edges && model.edges.length > 0) {
      for (var e = 0; e < model.edges.length; e++) {
        var edgeColor = normalizeHex(model.edges[e].color);
        if (!edgeColor) continue;
        lines.push(
          '    linkStyle ' + e +
          ' stroke:' + edgeColor +
          ',color:' + edgeColor +
          ',stroke-width:2px'
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * nodes 배열에서 id로 노드 찾기
   */
  function findNode(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  // 전역 노출
  global.MermaidGenerator = {
    generate: generateMermaid,
    generateNode: generateNode
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/services/HistoryManager.js ===== */
(function (global) {
  'use strict';

  var MAX_STACK = 50;

  function HistoryManager() {
    this._past   = [];
    this._future = [];
  }

  // mutation 전에 현재 모델을 저장한다.
  HistoryManager.prototype.snapshot = function (model) {
    this._past.push(JSON.stringify(model));
    if (this._past.length > MAX_STACK) this._past.shift();
    this._future = []; // 새 액션이 생기면 redo 경로는 무효화된다.
  };

  // 이전 모델 반환. undo할 것이 없으면 null.
  HistoryManager.prototype.undo = function (currentModel) {
    if (!this._past.length) return null;
    this._future.push(JSON.stringify(currentModel));
    return JSON.parse(this._past.pop());
  };

  // 다음 모델 반환. redo할 것이 없으면 null.
  HistoryManager.prototype.redo = function (currentModel) {
    if (!this._future.length) return null;
    this._past.push(JSON.stringify(currentModel));
    return JSON.parse(this._future.pop());
  };

  HistoryManager.prototype.canUndo = function () { return this._past.length > 0; };
  HistoryManager.prototype.canRedo = function () { return this._future.length > 0; };

  HistoryManager.prototype.clear = function () {
    this._past   = [];
    this._future = [];
  };

  global.HistoryManager = HistoryManager;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SvgPositionTracker.js ===== */
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


/* ===== src/actions/SvgNodeHandler.js ===== */
(function (global) {
  'use strict';

  // 파서가 지원하는 13개 shape 목록
  var SHAPES = [
    { key: 'rect',              label: '[ ]',     name: 'Rectangle' },
    { key: 'round',             label: '( )',     name: 'Rounded' },
    { key: 'stadium',           label: '([ ])',   name: 'Stadium' },
    { key: 'subroutine',        label: '[[ ]]',   name: 'Subroutine' },
    { key: 'cylinder',          label: '[( )]',   name: 'Cylinder' },
    { key: 'rhombus',           label: '{ }',     name: 'Diamond' },
    { key: 'hexagon',           label: '{{ }}',   name: 'Hexagon' },
    { key: 'parallelogram',     label: '[/ /]',   name: 'Slant' },
    { key: 'trapezoid',         label: '[/ \\]',  name: 'Trapezoid' },
    { key: 'trapezoid_alt',     label: '[\\ /]',  name: 'Trap. Alt' },
    { key: 'parallelogram_alt', label: '[\\ \\]', name: 'Slant Alt' },
    { key: 'double_circle',     label: '(( ))',   name: 'Circle' },
    { key: 'asymmetric',        label: '>  ]',    name: 'Asymmetric' }
  ];

  var SvgNodeHandler = {
    SHAPES: SHAPES,

    // svgEl 안의 모든 .node에 인터랙션 연결
    // ctx = MermaidPreview._buildCtx()가 만든 bridge 객체
    attach: function (svgEl, positions, elements, ctx) {
      var nodes = svgEl.querySelectorAll('.node');
      for (var i = 0; i < nodes.length; i++) {
        SvgNodeHandler._attachOne(nodes[i], svgEl, positions, elements, ctx);
      }
    },

    _attachOne: function (nodeEl, svgEl, positions, elements, ctx) {
      var nodeId = SvgPositionTracker.extractNodeId(nodeEl);
      if (!nodeId) return;

      nodeEl.style.cursor = 'pointer';

      // hover 중에만 포트를 띄워 canvas를 과하게 복잡하게 만들지 않는다.
      nodeEl.addEventListener('mouseenter', function () {
        ctx.setState({ hoveredNodeId: nodeId });
        nodeEl.classList.add('node-hovered');
        PortDragHandler.showPorts(svgEl, nodeId, positions, ctx);
      });

      nodeEl.addEventListener('mouseleave', function (e) {
        nodeEl.classList.remove('node-hovered');
        var rel = e.relatedTarget;
        // 커서가 포트나 overlay로 이동한 경우 포트를 바로 지우지 않는다.
        if (rel) {
          if (rel.classList && (
                rel.classList.contains('conn-port') ||
                rel.classList.contains('conn-port-glow'))) {
            return;
          }
          if (rel.closest && rel.closest('#conn-port-overlay')) {
            return;
          }
        }
        setTimeout(function () {
          var state = ctx.getState();
          if (state.hoveredNodeId === nodeId && !state.portDragging) {
            PortDragHandler.clearPorts();
            ctx.setState({ hoveredNodeId: null });
          }
        }, 180);
      });

      // 좌클릭은 선택 + 수정 메뉴를 연다.
      nodeEl.addEventListener('click', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var rect = nodeEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          selectedNodeId:    nodeId,
          selectedEdgeIndex: null,
          edgeToolbar:   null,
          contextMenu:   {
            nodeId: nodeId,
            anchorType: 'node',
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width + 10),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) + Math.min(24, rect.height * 0.5))
          }
        });
        ctx.emit('node-selected', nodeId);
      });

      // 더블클릭 → 인라인 편집
      nodeEl.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({ contextMenu: null });
        SvgNodeHandler.startInlineEdit(nodeId, nodeEl, ctx);
      });

      // 우클릭 → 컨텍스트 메뉴
      nodeEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var rect = nodeEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          contextMenu: {
            nodeId: nodeId,
            anchorType: 'node',
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width + 10),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) + Math.min(24, rect.height * 0.5))
          },
          edgeToolbar: null
        });
      });

      // 선택 상태 클래스 동기화
      ctx.watchSelection(nodeId, nodeEl);
    },

    startInlineEdit: function (nodeId, nodeEl, ctx) {
      var node = ctx.findNode(nodeId);
      if (!node) return;

      var rect = nodeEl.getBoundingClientRect();
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      var localLeft = previewRect ? rect.left - previewRect.left : rect.left;
      var localTop = previewRect ? rect.top - previewRect.top : rect.top;
      ctx.setState({
        editingNodeId:  nodeId,
        editingText:    node.text || node.id,
        editingNodeColor: node.fill || '#e2e8f0',
        editInputStyle: {
          position: 'absolute',
          left:  (localLeft + rect.width  / 2 - 70) + 'px',
          top:   (localTop  + rect.height / 2 - 16) + 'px',
          zIndex: 1000,
          width: '240px'
        }
      });
      ctx.focusEditInput();
    }
  };

  global.SvgNodeHandler = SvgNodeHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SvgEdgeHandler.js ===== */
(function (global) {
  'use strict';

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

      // 엣지 라벨은 클릭 타겟에서 제외하고, hitslop만 선택 가능하게 둔다.
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        labels[l].style.pointerEvents = 'none';
        labels[l].style.cursor = 'default';
      }
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
      var edge = ctx.getModel().edges[index];
      if (!edge) return;

      var x = clientX - 70;
      var y = clientY - 24;
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      if (previewRect) {
        x = clientX - previewRect.left - 70;
        y = clientY - previewRect.top - 24;
      }

      ctx.setState({
        selectedEdgeIndex: index,
        selectedNodeId: null,
        edgeToolbar: null,
        editingEdgeIndex: index,
        editingEdgeText: edge.text || '',
        editingEdgeColor: edge.color || '#5c7ab0',
        edgeEditInputStyle: {
          position: 'absolute',
          left: x + 'px',
          top: y + 'px',
          zIndex: 1000,
          width: '160px'
        }
      });
      ctx.focusEdgeEditInput();
    }
  };

  global.SvgEdgeHandler = SvgEdgeHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/PortDragHandler.js ===== */
(function (global) {
  'use strict';

  var SIDES = ['top', 'right', 'bottom', 'left'];

  var PortDragHandler = {
    _overlay:   null,
    _dragLine:  null,

    // 매 렌더 후 SVG가 DOM에 붙은 뒤 한 번 호출
    initOverlay: function (svgEl) {
      // 포트는 엣지 보조 클릭선보다 항상 위에서 클릭돼야 하므로 전용 레이어를 둔다.
      var old = svgEl.querySelector('#conn-port-overlay');
      if (old) old.remove();

      var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'conn-port-overlay');
      // 그룹 전체가 이벤트를 먹지 않고, 실제 포트 클릭 타깃만 이벤트를 받게 한다.
      overlay.style.pointerEvents = 'none';
      svgEl.appendChild(overlay);
      this._overlay = overlay;

      var dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dragLine.setAttribute('class', 'drag-edge-line');
      dragLine.setAttribute('stroke', '#818cf8');
      dragLine.setAttribute('stroke-width', '2.5');
      dragLine.setAttribute('stroke-dasharray', '6,4');
      dragLine.style.display   = 'none';
      dragLine.style.pointerEvents = 'none';
      overlay.appendChild(dragLine);
      this._dragLine = dragLine;
    },

    // 노드 주변에 4방향 포트 표시
    showPorts: function (svgEl, nodeId, positions, ctx) {
      if (!this._overlay) return;
      // hover 중 다른 레이어가 추가돼도 포트가 항상 최상단에 오도록 재부착한다.
      this._bringOverlayToFront(svgEl);
      this.clearPorts();

      var self = this;

      for (var s = 0; s < SIDES.length; s++) {
        (function (side) {
          var pt = SvgPositionTracker.getPortPosition(positions, nodeId, side);

          var setHovered = function (hovered) {
            circle.classList.toggle('port-hovered', hovered);
            glow.classList.toggle('port-hovered', hovered);
          };

          var onPointerDown = function (e) {
            e.preventDefault();
            e.stopPropagation();
            self._startDrag(svgEl, nodeId, pt, positions, ctx);
          };

          var onPointerEnter = function () {
            setHovered(true);
            ctx.setState({ portDragging: ctx.getState().portDragging }); // hover 유지
          };

          var onPointerLeave = function () {
            setHovered(false);
          };

          // 보이는 포트 원은 작게 유지하고,
          // 실제 클릭은 더 큰 보이지 않는 hit 원이 담당한다.
          var hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          hit.setAttribute('class', 'conn-port-hit');
          hit.setAttribute('cx', pt.x);
          hit.setAttribute('cy', pt.y);
          hit.setAttribute('r', '11');
          hit.setAttribute('data-node-id', nodeId);
          hit.setAttribute('data-side', side);
          hit.style.cursor = 'crosshair';
          hit.style.pointerEvents = 'all';
          self._overlay.appendChild(hit);

          // glow 원
          var glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          glow.setAttribute('class', 'conn-port-glow');
          glow.setAttribute('cx', pt.x);
          glow.setAttribute('cy', pt.y);
          glow.setAttribute('r', '10');
          glow.style.pointerEvents = 'none';
          self._overlay.appendChild(glow);

          // 보이는 포트 원
          var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('class', 'conn-port');
          circle.setAttribute('cx', pt.x);
          circle.setAttribute('cy', pt.y);
          circle.setAttribute('r', '5');
          circle.setAttribute('data-node-id', nodeId);
          circle.setAttribute('data-side', side);
          circle.style.cursor = 'crosshair';
          circle.style.pointerEvents = 'none';
          self._overlay.appendChild(circle);

          hit.addEventListener('mousedown', onPointerDown);
          hit.addEventListener('mouseenter', onPointerEnter);
          hit.addEventListener('mouseleave', onPointerLeave);
        })(SIDES[s]);
      }
    },

    _startDrag: function (svgEl, fromNodeId, fromPt, positions, ctx) {
      var self = this;
      // 드래그 시작 직전에도 레이어를 맨 위로 올려 엣지 클릭 영역과 충돌하지 않게 한다.
      self._bringOverlayToFront(svgEl);
      ctx.setState({ portDragging: true });

      self._dragLine.setAttribute('x1', fromPt.x);
      self._dragLine.setAttribute('y1', fromPt.y);
      self._dragLine.setAttribute('x2', fromPt.x);
      self._dragLine.setAttribute('y2', fromPt.y);
      self._dragLine.style.display = '';

      var currentTarget = null;

      var onMove = function (me) {
        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
        self._dragLine.setAttribute('x2', svgPt.x);
        self._dragLine.setAttribute('y2', svgPt.y);

        var hit = self._findHitNode(svgPt.x, svgPt.y, fromNodeId, positions);
        if (hit !== currentTarget) {
          if (currentTarget) self._clearTargetHighlight(svgEl, currentTarget);
          currentTarget = hit;
          if (hit) self._highlightTarget(svgEl, hit);
        }
      };

      var onUp = function (me) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        self._dragLine.style.display = 'none';
        if (currentTarget) self._clearTargetHighlight(svgEl, currentTarget);
        ctx.setState({ portDragging: false });

        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
        // onUp 시에는 excludeId=null 로 source 노드도 포함해 self-loop를 허용한다.
        var target = self._findHitNode(svgPt.x, svgPt.y, null, positions);
        if (target) {
          ctx.emit('add-edge', { from: fromNodeId, to: target });
        }

        // 여전히 hover 중이면 원래 노드 포트를 다시 표시
        setTimeout(function () {
          if (ctx.getState().hoveredNodeId === fromNodeId) {
            self.showPorts(svgEl, fromNodeId, positions, ctx);
          }
        }, 50);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },

    // 포트 드래그 중에는 target node를 약간 관대하게 판정한다.
    // 정확히 bbox 안이 아니어도 center 근처면 snap 대상으로 본다.
    // excludeId가 null이면 모든 노드를 검색 대상으로 포함한다 (self-loop 판정 시 사용).
    _findHitNode: function (x, y, excludeId, positions) {
      var SNAP = 28;
      var best = null;
      var bestDist = Infinity;

      for (var nodeId in positions) {
        if (excludeId !== null && nodeId === excludeId) continue;
        var p = positions[nodeId];

        // bbox 안이면 즉시 target으로 인정
        if (x >= p.origTx + p.bboxX - 4 &&
            x <= p.origTx + p.bboxX + p.width  + 4 &&
            y >= p.origTy + p.bboxY - 4 &&
            y <= p.origTy + p.bboxY + p.height + 4) {
          return nodeId;
        }

        // 중심 근처면 snap 후보로 인정
        var d = Math.sqrt((x - p.cx) * (x - p.cx) + (y - p.cy) * (y - p.cy));
        if (d < SNAP && d < bestDist) {
          bestDist = d;
          best = nodeId;
        }
      }

      return best;
    },

    _highlightTarget: function (svgEl, nodeId) {
      // Mermaid 11의 prefix 포함 id도 처리하는 extractNodeId를 사용한다.
      var all = svgEl.querySelectorAll('.node');
      for (var j = 0; j < all.length; j++) {
        if (SvgPositionTracker.extractNodeId(all[j]) === nodeId) {
          all[j].classList.add('port-drag-target');
          return;
        }
      }
    },

    _clearTargetHighlight: function (svgEl, nodeId) {
      var targets = svgEl.querySelectorAll('.port-drag-target');
      for (var i = 0; i < targets.length; i++) {
        targets[i].classList.remove('port-drag-target');
      }
    },

    clearPorts: function () {
      if (!this._overlay) return;
      var ports = this._overlay.querySelectorAll('.conn-port, .conn-port-glow, .conn-port-hit');
      for (var i = 0; i < ports.length; i++) ports[i].remove();
    },

    _bringOverlayToFront: function (svgEl) {
      // appendChild를 다시 호출하면 SVG 내에서 가장 마지막 형제로 이동하므로
      // 레이어상 최상단으로 올릴 수 있다.
      if (this._overlay && this._overlay.parentNode === svgEl) {
        svgEl.appendChild(this._overlay);
      }
    }
  };

  global.PortDragHandler = PortDragHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SequencePositionTracker.js ===== */
(function (global) {
  'use strict';

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function readLabel(el) {
    if (!el) return '';
    var textEl = el.querySelector ? el.querySelector('text, tspan') : null;
    if (!textEl && el.tagName && /^(text|tspan)$/i.test(el.tagName)) textEl = el;
    return normalizeText(textEl ? textEl.textContent : el.textContent);
  }

  function bboxCenterY(el) {
    if (!el || !el.getBBox) return null;
    try {
      var box = el.getBBox();
      return box.y + box.height / 2;
    } catch (e) {
      return null;
    }
  }

  function collectUniqueMessageTextEls(svgEl) {
    var raw = svgEl.querySelectorAll('.messageText, text[class*="messageText"]');
    var results = [];
    var seenTextNodes = [];

    for (var i = 0; i < raw.length; i++) {
      var candidate = raw[i];
      var textEl = null;

      if (candidate.tagName && /^(text|tspan)$/i.test(candidate.tagName)) {
        textEl = candidate;
      } else if (candidate.querySelector) {
        textEl = candidate.querySelector('text, tspan');
      }

      if (!textEl || seenTextNodes.indexOf(textEl) !== -1) continue;
      seenTextNodes.push(textEl);
      results.push(textEl);
    }

    return results;
  }

  function collectParticipantCandidateEls(svgEl) {
    var raw = svgEl.querySelectorAll('.actor, .actor-top, .actor-bottom, g[class*="actor"]');
    var results = [];
    var seen = [];

    for (var i = 0; i < raw.length; i++) {
      if (seen.indexOf(raw[i]) !== -1) continue;
      seen.push(raw[i]);
      results.push(raw[i]);
    }

    return results;
  }

  var SequencePositionTracker = {
    collectParticipants: function (svgEl, model) {
      var participants = model.participants || [];
      var candidates = collectParticipantCandidateEls(svgEl);
      var byId = {};
      var used = [];

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (!el.getBBox) continue;
        var label = readLabel(el);
        var bbox;
        try { bbox = el.getBBox(); } catch (e) { continue; }
        if (!bbox || !bbox.width || !bbox.height) continue;

        for (var p = 0; p < participants.length; p++) {
          var participant = participants[p];
          if (used.indexOf(p) !== -1) continue;
          if (label !== normalizeText(participant.label || participant.id)) continue;
          byId[participant.id] = {
            id: participant.id,
            label: participant.label || participant.id,
            el: el,
            bbox: bbox,
            topBox: bbox,
            bottomBox: null,
            cx: bbox.x + bbox.width / 2,
            handleY: bbox.y + bbox.height + 22,
            lifelineTopY: bbox.y + bbox.height,
            lifelineBottomY: bbox.y + bbox.height + 260
          };
          used.push(p);
          break;
        }
      }

      // DOM 레이블 매칭이 실패한 경우 마지막 보정으로 순서 기반 대응을 시도한다.
      var fallbackCandidates = [];
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].classList && candidates[j].classList.contains('actor-bottom')) continue;
        fallbackCandidates.push(candidates[j]);
      }

      for (var k = 0; k < participants.length; k++) {
        var current = participants[k];
        if (byId[current.id]) continue;
        var fallback = fallbackCandidates[k];
        if (!fallback || !fallback.getBBox) continue;
        var fb;
        try { fb = fallback.getBBox(); } catch (e2) { continue; }
        byId[current.id] = {
          id: current.id,
          label: current.label || current.id,
          el: fallback,
          bbox: fb,
          topBox: fb,
          bottomBox: null,
          cx: fb.x + fb.width / 2,
          handleY: fb.y + fb.height + 22,
          lifelineTopY: fb.y + fb.height,
          lifelineBottomY: fb.y + fb.height + 260
        };
      }

      // Mermaid 테마/버전에 따라 actor-bottom 클래스가 없을 수 있으므로
      // 같은 라벨의 박스들 중 가장 위/아래를 직접 찾아 top/bottom box로 확정한다.
      for (var id in byId) {
        var matchedBoxes = [];
        for (var c = 0; c < candidates.length; c++) {
          var candidateEl = candidates[c];
          if (normalizeText(readLabel(candidateEl)) !== normalizeText(byId[id].label)) continue;
          try {
            matchedBoxes.push(candidateEl.getBBox());
          } catch (e3) {}
        }

        if (!matchedBoxes.length) continue;
        matchedBoxes.sort(function (a, b) { return a.y - b.y; });
        byId[id].topBox = matchedBoxes[0];
        byId[id].bottomBox = matchedBoxes[matchedBoxes.length - 1];
        byId[id].lifelineTopY = byId[id].topBox.y + byId[id].topBox.height;
        byId[id].lifelineBottomY = byId[id].bottomBox.y;
      }

      return byId;
    },

    collectParticipantTargets: function (svgEl, model) {
      var participants = model.participants || [];
      var candidates = collectParticipantCandidateEls(svgEl);
      var targets = [];

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var label = readLabel(el);
        if (!label) continue;

        for (var p = 0; p < participants.length; p++) {
          var participant = participants[p];
          if (normalizeText(participant.label || participant.id) !== label) continue;
          targets.push({
            id: participant.id,
            label: participant.label || participant.id,
            el: el
          });
          break;
        }
      }

      return targets;
    },

    collectMessages: function (svgEl, model) {
      var messages = model.messages || [];
      var textEls = collectUniqueMessageTextEls(svgEl);
      var lineCandidates = svgEl.querySelectorAll(
        '.messageLine0, .messageLine1, .messageLine2,' +
        'path[class*="messageLine"], line[class*="messageLine"]'
      );
      var results = [];
      var usedLineIdx = {};
      var textOccurrences = {};

      for (var i = 0; i < messages.length; i++) {
        var messageText = normalizeText(messages[i].text);
        var occurrence = textOccurrences[messageText] || 0;
        var textEl = null;
        var lineEl = null;
        var bbox = null;
        var hitBox = null;

        for (var t = 0, seen = 0; t < textEls.length; t++) {
          if (normalizeText(textEls[t].textContent) !== messageText) continue;
          if (seen === occurrence) {
            textEl = textEls[t];
            break;
          }
          seen++;
        }

        if (!textEl) {
          textEl = textEls[i] || null;
        }
        textOccurrences[messageText] = occurrence + 1;

        // Mermaid sequence SVG는 텍스트 순서는 비교적 안정적이지만,
        // 선(path/line) 순서는 activation 등과 섞여 흔들릴 수 있다.
        // 그래서 텍스트를 기준으로 같은 높이의 선을 찾아 매칭한다.
        if (textEl) {
          var textY = bboxCenterY(textEl);
          var bestIdx = -1;
          var bestDist = Infinity;

          for (var j = 0; j < lineCandidates.length; j++) {
            if (usedLineIdx[j]) continue;
            var candidateY = bboxCenterY(lineCandidates[j]);
            if (candidateY === null || textY === null) continue;
            var dist = Math.abs(candidateY - textY);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = j;
            }
          }

          if (bestIdx !== -1) {
            lineEl = lineCandidates[bestIdx];
            usedLineIdx[bestIdx] = true;
          }
        }

        if (!lineEl) {
          lineEl = lineCandidates[i] || null;
        }

        try {
          if (textEl && textEl.getBBox && lineEl && lineEl.getBBox) {
            var tb = textEl.getBBox();
            var lb = lineEl.getBBox();
            var minX = Math.min(tb.x, lb.x);
            var minY = Math.min(tb.y, lb.y);
            var maxX = Math.max(tb.x + tb.width, lb.x + lb.width);
            var maxY = Math.max(tb.y + tb.height, lb.y + lb.height);
            bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            hitBox = {
              x: minX - 8,
              y: (tb.y + tb.height / 2) - 12,
              width: (maxX - minX) + 16,
              height: 24
            };
          } else if (textEl && textEl.getBBox) {
            bbox = textEl.getBBox();
            hitBox = {
              x: bbox.x - 8,
              y: (bbox.y + bbox.height / 2) - 12,
              width: bbox.width + 16,
              height: 24
            };
          } else if (lineEl && lineEl.getBBox) {
            bbox = lineEl.getBBox();
            hitBox = {
              x: bbox.x - 8,
              y: (bbox.y + bbox.height / 2) - 12,
              width: bbox.width + 16,
              height: 24
            };
          }
        } catch (e) {
          bbox = null;
          hitBox = null;
        }

        results.push({
          index: i,
          textEl: textEl,
          lineEl: lineEl,
          bbox: bbox,
          hitBox: hitBox,
          rowY: hitBox ? (hitBox.y + hitBox.height / 2) : (bbox ? (bbox.y + bbox.height / 2) : null)
        });
      }

      return results;
    },

    collectInsertSlots: function (participantMap, messages) {
      var rows = [];
      for (var i = 0; i < messages.length; i++) {
        if (messages[i] && messages[i].rowY !== null && messages[i].rowY !== undefined) {
          rows.push(messages[i].rowY);
        }
      }

      rows.sort(function (a, b) { return a - b; });

      var ids = Object.keys(participantMap);
      if (!ids.length) return [];

      var sample = participantMap[ids[0]];
      if (!sample) return [];

      var slots = [];
      var topY = sample.lifelineTopY + 18;
      var bottomY = sample.lifelineBottomY - 18;

      var MIN_SLOT_GAP = 34;

      if (!rows.length) {
        slots.push({
          y: (topY + bottomY) / 2,
          insertIndex: 0
        });
        return slots;
      }

      slots.push({
        y: Math.max(topY + 12, rows[0] - 48),
        insertIndex: 0
      });

      for (var r = 0; r < rows.length - 1; r++) {
        var midY = (rows[r] + rows[r + 1]) / 2;
        slots.push({
          y: midY,
          insertIndex: r + 1
        });
      }

      // 맨 아래보다는 중간 삽입을 우선하지만, 마지막 뒤에 추가할 슬롯도 유지한다.
      slots.push({
        y: Math.min(bottomY - 12, rows[rows.length - 1] + 48),
        insertIndex: rows.length
      });

      // 맨 위/맨 아래 슬롯은 항상 유지하고,
      // 중간 슬롯끼리만 합쳐 + 버튼 겹침을 줄인다.
      if (slots.length <= 2) return slots;

      var deduped = [slots[0]];
      for (var s = 1; s < slots.length - 1; s++) {
        var current = slots[s];
        var prev = deduped[deduped.length - 1];
        if (prev !== slots[0] && Math.abs(current.y - prev.y) < MIN_SLOT_GAP) {
          prev.y = (prev.y + current.y) / 2;
          prev.insertIndex = Math.max(prev.insertIndex, current.insertIndex);
        } else {
          deduped.push(current);
        }
      }
      deduped.push(slots[slots.length - 1]);

      // 끝 슬롯은 항상 남기되, 바로 옆 슬롯과 최소 간격을 강제로 확보한다.
      if (deduped.length >= 2) {
        var first = deduped[0];
        var second = deduped[1];
        if (Math.abs(second.y - first.y) < MIN_SLOT_GAP) {
          first.y = Math.max(topY + 8, second.y - MIN_SLOT_GAP);
        }
      }

      if (deduped.length >= 2) {
        var last = deduped[deduped.length - 1];
        var beforeLast = deduped[deduped.length - 2];
        if (Math.abs(last.y - beforeLast.y) < MIN_SLOT_GAP) {
          last.y = Math.min(bottomY - 8, beforeLast.y + MIN_SLOT_GAP);
        }
      }

      return deduped;
    },

    refineParticipantLifelines: function (participantMap, messages) {
      var rows = [];
      for (var i = 0; i < messages.length; i++) {
        if (messages[i] && messages[i].rowY !== null && messages[i].rowY !== undefined) {
          rows.push(messages[i].rowY);
        }
      }

      if (!rows.length) return participantMap;

      rows.sort(function (a, b) { return a - b; });
      var topY = rows[0] - 26;
      var bottomY = rows[rows.length - 1] + 26;

      var ids = Object.keys(participantMap);
      for (var j = 0; j < ids.length; j++) {
        var participant = participantMap[ids[j]];
        if (!participant) continue;
        // 실제 보이는 lifeline 범위는 유지하되,
        // 메시지 구간이 그 안에 포함되도록만 보정한다.
        participant.lifelineTopY = Math.min(participant.lifelineTopY, topY);
        participant.lifelineBottomY = Math.max(participant.lifelineBottomY, bottomY);
      }

      return participantMap;
    }
  };

  global.SequencePositionTracker = SequencePositionTracker;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SequenceMessageDragHandler.js ===== */
(function (global) {
  'use strict';

  var SequenceMessageDragHandler = {
    _overlay: null,
    _dragLine: null,
    _targetLine: null,
    _handles: [],
    _hoverTargets: [],
    _dragging: false,

    initOverlay: function (svgEl) {
      var old = svgEl.querySelector('#sequence-drag-overlay');
      if (old) old.remove();

      var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'sequence-drag-overlay');
      overlay.style.pointerEvents = 'none';
      svgEl.appendChild(overlay);
      this._overlay = overlay;

      var dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dragLine.setAttribute('class', 'sequence-drag-line');
      dragLine.setAttribute('stroke', '#4f46e5');
      dragLine.setAttribute('stroke-width', '3');
      dragLine.setAttribute('stroke-dasharray', '6,4');
      dragLine.style.display = 'none';
      dragLine.style.pointerEvents = 'none';
      overlay.appendChild(dragLine);
      this._dragLine = dragLine;

      var targetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      targetLine.setAttribute('class', 'sequence-target-line');
      targetLine.style.display = 'none';
      targetLine.style.pointerEvents = 'none';
      overlay.appendChild(targetLine);
      this._targetLine = targetLine;

      this._handles = [];
      this._hoverTargets = [];
      this._dragging = false;
    },

    attach: function (svgEl, participantMap, insertSlots, ctx) {
      if (!this._overlay) this.initOverlay(svgEl);
      this.clearHandles();
      this._clearHoverTargets();
      this._bringOverlayToFront(svgEl);

      var ids = Object.keys(participantMap);
      var rows = (insertSlots && insertSlots.length) ? insertSlots : [];

      // 참가자가 1명뿐인 경우에는 hover 없이 기본 self-message 슬롯을 바로 보여 준다.
      if (ids.length === 1) {
        var onlyParticipant = participantMap[ids[0]];
        if (onlyParticipant) {
          var gapMidY = (onlyParticipant.lifelineTopY + onlyParticipant.lifelineBottomY) / 2;
          if (onlyParticipant.topBox && onlyParticipant.bottomBox) {
            gapMidY = (onlyParticipant.topBox.y + onlyParticipant.topBox.height + onlyParticipant.bottomBox.y) / 2;
          }
          var singleSlot = {
            y: gapMidY,
            insertIndex: 0
          };
          this._addHandle(svgEl, onlyParticipant, singleSlot, participantMap, ctx);
        }
        return;
      }

      for (var i = 0; i < ids.length; i++) {
        this._attachHoverZone(svgEl, participantMap[ids[i]], rows, participantMap, ctx);
      }
    },

    _attachHoverZone: function (svgEl, participant, slots, participantMap, ctx) {
      if (!participant || !participant.bbox) return;
      var self = this;
      var zone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      zone.setAttribute('class', 'sequence-lifeline-hit');
      zone.setAttribute('x', participant.cx - 16);
      zone.setAttribute('y', participant.lifelineTopY);
      zone.setAttribute('width', '32');
      zone.setAttribute('height', Math.max(40, participant.lifelineBottomY - participant.lifelineTopY));
      zone.style.pointerEvents = 'all';
      zone.style.cursor = 'crosshair';
      this._overlay.appendChild(zone);

      zone.addEventListener('mouseenter', function () {
        if (self._dragging) return;
        self.clearHandles();
        for (var i = 0; i < slots.length; i++) {
          self._addHandle(svgEl, participant, slots[i], participantMap, ctx);
        }
      });

      zone.addEventListener('mouseleave', function (e) {
        var rel = e.relatedTarget;
        if (rel && rel.closest && rel.closest('#sequence-drag-overlay')) return;
        self.clearHandles();
      });

      this._hoverTargets.push(zone);
    },

    _addHandle: function (svgEl, participant, slot, participantMap, ctx) {
      var x = participant.cx;
      var y = slot.y;
      var self = this;

      var hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('class', 'sequence-plus-hit');
      hit.setAttribute('cx', x);
      hit.setAttribute('cy', y);
      hit.setAttribute('r', '18');
      hit.style.pointerEvents = 'all';
      hit.style.cursor = 'crosshair';
      this._overlay.appendChild(hit);

      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'sequence-plus-btn');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '12');
      circle.style.pointerEvents = 'none';
      this._overlay.appendChild(circle);

      var plus = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      plus.setAttribute('class', 'sequence-plus-label');
      plus.setAttribute('x', x);
      plus.setAttribute('y', y + 4);
      plus.setAttribute('text-anchor', 'middle');
      plus.style.pointerEvents = 'none';
      plus.textContent = '+';
      this._overlay.appendChild(plus);

      hit.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._startDrag(svgEl, participant.id, x, y, slot.insertIndex, participantMap, ctx);
      });

      this._handles.push(hit, circle, plus);
    },

    _startDrag: function (svgEl, fromId, startX, startY, insertIndex, participantMap, ctx) {
      var self = this;
      this._bringOverlayToFront(svgEl);
      this._dragging = true;
      this.clearHandles();

      this._dragLine.setAttribute('x1', startX);
      this._dragLine.setAttribute('y1', startY);
      this._dragLine.setAttribute('x2', startX);
      this._dragLine.setAttribute('y2', startY);
      this._dragLine.style.display = '';

      var currentTarget = null;

      var onMove = function (me) {
        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
        self._dragLine.setAttribute('x2', svgPt.x);
        self._dragLine.setAttribute('y2', startY);

        var target = self._findTarget(svgPt.x, svgPt.y, fromId, startY, participantMap);
        if (target !== currentTarget) {
          if (currentTarget) self._clearTargetHighlight(participantMap[currentTarget]);
          currentTarget = target;
          if (currentTarget) self._highlightTarget(participantMap[currentTarget]);
        }
      };

      var onUp = function (me) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        self._dragLine.style.display = 'none';
        self._targetLine.style.display = 'none';
        self._dragging = false;

        if (currentTarget) self._clearTargetHighlight(participantMap[currentTarget]);

        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
        var target = self._findTarget(svgPt.x, svgPt.y, fromId, startY, participantMap);
        if (target) {
          ctx.emit('add-sequence-message', {
            fromId: fromId,
            toId: target,
            text: 'new msg',
            insertIndex: insertIndex
          });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },

    _findTarget: function (x, y, fromId, rowY, participantMap) {
      var best = null;
      var bestDist = Infinity;
      var SNAP_X = 56;
      var SNAP_Y = 22;
      var ids = Object.keys(participantMap);

      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var p = participantMap[id];
        if (!p || !p.bbox) continue;

        var cx = p.cx;
        var dx = Math.abs(x - cx);
        var dy = Math.abs(y - rowY);
        if (dy < SNAP_Y && dx < SNAP_X && dx < bestDist) {
          bestDist = dx;
          best = id;
        }
      }

      return best;
    },

    _highlightTarget: function (el) {
      if (!el) return;
      if (el.el) {
        el.el.classList.add('sequence-participant-drag-target');
        this._targetLine.setAttribute('x1', el.cx);
        this._targetLine.setAttribute('x2', el.cx);
        this._targetLine.setAttribute('y1', el.lifelineTopY);
        this._targetLine.setAttribute('y2', el.lifelineBottomY);
        this._targetLine.style.display = '';
        return;
      }
      el.classList.add('sequence-participant-drag-target');
    },

    _clearTargetHighlight: function (el) {
      if (!el) return;
      if (el.el) {
        el.el.classList.remove('sequence-participant-drag-target');
        return;
      }
      el.classList.remove('sequence-participant-drag-target');
    },

    clearHandles: function () {
      for (var i = 0; i < this._handles.length; i++) this._handles[i].remove();
      this._handles = [];
    },

    _clearHoverTargets: function () {
      for (var i = 0; i < this._hoverTargets.length; i++) this._hoverTargets[i].remove();
      this._hoverTargets = [];
    },

    _bringOverlayToFront: function (svgEl) {
      if (this._overlay && this._overlay.parentNode === svgEl) {
        svgEl.appendChild(this._overlay);
      }
    }
  };

  global.SequenceMessageDragHandler = SequenceMessageDragHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SequenceSvgHandler.js ===== */
(function (global) {
  'use strict';

  function getMessageOperatorBase(operator) {
    var suffix = '';
    if (/[+-]$/.test(operator)) {
      suffix = operator.slice(-1);
      operator = operator.slice(0, -1);
    }
    return { base: operator || '->>', suffix: suffix };
  }

  var SequenceSvgHandler = {
    attach: function (svgEl, model, ctx) {
      var participantMap = SequencePositionTracker.collectParticipants(svgEl, model);
      var participantTargets = SequencePositionTracker.collectParticipantTargets(svgEl, model);
      var messages = SequencePositionTracker.collectMessages(svgEl, model);
      participantMap = SequencePositionTracker.refineParticipantLifelines(participantMap, messages);
      var insertSlots = SequencePositionTracker.collectInsertSlots(participantMap, messages);

      SequenceMessageDragHandler.initOverlay(svgEl);
      SequenceMessageDragHandler.attach(svgEl, participantMap, insertSlots, ctx);
      SequenceSvgHandler._attachParticipants(participantTargets, svgEl, ctx);
      SequenceSvgHandler._attachMessages(messages, svgEl, ctx);
    },

    _attachParticipants: function (participantTargets, svgEl, ctx) {
      for (var i = 0; i < participantTargets.length; i++) {
        SequenceSvgHandler._attachParticipant(participantTargets[i], svgEl, ctx);
      }
    },

    _attachParticipant: function (data, svgEl, ctx) {
      var el = data.el;
      if (!el) return;
      el.style.cursor = 'pointer';

      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedSequenceParticipantId: data.id,
          selectedSequenceMessageIndex: null,
          sequenceToolbar: {
            type: 'participant',
            id: data.id,
            kind: data.kind || 'participant',
            x: e.clientX,
            y: e.clientY
          }
        });
        ctx.emit('sequence-participant-selected', data.id);
      });

      el.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        SequenceSvgHandler.startParticipantEdit(data.id, el, ctx);
      });

      ctx.watchSequenceParticipantSelection(data.id, el);
    },

    _attachMessages: function (messages, svgEl, ctx) {
      for (var i = 0; i < messages.length; i++) {
        SequenceSvgHandler._attachMessage(messages[i], svgEl, ctx);
      }
    },

    _attachMessage: function (data, svgEl, ctx) {
      if (!data.lineEl && !data.textEl) return;
      var hitEl = SequenceSvgHandler._makeMessageHit(svgEl, data);
      var visualEl = data.lineEl || data.textEl;
      var textEl = data.textEl;

      if (!hitEl) hitEl = visualEl;
      hitEl.style.cursor = 'pointer';

      var onSelect = function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedSequenceParticipantId: null,
          selectedSequenceMessageIndex: data.index,
          sequenceToolbar: {
            type: 'message',
            index: data.index,
            x: e.clientX,
            y: e.clientY
          }
        });
        ctx.emit('sequence-message-selected', data.index);
      };

      hitEl.addEventListener('click', onSelect);
      if (textEl && textEl !== hitEl) textEl.addEventListener('click', onSelect);

      var onEdit = function (e) {
        e.preventDefault();
        e.stopPropagation();
        SequenceSvgHandler.startMessageEdit(data.index, e.clientX, e.clientY, svgEl, ctx);
      };

      hitEl.addEventListener('dblclick', onEdit);
      if (textEl && textEl !== hitEl) textEl.addEventListener('dblclick', onEdit);

      hitEl.addEventListener('mouseenter', function () {
        if (visualEl) visualEl.classList.add('sequence-message-hovered');
        if (textEl) textEl.classList.add('sequence-message-text-hovered');
      });
      hitEl.addEventListener('mouseleave', function () {
        if (visualEl) visualEl.classList.remove('sequence-message-hovered');
        if (textEl) textEl.classList.remove('sequence-message-text-hovered');
      });

      ctx.watchSequenceMessageSelection(data.index, visualEl, textEl);
      if (ctx.watchSequenceMessageHitSelection) {
        ctx.watchSequenceMessageHitSelection(data.index, hitEl);
      }
    },

    _makeMessageHit: function (svgEl, data) {
      if (!data || (!data.lineEl && !data.textEl && !data.bbox)) return null;
      var overlay = svgEl.querySelector('#sequence-message-hit-overlay');
      if (!overlay) {
        overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        overlay.setAttribute('id', 'sequence-message-hit-overlay');
        overlay.style.pointerEvents = 'all';
        svgEl.appendChild(overlay);
      }

      try {
        if (data.hitBox && data.hitBox.width && data.hitBox.height) {
          var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('class', 'sequence-hit-rect');
          rect.setAttribute('x', data.hitBox.x);
          rect.setAttribute('y', data.hitBox.y);
          rect.setAttribute('width', data.hitBox.width);
          rect.setAttribute('height', data.hitBox.height);
          rect.setAttribute('rx', '8');
          rect.setAttribute('fill', '#000');
          rect.setAttribute('fill-opacity', '0.003');
          rect.style.pointerEvents = 'all';
          overlay.appendChild(rect);
          return rect;
        }

        var fallback = data.lineEl || data.textEl;
        if (!fallback) return null;
        var ghost = fallback.cloneNode(false);
        ghost.removeAttribute('marker-end');
        ghost.removeAttribute('marker-start');
        ghost.setAttribute('stroke', '#000');
        ghost.setAttribute('stroke-opacity', '0.003');
        ghost.setAttribute('stroke-width', '18');
        ghost.setAttribute('fill', 'none');
        ghost.style.pointerEvents = 'stroke';
        overlay.appendChild(ghost);
        return ghost;
      } catch (e) {
        return null;
      }
    },

    startParticipantEdit: function (participantId, participantEl, ctx) {
      var participant = ctx.findSequenceParticipant(participantId);
      if (!participant) return;
      var rect = participantEl.getBoundingClientRect();

      ctx.setState({
        sequenceToolbar: null,
        editingSequenceParticipantId: participantId,
        editingSequenceParticipantText: participant.label || participant.id,
        sequenceParticipantEditStyle: {
          position: 'fixed',
          left: (rect.left + rect.width / 2 - 90) + 'px',
          top: (rect.top + rect.height / 2 - 18) + 'px',
          zIndex: 1000,
          width: Math.max(160, rect.width + 28) + 'px'
        }
      });
      ctx.focusSequenceParticipantInput();
    },

    startMessageEdit: function (messageIndex, clientX, clientY, svgEl, ctx) {
      var message = ctx.findSequenceMessage(messageIndex);
      if (!message) return;
      ctx.setState({
        sequenceToolbar: null,
        editingSequenceMessageIndex: messageIndex,
        editingSequenceMessageText: message.text || '',
        sequenceMessageEditStyle: {
          position: 'fixed',
          left: (clientX - 110) + 'px',
          top: (clientY - 22) + 'px',
          zIndex: 1000,
          width: '220px'
        }
      });
      ctx.focusSequenceMessageInput();
    },

    // solid(단일 dash) ↔ dotted(이중 dash) 토글
    toggleMessageLineType: function (message) {
      var parts = getMessageOperatorBase(message.operator || '->>');
      var TOGGLE = {
        '->>': '-->>',  '-->>': '->>',
        '->':  '-->',   '-->':  '->',
        '-x':  '--x',   '--x':  '-x',
        '-)':  '--)',   '--)':  '-)'
      };
      var nextBase = TOGGLE[parts.base] !== undefined ? TOGGLE[parts.base] : parts.base;
      return nextBase + parts.suffix;
    }
  };

  global.SequenceSvgHandler = SequenceSvgHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/components/MermaidEditor.js ===== */
/**
 * MermaidEditor component
 * Handles the raw Mermaid script textarea for the left editor pane.
 */

Vue.component('mermaid-editor', {
  props: {
    value: { type: String, default: '' },
    error: { type: String, default: '' },
    diagramType: { type: String, default: 'flowchart' }
  },
  data: function () {
    return {
      localValue: this.value,
      debounceTimer: null
    };
  },
  watch: {
    value: function (newVal) {
      if (newVal !== this.localValue) {
        this.localValue = newVal;
      }
    }
  },
  computed: {
    placeholderText: function () {
      if (this.diagramType === 'sequenceDiagram') {
        return 'sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    John-->>-Alice: Hi Alice, I can hear you!';
      }
      return 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]';
    }
  },
  methods: {
    onInput: function (e) {
      this.localValue = e.target.value;
      var self = this;
      if (this.diagramType === 'sequenceDiagram') {
        clearTimeout(this.debounceTimer);
        this.$emit('input', this.localValue);
        return;
      }
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(function () {
        self.$emit('input', self.localValue);
      }, 300);
    },
    onKeyDown: function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var textarea = e.target;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var value = textarea.value;
        textarea.value = value.substring(0, start) + '    ' + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
        this.localValue = textarea.value;
        this.$emit('input', this.localValue);
      }
    }
  },
  template: '\
    <div class="panel panel--editor">\
      <div class="code-editor">\
        <textarea\
          class="code-editor__textarea"\
          :value="localValue"\
          @input="onInput"\
          @keydown="onKeyDown"\
          :placeholder="placeholderText"\
          spellcheck="false"\
        ></textarea>\
        <div v-if="error" class="code-editor__error">\
          <span>!</span><span>{{ error }}</span>\
        </div>\
      </div>\
    </div>\
  '
});


/* ===== src/components/MermaidToolbar.js ===== */
/**
 * MermaidToolbar component
 * Keeps the viewport controls separated from edit actions.
 */

Vue.component('mermaid-toolbar', {
  SHAPES: SvgNodeHandler.SHAPES,
  COLOR_PALETTE: [
    { key: 'red',    value: '#ef4444' },
    { key: 'orange', value: '#f97316' },
    { key: 'yellow', value: '#facc15' },
    { key: 'green',  value: '#22c55e' },
    { key: 'blue',   value: '#3b82f6' },
    { key: 'violet', value: '#a855f7' }
  ],
  props: {
    diagramType: { type: String, default: 'flowchart' },
    direction: { type: String, default: 'TD' },
    canUndo: { type: Boolean, default: false },
    canRedo: { type: Boolean, default: false },
    autonumber: { type: Boolean, default: false }
  },
  data: function () {
    return {
      showShapePicker: false,
      pendingNodeText: 'Node',
      pendingNodeColor: ''
    };
  },
  computed: {
    isFlowchart: function () {
      return this.diagramType !== 'sequenceDiagram';
    }
  },
  methods: {
    toggleShapePicker: function () {
      this.showShapePicker = !this.showShapePicker;
      if (this.showShapePicker) {
        this.pendingNodeText = 'Node';
        this.pendingNodeColor = '';
      }
    },
    addNode: function (shape) {
      this.showShapePicker = false;
      this.$emit('add-node', {
        shape: shape,
        text: (this.pendingNodeText || '').trim() || 'Node',
        fill: this.pendingNodeColor || ''
      });
    },
    addSequenceParticipant: function () { this.$emit('add-sequence-participant'); },
    addSequenceActor: function () { this.$emit('add-sequence-actor'); },
    addSequenceMessage: function () { this.$emit('add-sequence-message'); },
    toggleAutonumber: function () { this.$emit('toggle-autonumber'); },
    undo: function () { this.$emit('undo'); },
    redo: function () { this.$emit('redo'); },
    changeDirection: function (e) { this.$emit('change-direction', e.target.value); },
    zoomOut: function () { this.$emit('zoom-out'); },
    zoomIn: function () { this.$emit('zoom-in'); },
    fitView: function () { this.$emit('fit-view'); },
    copySvg: function () { this.$emit('copy-svg'); },
    exportPng: function () { this.$emit('export-png'); },
    _handleDocumentClick: function (e) {
      if (!this.showShapePicker) return;
      if (this.$el && this.$el.contains(e.target)) return;
      this.showShapePicker = false;
    }
  },
  mounted: function () {
    document.addEventListener('mousedown', this._handleDocumentClick, true);
  },
  beforeDestroy: function () {
    document.removeEventListener('mousedown', this._handleDocumentClick, true);
  },
  template: '\
    <div class="toolbar">\
      <div class="toolbar__sub">\
        <div class="toolbar__group">\
          <div v-if="isFlowchart" class="toolbar__add-node-wrap">\
            <button class="toolbar__btn toolbar__btn--active" @click="toggleShapePicker" title="Add Node">\
              <span class="toolbar__btn-icon">+</span> Add Node\
            </button>\
            <div v-if="showShapePicker" class="toolbar__shape-picker" @click.stop>\
              <div class="toolbar__shape-picker-title">Select Shape</div>\
              <input\
                class="toolbar__shape-input"\
                v-model="pendingNodeText"\
                type="text"\
                maxlength="100"\
                placeholder="Node name"\
                @keydown.enter.prevent="addNode(\'rect\')"\
              />\
              <div class="toolbar__shape-picker-title toolbar__shape-picker-title--compact">Color</div>\
              <div class="context-menu__color-row toolbar__shape-color-row">\
                <button\
                  class="context-menu__color-btn context-menu__color-btn--clear"\
                  :class="{ \'context-menu__color-btn--selected\': !pendingNodeColor }"\
                  title="default"\
                  @click="pendingNodeColor = \'\'"\
                >x</button>\
                <button\
                  v-for="color in $options.COLOR_PALETTE"\
                  :key="color.key"\
                  class="context-menu__color-btn"\
                  :class="{ \'context-menu__color-btn--selected\': pendingNodeColor === color.value }"\
                  :style="{ backgroundColor: color.value }"\
                  :title="color.key"\
                  @click="pendingNodeColor = color.value"\
                ></button>\
              </div>\
              <div class="toolbar__shape-picker-grid">\
                <button\
                  v-for="s in $options.SHAPES"\
                  :key="s.key"\
                  class="toolbar__shape-picker-btn"\
                  :title="s.name"\
                  @click="addNode(s.key)"\
                >\
                  <span class="context-menu__shape-icon" :class="\'context-menu__shape-icon--\' + s.key"></span>\
                  <span class="context-menu__shape-text">{{ s.name }}</span>\
                </button>\
              </div>\
            </div>\
          </div>\
          <button v-else class="toolbar__btn toolbar__btn--active" @click="addSequenceParticipant" title="Add participant">\
            <span class="toolbar__btn-icon">+</span> Participant\
          </button>\
          <button v-if="!isFlowchart" class="toolbar__btn" :class="{ \'toolbar__btn--active\': autonumber }" @click="toggleAutonumber" title="Toggle autonumber">\
            AutoNumber\
          </button>\
        </div>\
        <div class="toolbar__group">\
          <button class="toolbar__btn" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">Undo</button>\
          <button class="toolbar__btn" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">Redo</button>\
        </div>\
        <div v-if="isFlowchart" class="toolbar__group">\
          <select class="toolbar__select" :value="direction" @change="changeDirection" title="Layout direction">\
            <option value="TD">Top Down</option>\
            <option value="LR">Left Right</option>\
            <option value="BT">Bottom Top</option>\
            <option value="RL">Right Left</option>\
          </select>\
        </div>\
        <div class="toolbar__group toolbar__group--zoom">\
          <button class="toolbar__icon-btn" @click="zoomOut" title="Zoom Out">-</button>\
          <button class="toolbar__icon-btn" @click="zoomIn" title="Zoom In">+</button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--wide" @click="fitView" title="Fit to View">Fit</button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--wide" @click="exportPng" title="Export PNG">PNG</button>\
        </div>\
      </div>\
    </div>\
  '
});


/* ===== src/components/MermaidPreview.js ===== */
﻿/**
 * MermaidPreview 컴포넌트
 * - SvgPositionTracker : 좌표 수집
 * - PortDragHandler    : 4방향 포트 drag-to-connect
 * - SvgNodeHandler     : 노드 클릭 / 더블클릭 / 우클릭 / hover
 * - SvgEdgeHandler     : 엣지 클릭 / 라벨 / 편집
 */

Vue.component('mermaid-preview', {
  props: {
    model: {
      type: Object,
      default: function () {
        return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
      }
    }
  },

  // 템플릿에서 사용하는 전체 shape 목록
  SHAPES: SvgNodeHandler.SHAPES,
  LINE_TYPE_OPTIONS: [
    { operator: '->>',  label: '───▶' },
    { operator: '-->>',  label: '···▶' },
    { operator: '->',   label: '───' },
    { operator: '-->',   label: '···' },
    { operator: '-x',   label: '───✕' },
    { operator: '--x',   label: '···✕' },
    { operator: '-)',   label: '───)' },
    { operator: '--)',  label: '···)' }
  ],
  COLOR_PALETTE: [
    { key: 'red',    value: '#ef4444' },
    { key: 'orange', value: '#f97316' },
    { key: 'yellow', value: '#facc15' },
    { key: 'green',  value: '#22c55e' },
    { key: 'blue',   value: '#3b82f6' },
    { key: 'violet', value: '#a855f7' }
  ],

  data: function () {
    return {
      svgContent:  '',
      renderError: '',
      renderCounter: 0,
      renderToken: 0,

      selectedNodeId:    null,
      selectedEdgeIndex: null,
      selectedSequenceParticipantId: null,
      selectedSequenceMessageIndex: null,

      // 노드 인라인 편집
      editingNodeId:  null,
      editingText:    '',
      editingNodeColor: '#e2e8f0',
      editInputStyle: {},

      // 엣지 인라인 편집
      editingEdgeIndex:    null,
      editingEdgeText:     '',
      editingEdgeColor:    '#5c7ab0',
      edgeEditInputStyle:  {},

      // 시퀀스 인라인 편집
      editingSequenceParticipantId: null,
      editingSequenceParticipantText: '',
      sequenceParticipantEditStyle: {},
      editingSequenceMessageIndex: null,
      editingSequenceMessageText: '',
      sequenceMessageEditStyle: {},

      // 컨텍스트 UI 상태
      contextMenu:  null,   // { nodeId, x, y }
      edgeToolbar:  null,   // { edgeIndex, x, y } - 플로우차트 엣지 액션 바
      sequenceToolbar: null, // { type, id|index, x, y }
      lineTypePicker: false,      // sequence message line type 선택 모드

      // 포트 드래그 상태
      portDragging:  false,
      hoveredNodeId: null,

      // CSS transform 줌/패닝 상태
      cfgZoom: 1.0,
      panX: 0,
      panY: 0,

      // SVG 내부 좌표/뷰포트 상태
      _positions: {},
      _elements:  {},
      _edgePaths: [],
      _svgEl: null,
      _fitAfterRender: false,
      _panState: null,
      _panMouseUpHandler: null
    };
  },

  watch: {
    model: {
      handler: function () { this.renderDiagram(); },
      deep: true
    },
    selectedEdgeIndex: function () {
      this._syncSelectedEdgeVisuals();
    },
    sequenceToolbar: function (val) {
      if (!val) this.lineTypePicker = false;
    },
  },

  mounted: function () {
    this.renderDiagram();
    var self = this;

    this._windowResizeHandler = function () {
      if (!self._svgEl) return;
      if (self._resizeFrame) cancelAnimationFrame(self._resizeFrame);
      self._resizeFrame = requestAnimationFrame(function () {
        self.fitView();
      });
    };
    window.addEventListener('resize', this._windowResizeHandler);

    // 전역 클릭 시 컨텍스트 메뉴와 엣지 툴바 닫기
    document.addEventListener('click', function () {
      var hadEdgeToolbar = !!self.edgeToolbar;
      self.contextMenu = null;
      self.edgeToolbar = null;
      self.sequenceToolbar = null;
      if (hadEdgeToolbar && self.editingEdgeIndex === null) {
        self.selectedEdgeIndex = null;
        self._clearEdgeVisualState();
      }
    });

    this._pointerDownCommitHandler = function (e) {
      var target = e.target;
      if (target && target.closest && target.closest('.node-edit-overlay')) return;
      self._confirmActiveEdits();
    };
    document.addEventListener('mousedown', this._pointerDownCommitHandler, true);

    this._suppressClickAfterPanHandler = function (e) {
      if (!self._suppressClickAfterPan) return;
      self._suppressClickAfterPan = false;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', this._suppressClickAfterPanHandler, true);

    // 전역 키 입력: Delete, Escape, Ctrl+Z/Y
    document.addEventListener('keydown', function (e) {
      // input / textarea 사용 중에는 전역 단축키를 막는다.
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.editingNodeId !== null || self.editingEdgeIndex !== null ||
            self.editingSequenceParticipantId !== null || self.editingSequenceMessageIndex !== null) return;
        if (self.selectedNodeId || self.selectedEdgeIndex !== null) {
          self.$emit('delete-selected', {
            nodeId:    self.selectedNodeId,
            edgeIndex: self.selectedEdgeIndex
          });
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
        } else if (self.selectedSequenceParticipantId || self.selectedSequenceMessageIndex !== null) {
          self.$emit('delete-selected', {
            sequenceParticipantId: self.selectedSequenceParticipantId,
            sequenceMessageIndex: self.selectedSequenceMessageIndex
          });
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
        }
      }

      if (e.key === 'Escape') {
        self.cancelNodeEdit();
        self.cancelEdgeEdit();
        self.cancelSequenceParticipantEdit();
        self.cancelSequenceMessageEdit();
        self.selectedNodeId    = null;
        self.selectedEdgeIndex = null;
        self.selectedSequenceParticipantId = null;
        self.selectedSequenceMessageIndex = null;
        self.contextMenu       = null;
        self.edgeToolbar       = null;
        self.sequenceToolbar   = null;
        self.portDragging      = false;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        self.$emit('undo');
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        self.$emit('redo');
      }
    });
  },

  beforeDestroy: function () {
    if (this._pointerDownCommitHandler) {
      document.removeEventListener('mousedown', this._pointerDownCommitHandler, true);
      this._pointerDownCommitHandler = null;
    }
    if (this._suppressClickAfterPanHandler) {
      document.removeEventListener('click', this._suppressClickAfterPanHandler, true);
      this._suppressClickAfterPanHandler = null;
    }
    if (this._windowResizeHandler) {
      window.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._resizeFrame) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = null;
    }
    if (this._panMouseUpHandler) {
      document.removeEventListener('mouseup', this._panMouseUpHandler);
      this._panMouseUpHandler = null;
    }
  },

  methods: {

    _confirmActiveEdits: function () {
      if (this.editingNodeId) this.confirmNodeEdit();
      if (this.editingEdgeIndex !== null) this.confirmEdgeEdit();
      if (this.editingSequenceParticipantId) this.confirmSequenceParticipantEdit();
      if (this.editingSequenceMessageIndex !== null) this.confirmSequenceMessageEdit();
    },

    // 공통 렌더 유틸

    _hasRenderableContent: function (model) {
      if (!model) return false;
      if (model.type === 'sequenceDiagram') {
        return !!((model.participants && model.participants.length) || (model.messages && model.messages.length));
      }
      return !!((model.nodes && model.nodes.length) || (model.edges && model.edges.length));
    },

    _isScriptHeaderOnly: function (script) {
      var trimmed = (script || '').trim();
      return /^flowchart\s+(TD|TB|BT|LR|RL)\s*$/i.test(trimmed) ||
        /^sequenceDiagram\s*$/i.test(trimmed);
    },

    renderDiagram: function () {
      var m = this.model;
      if (!this._hasRenderableContent(m)) {
        this.svgContent  = '';
        this.renderError = '';
        return;
      }

      var script = MermaidGenerator.generate(m);
      if (!script || this._isScriptHeaderOnly(script)) {
        this.svgContent = '';
        this._svgEl = null;
        this.cfgZoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        return;
      }

      var self = this;
      self.renderCounter++;
      self.renderToken++;
      var renderToken = self.renderToken;
      var containerId = 'mermaid-render-' + self.renderCounter;
      self.renderError = '';
      self.svgContent = '';

      try {
        window.mermaid.render(containerId, script).then(function (result) {
          // 가장 최신 render 요청만 반영하고 이전 결과는 버린다.
          if (renderToken !== self.renderToken) return;
          self.svgContent  = result.svg;
          self.renderError = '';
          self.$nextTick(function () { self.postRenderSetup(); });
        }).catch(function (err) {
          if (renderToken !== self.renderToken) return;
          self.svgContent = '';
          self.renderError = err.message || 'Render error';
          var errEl = document.getElementById('d' + containerId);
          if (errEl) errEl.remove();
        });
      } catch (e) {
        if (renderToken !== self.renderToken) return;
        self.svgContent = '';
        self.renderError = e.message || 'Render error';
      }
    },

    // 공통 렌더 후 인터랙션 연결 유틸

    postRenderSetup: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      var fitAfter = this._fitAfterRender;
      this._fitAfterRender = false;

      // overlay와 interaction이 같은 좌표계를 쓰도록 viewBox를 먼저 맞춘다.
      this._setupViewport(svgEl, canvas, fitAfter);

      // 노드 위치와 SVG 요소 수집
      var isFlowchart = this.model && this.model.type !== 'sequenceDiagram';

      if (isFlowchart) {
        var collected    = SvgPositionTracker.collectNodePositions(svgEl);
        this._positions  = collected.positions;
        this._elements   = collected.elements;
        this._edgePaths  = SvgPositionTracker.collectEdgePaths(svgEl, this.model.edges);

        // 하위 핸들러에 넘길 bridge 객체 구성
        var ctx = this._buildCtx(svgEl);

        // 엣지 ghost overlay를 먼저 구성
        SvgEdgeHandler.initGhostOverlay(svgEl);
        SvgEdgeHandler.attach(svgEl, this._edgePaths, this._positions, ctx);

        // 포트 overlay는 ghost보다 위에 올라온다.
        PortDragHandler.initOverlay(svgEl);

        // 노드 인터랙션 연결
        SvgNodeHandler.attach(svgEl, this._positions, this._elements, ctx);

        if (this._pendingContextMenuNodeId) {
          this._openContextMenuForNode(this._pendingContextMenuNodeId);
        }
      } else {
        this._positions = {};
        this._elements = {};
        this._edgePaths = [];
        SequenceSvgHandler.attach(svgEl, this.model, this._buildCtx(svgEl));
      }

      // 배경 클릭 시 선택 해제
      var self = this;
      svgEl.addEventListener('click', function (e) {
        if (e.target === svgEl ||
            (e.target.tagName && e.target.tagName.toLowerCase() === 'svg')) {
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
        }
      });

      this._refreshFloatingUiPositions();
      this._syncSelectedEdgeVisuals();

    },

    scheduleFit: function () {
      this._fitAfterRender = true;
    },

    openContextMenuForNode: function (nodeId) {
      this._pendingContextMenuNodeId = nodeId;
      this._openContextMenuForNode(nodeId);
    },

    _openContextMenuForNode: function (nodeId) {
      var nodeEl = this._elements && this._elements[nodeId];
      if (!nodeEl) return;

      var rect = nodeEl.getBoundingClientRect();
      var previewRect = this.$refs.canvas && this.$refs.canvas.getBoundingClientRect
        ? this.$refs.canvas.getBoundingClientRect()
        : this.$el.getBoundingClientRect();
      this.selectedNodeId = nodeId;
      this.selectedEdgeIndex = null;
      this.contextMenu = {
        nodeId: nodeId,
        anchorType: 'node',
        x: Math.round(rect.left - previewRect.left + rect.width / 2),
        y: Math.round(rect.top - previewRect.top + Math.max(18, rect.height * 0.35))
      };
      this._pendingContextMenuNodeId = null;
    },

    _refreshFloatingUiPositions: function () {
      var previewRect = this.$refs.canvas && this.$refs.canvas.getBoundingClientRect
        ? this.$refs.canvas.getBoundingClientRect()
        : (this.$el && this.$el.getBoundingClientRect ? this.$el.getBoundingClientRect() : null);
      if (this.contextMenu && this.contextMenu.anchorType === 'node') {
        var nodeEl = this._elements && this._elements[this.contextMenu.nodeId];
        if (nodeEl && previewRect) {
          var nodeRect = nodeEl.getBoundingClientRect();
          this.contextMenu = Object.assign({}, this.contextMenu, {
            x: Math.round(nodeRect.left - previewRect.left + nodeRect.width + 10),
            y: Math.round(nodeRect.top - previewRect.top + Math.min(24, nodeRect.height * 0.5))
          });
        }
      }

      if (this.edgeToolbar && this.edgeToolbar.anchorType === 'edge') {
        return;
      }
    },

    _syncSelectedEdgeVisuals: function () {
      var selectedIndex = this.selectedEdgeIndex;
      var edgePaths = this._edgePaths || [];
      for (var i = 0; i < edgePaths.length; i++) {
        var edgeData = edgePaths[i];
        if (!edgeData) continue;

        var isSelected = edgeData.index === selectedIndex;
        var edgeEl = edgeData.el;
        var pathEl = edgeData.path;
        var hitEl = edgeData.hit;

        if (edgeEl && edgeEl.classList) {
          edgeEl.classList.toggle('edge-selected', isSelected);
          edgeEl.classList.toggle('edge-hovered', isSelected);
        }

        if (pathEl && pathEl.classList) {
          pathEl.classList.toggle('edge-selected', isSelected);
          pathEl.classList.toggle('edge-hovered', isSelected);
          if (isSelected) {
            pathEl.style.setProperty('filter', 'drop-shadow(0 0 8px rgba(21, 101, 192, 0.28))', 'important');
          } else {
            pathEl.style.removeProperty('filter');
          }
        }

        var innerPaths = edgeEl && edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
        for (var j = 0; j < innerPaths.length; j++) {
          innerPaths[j].classList.toggle('edge-selected', isSelected);
          innerPaths[j].classList.toggle('edge-hovered', isSelected);
        }

        if (hitEl && hitEl.setAttribute) {
          if (hitEl.classList) {
            hitEl.classList.toggle('edge-hit-selected', isSelected);
          }
          hitEl.setAttribute('stroke', isSelected ? '#2563eb' : '#000');
          hitEl.setAttribute('stroke-opacity', isSelected ? '0.18' : '0.003');
          hitEl.setAttribute('stroke-width', '12');
        }
      }
    },

    _clearEdgeVisualState: function () {
      var edgePaths = this._edgePaths || [];
      for (var i = 0; i < edgePaths.length; i++) {
        var edgeData = edgePaths[i];
        if (!edgeData) continue;

        var edgeEl = edgeData.el;
        var pathEl = edgeData.path;
        var hitEl = edgeData.hit;

        if (edgeEl && edgeEl.classList) {
          edgeEl.classList.remove('edge-selected');
          edgeEl.classList.remove('edge-hovered');
        }

        if (pathEl && pathEl.classList) {
          pathEl.classList.remove('edge-selected');
          pathEl.classList.remove('edge-hovered');
          pathEl.style.removeProperty('filter');
        }

        var innerPaths = edgeEl && edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
        for (var j = 0; j < innerPaths.length; j++) {
          innerPaths[j].classList.remove('edge-selected');
          innerPaths[j].classList.remove('edge-hovered');
          innerPaths[j].style.removeProperty('filter');
        }

        if (hitEl && hitEl.classList) {
          hitEl.classList.remove('edge-hit-selected');
        }
        if (hitEl && hitEl.setAttribute) {
          hitEl.setAttribute('stroke', '#000');
          hitEl.setAttribute('stroke-opacity', '0.003');
          hitEl.setAttribute('stroke-width', '12');
        }
      }
    },

    _applyTransform: function () {
      if (!this._svgEl) return;
      var snappedPanX = Math.round(this.panX);
      var snappedPanY = Math.round(this.panY);
      var snappedZoom = Math.round(this.cfgZoom * 1000) / 1000;
      this._svgEl.style.transformOrigin = '0 0';
      this._svgEl.style.transform =
        'translate(' + snappedPanX + 'px, ' + snappedPanY + 'px) scale(' + snappedZoom + ')';
      var self = this;
      requestAnimationFrame(function () { self._refreshFloatingUiPositions(); });
    },

    _getContentBounds: function () {
      if (!this._svgEl) return null;

      var vb = this._svgEl.viewBox && this._svgEl.viewBox.baseVal;
      var fallback = {
        x: 0,
        y: 0,
        width: (vb && vb.width) || 0,
        height: (vb && vb.height) || 0
      };

      try {
        var box = this._svgEl.getBBox();
        if (box && box.width && box.height) {
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          };
        }
      } catch (e) {}

      return (fallback.width && fallback.height) ? fallback : null;
    },

    _setupViewport: function (svgEl, canvas, forcefit) {
      var prevZoom = this.cfgZoom;
      var prevPanX = this.panX;
      var prevPanY = this.panY;
      var hadPrev  = !!this._svgEl;

      this._svgEl = svgEl;
      svgEl.style.overflow = 'visible';
      svgEl.style.display = 'block';
      svgEl.style.position = 'absolute';
      svgEl.style.top = '0';
      svgEl.style.left = '0';
      svgEl.style.maxWidth = 'none';
      svgEl.style.maxHeight = 'none';
      svgEl.style.backfaceVisibility = 'hidden';
      svgEl.style.webkitFontSmoothing = 'antialiased';
      svgEl.setAttribute('text-rendering', 'geometricPrecision');

      var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      var bounds = this._getContentBounds();
      var intrinsicWidth = (vb && vb.width) || (bounds && bounds.width) || 1;
      var intrinsicHeight = (vb && vb.height) || (bounds && bounds.height) || 1;

      svgEl.style.width = intrinsicWidth + 'px';
      svgEl.style.height = intrinsicHeight + 'px';

      var self = this;

      if (forcefit || !hadPrev) {
        // 브라우저 레이아웃 완료 후 fit 해야 canvas 크기를 정확히 읽을 수 있다.
        requestAnimationFrame(function () { self.fitView(); });
      } else {
        this.cfgZoom = prevZoom;
        this.panX    = prevPanX;
        this.panY    = prevPanY;
        this._applyTransform();
      }

      canvas.onwheel = function (e) {
        e.preventDefault();
        self._zoomAtClient(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
      };

      // 패닝은 배경에서만 시작해서 node/edge interaction과 충돌하지 않게 한다.
      canvas.onmousedown = function (e) {
        if (e.button !== 0) return;
        if (!self._canPreparePan(e.target, svgEl)) return;
        e.preventDefault();
        self._panCandidate = { startX: e.clientX, startY: e.clientY, panX: self.panX, panY: self.panY };
      };

      canvas.onmousemove = function (e) {
        if (!self._panState && self._panCandidate) {
          var dx = e.clientX - self._panCandidate.startX;
          var dy = e.clientY - self._panCandidate.startY;
          if (Math.abs(dx) + Math.abs(dy) >= 4) {
            self._panState = self._panCandidate;
            self._panCandidate = null;
            canvas.classList.add('preview-area__canvas--panning');
          }
        }
        if (!self._panState) return;
        self.panX = self._panState.panX + (e.clientX - self._panState.startX);
        self.panY = self._panState.panY + (e.clientY - self._panState.startY);
        self._applyTransform();
      };

      if (this._panMouseUpHandler) {
        document.removeEventListener('mouseup', this._panMouseUpHandler);
      }
      this._panMouseUpHandler = function () { self._endPan(); };
      document.addEventListener('mouseup', this._panMouseUpHandler);
    },

    _canPreparePan: function (target, svgEl) {
      if (!target || !svgEl) return false;
      if (target.closest && (
        target.closest('.edge-toolbar') ||
        target.closest('.sequence-toolbar') ||
        target.closest('.context-menu') ||
        target.closest('.node-edit-overlay') ||
        target.closest('#conn-port-overlay') ||
        target.closest('#sequence-drag-overlay')
      )) {
        return false;
      }
      return true;
    },

    _endPan: function () {
      var canvas = this.$refs.canvas;
      if (this._panState) this._suppressClickAfterPan = true;
      this._panState = null;
      this._panCandidate = null;
      if (canvas) canvas.classList.remove('preview-area__canvas--panning');
    },

    _zoomAtClient: function (factor, clientX, clientY) {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var cx = clientX - rect.left;
      var cy = clientY - rect.top;

      var newZoom = Math.max(0.2, Math.min(5.0, this.cfgZoom * factor));
      var ratio   = newZoom / this.cfgZoom;

      this.panX    = cx - (cx - this.panX) * ratio;
      this.panY    = cy - (cy - this.panY) * ratio;
      this.cfgZoom = newZoom;
      this._applyTransform();
    },

    _buildCtx: function (svgEl) {
      var self = this;
      var ctx = {
        emit: function (ev, data) { self.$emit(ev, data); },
        getState: function () { return self.$data; },
        setState: function (patch) {
          var keys = Object.keys(patch);
          for (var i = 0; i < keys.length; i++) { self[keys[i]] = patch[keys[i]]; }
        },
        getModel: function () { return self.model; },
        findNode: function (nodeId) {
          var nodes = self.model.nodes || [];
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) return nodes[i];
          }
          return null;
        },
        findSequenceParticipant: function (participantId) {
          var participants = self.model.participants || [];
          for (var i = 0; i < participants.length; i++) {
            if (participants[i].id === participantId) return participants[i];
          }
          return null;
        },
        findSequenceMessage: function (messageIndex) {
          return (self.model.messages || [])[messageIndex] || null;
        },
        watchSelection: function (nodeId, nodeEl) {
          self.$watch('selectedNodeId', function (val) {
            nodeEl.classList.toggle('selected', val === nodeId);
          }, { immediate: true });
        },
        watchEdgeSelection: function (edgeIndex, edgeEl) {
          self.$watch('selectedEdgeIndex', function (val) {
            if (edgeEl) {
              var isSelected = val === edgeIndex;
              if (edgeEl.classList) {
                edgeEl.classList.toggle('edge-selected', isSelected);
                edgeEl.classList.toggle('edge-hovered', isSelected);
              }
              var edgePaths = edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
              for (var i = 0; i < edgePaths.length; i++) {
                edgePaths[i].classList.toggle('edge-selected', isSelected);
                edgePaths[i].classList.toggle('edge-hovered', isSelected);
              }
            }
          }, { immediate: true });
        },
        getPreviewRect: function () {
          return self.$refs.canvas && self.$refs.canvas.getBoundingClientRect
            ? self.$refs.canvas.getBoundingClientRect()
            : (self.$el && self.$el.getBoundingClientRect ? self.$el.getBoundingClientRect() : null);
        },
        watchSequenceParticipantSelection: function (participantId, el) {
          self.$watch('selectedSequenceParticipantId', function (val) {
            el.classList.toggle('sequence-participant-selected', val === participantId);
          }, { immediate: true });
        },
        watchSequenceMessageSelection: function (messageIndex, lineEl, textEl) {
          self.$watch('selectedSequenceMessageIndex', function (val) {
            if (lineEl) lineEl.classList.toggle('sequence-message-selected', val === messageIndex);
            if (textEl) textEl.classList.toggle('sequence-message-text-selected', val === messageIndex);
          }, { immediate: true });
        },
        watchSequenceMessageHitSelection: function (messageIndex, hitEl) {
          self.$watch('selectedSequenceMessageIndex', function (val) {
            if (hitEl && hitEl.classList) {
              hitEl.classList.toggle('sequence-hit-selected', val === messageIndex);
            }
          }, { immediate: true });
        },
        getPreviewRect: function () {
          return self.$refs.canvas && self.$refs.canvas.getBoundingClientRect
            ? self.$refs.canvas.getBoundingClientRect()
            : (self.$el && self.$el.getBoundingClientRect ? self.$el.getBoundingClientRect() : null);
        },
        focusEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusEdgeEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editEdgeInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusSequenceParticipantInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceParticipantInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusSequenceMessageInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceMessageInput;
            if (el) { el.focus(); el.select(); }
          });
        }
      };
      return ctx;
    },

    // 공통 노드 편집 유틸

    confirmNodeEdit: function () {
      if (this.editingNodeId && this.editingText.trim()) {
        this.$emit('update-node-text', {
          nodeId: this.editingNodeId,
          text:   this.editingText.trim()
        });
      }
      this.editingNodeId = null;
      this.editingText   = '';
      this.editingNodeColor = '#e2e8f0';
    },

    cancelNodeEdit: function () {
      this.editingNodeId = null;
      this.editingText   = '';
      this.editingNodeColor = '#e2e8f0';
    },

    onNodeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmNodeEdit(); }
      if (e.key === 'Escape') { this.cancelNodeEdit(); }
    },

    // 공통 엣지 편집 유틸

    confirmEdgeEdit: function () {
      if (this.editingEdgeIndex !== null) {
        this.$emit('update-edge-text', {
          index: this.editingEdgeIndex,
          text:  this.editingEdgeText.trim()
        });
      }
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
      this.editingEdgeColor = '#5c7ab0';
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    cancelEdgeEdit: function () {
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
      this.editingEdgeColor = '#5c7ab0';
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    onEdgeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmEdgeEdit(); }
      if (e.key === 'Escape') { this.cancelEdgeEdit(); }
    },

    // 공통 시퀀스 편집 유틸

    confirmSequenceParticipantEdit: function () {
      if (this.editingSequenceParticipantId && this.editingSequenceParticipantText.trim()) {
        this.$emit('update-sequence-participant-text', {
          participantId: this.editingSequenceParticipantId,
          text: this.editingSequenceParticipantText.trim()
        });
      }
      this.editingSequenceParticipantId = null;
      this.editingSequenceParticipantText = '';
    },

    cancelSequenceParticipantEdit: function () {
      this.editingSequenceParticipantId = null;
      this.editingSequenceParticipantText = '';
    },

    onSequenceParticipantEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceParticipantEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceParticipantEdit(); }
    },

    confirmSequenceMessageEdit: function () {
      if (this.editingSequenceMessageIndex !== null) {
        this.$emit('update-sequence-message-text', {
          index: this.editingSequenceMessageIndex,
          text: this.editingSequenceMessageText.trim()
        });
      }
      this.editingSequenceMessageIndex = null;
      this.editingSequenceMessageText = '';
    },

    cancelSequenceMessageEdit: function () {
      this.editingSequenceMessageIndex = null;
      this.editingSequenceMessageText = '';
    },

    onSequenceMessageEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceMessageEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceMessageEdit(); }
    },

    // 공통 노드 컨텍스트 메뉴 액션 유틸

    contextEditNode: function () {
      if (!this.contextMenu) return;
      var nodeId = this.contextMenu.nodeId;
      var nodeEl = this._elements[nodeId];
      this.contextMenu = null;
      if (!nodeEl) return;
      var canvas = this.$refs.canvas;
      var canvasRect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      var labelEl = nodeEl.querySelector('foreignObject, .label, text');
      var targetRect = labelEl && labelEl.getBoundingClientRect ? labelEl.getBoundingClientRect() : nodeEl.getBoundingClientRect();
      var node = null;
      var nodes = this.model.nodes || [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id === nodeId) {
          node = nodes[i];
          break;
        }
      }
      var width = 240;
      var left = canvasRect ? (targetRect.left - canvasRect.left + (targetRect.width / 2) - (width / 2)) : 0;
      var top = canvasRect ? (targetRect.top - canvasRect.top + (targetRect.height / 2) - 18) : 0;
      this.editingNodeId = nodeId;
      this.editingText = node ? (node.text || node.id) : '';
      this.editingNodeColor = node && node.fill ? node.fill : '#e2e8f0';
      this.editInputStyle = {
        position: 'absolute',
        left: Math.max(8, left) + 'px',
        top: Math.max(8, top) + 'px',
        zIndex: 1000,
        width: width + 'px'
      };
      this.$nextTick(this._buildCtxLite().focusEditInput);
    },

    contextDeleteNode: function () {
      if (!this.contextMenu) return;
      this.$emit('delete-selected', { nodeId: this.contextMenu.nodeId, edgeIndex: null });
      this.contextMenu   = null;
      this.selectedNodeId = null;
    },

    contextChangeShape: function (shape) {
      if (!this.contextMenu) return;
      this.$emit('update-node-shape', {
        nodeId: this.contextMenu.nodeId,
        shape:  shape
      });
    },

    contextChangeNodeColor: function (fill) {
      if (!this.contextMenu) return;
      this.$emit('update-node-fill', {
        nodeId: this.contextMenu.nodeId,
        fill: fill || ''
      });
      this.contextMenu = null;
    },

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

    // 공통 엣지 툴바 액션 유틸

    edgeToolbarEdit: function () {
      if (!this.edgeToolbar) return;
      var idx = this.edgeToolbar.edgeIndex;
      var clickX = this.edgeToolbar.x;
      var clickY = this.edgeToolbar.y;
      this.edgeToolbar = null;
      var edge = (this.model.edges || [])[idx];
      if (!edge) return;

      this.selectedEdgeIndex = idx;
      this.editingEdgeIndex = idx;
      this.editingEdgeText = edge.text || '';
      this.editingEdgeColor = edge.color || '#5c7ab0';
      this.edgeEditInputStyle = {
        position: 'absolute',
        left: Math.max(8, clickX - 80) + 'px',
        top: Math.max(8, clickY - 18) + 'px',
        zIndex: 1000,
        width: '160px'
      };
      this.$nextTick(this._buildCtxLite().focusEdgeEditInput);
    },

    edgeToolbarDelete: function () {
      if (!this.edgeToolbar) return;
      this.$emit('delete-selected', { nodeId: null, edgeIndex: this.edgeToolbar.edgeIndex });
      this.edgeToolbar       = null;
      this.selectedEdgeIndex = null;
    },

    edgeToolbarChangeColor: function (color) {
      if (!this.edgeToolbar) return;
      this.$emit('update-edge-color', {
        index: this.edgeToolbar.edgeIndex,
        color: color || ''
      });
      this.edgeToolbar = null;
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    // 공통 시퀀스 툴바 액션 유틸

    sequenceToolbarEdit: function () {
      if (!this.sequenceToolbar) return;
      var toolbar = this.sequenceToolbar;
      var canvas = this.$refs.canvas;
      var svgEl = canvas ? canvas.querySelector('svg') : null;

      if (toolbar.type === 'participant') {
        var participantMap = SequencePositionTracker.collectParticipants(svgEl, this.model);
        var participant = participantMap[toolbar.id];
        if (participant && participant.el) {
          SequenceSvgHandler.startParticipantEdit(toolbar.id, participant.el, this._buildCtxLite());
        }
      } else if (toolbar.type === 'message') {
        SequenceSvgHandler.startMessageEdit(toolbar.index, toolbar.x, toolbar.y, svgEl, this._buildCtxLite());
      }
    },

    sequenceToolbarDelete: function () {
      if (!this.sequenceToolbar) return;
      if (this.sequenceToolbar.type === 'participant') {
        this.$emit('delete-selected', {
          sequenceParticipantId: this.sequenceToolbar.id,
          sequenceMessageIndex: null
        });
        this.selectedSequenceParticipantId = null;
      } else if (this.sequenceToolbar.type === 'message') {
        this.$emit('delete-selected', {
          sequenceParticipantId: null,
          sequenceMessageIndex: this.sequenceToolbar.index
        });
        this.selectedSequenceMessageIndex = null;
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarAddMessage: function () {
      if (!this.sequenceToolbar) return;
      if (this.sequenceToolbar.type === 'participant') {
        this.$emit('add-sequence-message', { participantId: this.sequenceToolbar.id });
      } else if (this.sequenceToolbar.type === 'message') {
        this.$emit('add-sequence-message', { afterIndex: this.sequenceToolbar.index });
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarReverse: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.$emit('reverse-sequence-message', this.sequenceToolbar.index);
      this.sequenceToolbar = null;
    },

    sequenceToolbarToggleLineType: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.lineTypePicker = true;
    },

    sequenceToolbarSelectLineType: function (operator) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.$emit('set-sequence-message-line-type', { index: this.sequenceToolbar.index, operator: operator });
      this.lineTypePicker = false;
      this.sequenceToolbar = null;
    },

    sequenceToolbarToggleKind: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('toggle-participant-kind', { participantId: this.sequenceToolbar.id });
      this.sequenceToolbar = null;
    },

    sequenceToolbarMoveLeft: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('move-sequence-participant', { participantId: this.sequenceToolbar.id, direction: 'left' });
      this.sequenceToolbar = null;
    },

    sequenceToolbarMoveRight: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('move-sequence-participant', { participantId: this.sequenceToolbar.id, direction: 'right' });
      this.sequenceToolbar = null;
    },

    // postRenderSetup 바깥에서도 재사용하는 경량 ctx
    _buildCtxLite: function () {
      var self = this;
      return {
        emit: function (ev, data) { self.$emit(ev, data); },
        getState: function () { return self.$data; },
        setState: function (patch) {
          var keys = Object.keys(patch);
          for (var i = 0; i < keys.length; i++) { self[keys[i]] = patch[keys[i]]; }
        },
        getModel: function () { return self.model; },
        findNode: function (nodeId) {
          var nodes = self.model.nodes || [];
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) return nodes[i];
          }
          return null;
        },
        findSequenceParticipant: function (participantId) {
          var participants = self.model.participants || [];
          for (var i = 0; i < participants.length; i++) {
            if (participants[i].id === participantId) return participants[i];
          }
          return null;
        },
        findSequenceMessage: function (messageIndex) {
          var messages = self.model.messages || [];
          return messages[messageIndex] || null;
        },
        focusEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusEdgeEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editEdgeInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusSequenceParticipantInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceParticipantInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusSequenceMessageInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceMessageInput;
            if (el) { el.focus(); el.select(); }
          });
        }
      };
    },

    fitView: function () {
      var canvas = this.$refs.canvas;
      if (!canvas || !this._svgEl) return;

      var canvasW = canvas.clientWidth  || canvas.offsetWidth;
      var canvasH = canvas.clientHeight || canvas.offsetHeight;

      if (!canvasW || !canvasH) {
        var self = this;
        requestAnimationFrame(function () { self.fitView(); });
        return;
      }

      var bounds = this._getContentBounds();
      if (!bounds || !bounds.width || !bounds.height) return;

      var pad    = Math.max(24, Math.min(canvasW, canvasH) * 0.06);
      var scaleX = (canvasW - pad * 2) / bounds.width;
      var scaleY = (canvasH - pad * 2) / bounds.height;
      var scale  = Math.min(scaleX, scaleY);
      scale = Math.max(0.1, Math.min(5.0, scale));

      this.cfgZoom = scale;
      this.panX    = (canvasW - bounds.width * scale) / 2 - bounds.x * scale;
      this.panY    = (canvasH - bounds.height * scale) / 2 - bounds.y * scale;
      this._applyTransform();
    },

    zoomIn: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      this._zoomAtClient(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    zoomOut: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      this._zoomAtClient(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  },

  template: '\
    <div class="preview-area" @click.self="selectedNodeId = null; selectedEdgeIndex = null; selectedSequenceParticipantId = null; selectedSequenceMessageIndex = null;">\
      <div v-if="portDragging" class="edge-mode-overlay" style="background: var(--success);">\
        Release on target node to connect\
      </div>\
      <div v-if="svgContent" :key="renderCounter" ref="canvas" class="preview-area__canvas">\
        <div class="preview-area__svg-host" v-html="svgContent"></div>\
        <div v-if="editingNodeId" class="node-edit-overlay" :style="editInputStyle">\
          <input ref="editInput" class="node-edit-input" v-model="editingText" @keydown="onNodeEditKeyDown" @blur="confirmNodeEdit" />\
        </div>\
        <div v-if="editingEdgeIndex !== null" class="node-edit-overlay" :style="edgeEditInputStyle">\
          <input ref="editEdgeInput" class="node-edit-input" v-model="editingEdgeText" placeholder="Edge label" @keydown="onEdgeEditKeyDown" @blur="confirmEdgeEdit" />\
        </div>\
        <div v-if="editingSequenceParticipantId" class="node-edit-overlay" :style="sequenceParticipantEditStyle">\
          <input ref="sequenceParticipantInput" class="node-edit-input" v-model="editingSequenceParticipantText" @keydown="onSequenceParticipantEditKeyDown" @blur="confirmSequenceParticipantEdit" />\
        </div>\
        <div v-if="editingSequenceMessageIndex !== null" class="node-edit-overlay" :style="sequenceMessageEditStyle">\
          <input ref="sequenceMessageInput" class="node-edit-input" v-model="editingSequenceMessageText" placeholder="Message text" @keydown="onSequenceMessageEditKeyDown" @blur="confirmSequenceMessageEdit" />\
        </div>\
        <div v-if="contextMenu" class="context-menu" :style="{ left: contextMenu.x + &quot;px&quot;, top: contextMenu.y + &quot;px&quot; }" @click.stop>\
          <div class="context-menu__section-title">Change Shape</div>\
          <div class="context-menu__shapes-grid">\
            <button v-for="s in $options.SHAPES" :key="s.key" class="context-menu__shape-btn" :title="s.name" @click="contextChangeShape(s.key)">\
              <span class="context-menu__shape-icon" :class="&quot;context-menu__shape-icon--&quot; + s.key"></span>\
              <span class="context-menu__shape-text">{{ s.name }}</span>\
            </button>\
          </div>\
          <div class="context-menu__section-title">Color</div>\
          <div class="context-menu__color-row">\
            <button class="context-menu__color-btn context-menu__color-btn--clear" title="default" @click="contextChangeNodeColor(&quot;&quot;)">x</button>\
            <button v-for="color in $options.COLOR_PALETTE" :key="color.key" class="context-menu__color-btn" :style="{ backgroundColor: color.value }" :title="color.key" @click="contextChangeNodeColor(color.value)"></button>\
          </div>\
          <div class="context-menu__separator"></div>\
          <div class="context-menu__item" @click="contextEditNode"><span class="context-menu__item-icon">T</span> Edit Text</div>\
          <div class="context-menu__item context-menu__item--danger" @click="contextDeleteNode"><span class="context-menu__item-icon">X</span> Delete Node</div>\
        </div>\
        <div v-if="edgeToolbar" class="edge-toolbar" :style="{ left: edgeToolbar.x + &quot;px&quot;, top: edgeToolbar.y + &quot;px&quot; }" @click.stop>\
          <button class="edge-toolbar__btn" @click="edgeToolbarEdit" title="Edit label">Label ✎</button>\
          <div class="edge-toolbar__palette">\
            <button class="context-menu__color-btn context-menu__color-btn--clear" title="default" @click="edgeToolbarChangeColor(&quot;&quot;)">x</button>\
            <button v-for="color in $options.COLOR_PALETTE" :key="color.key" class="context-menu__color-btn" :style="{ backgroundColor: color.value }" :title="color.key" @click="edgeToolbarChangeColor(color.value)"></button>\
          </div>\
          <div class="edge-toolbar__sep"></div>\
          <button class="edge-toolbar__btn edge-toolbar__btn--danger" @click="edgeToolbarDelete" title="Delete edge">Delete</button>\
        </div>\
        <div v-if="sequenceToolbar" class="sequence-toolbar" :style="{ left: sequenceToolbar.x + &quot;px&quot;, top: sequenceToolbar.y + &quot;px&quot; }" @click.stop>\
          <template v-if="lineTypePicker">\
            <button\
              v-for="opt in $options.LINE_TYPE_OPTIONS"\
              :key="opt.operator"\
              class="edge-toolbar__btn edge-toolbar__btn--line-opt"\
              :title="opt.desc"\
              @click="sequenceToolbarSelectLineType(opt.operator)"\
            >{{ opt.label }}</button>\
            <button class="edge-toolbar__btn" @click="lineTypePicker = false">✕</button>\
          </template>\
          <template v-else>\
            <button class="edge-toolbar__btn" @click="sequenceToolbarEdit">Edit</button>\
            <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarMoveLeft" title="Move left">◀</button>\
            <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarMoveRight" title="Move right">▶</button>\
            <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarToggleKind">{{ sequenceToolbar.kind === &quot;actor&quot; ? &quot;→ Participant&quot; : &quot;→ Actor&quot; }}</button>\
            <button v-if="sequenceToolbar.type === &quot;message&quot;" class="edge-toolbar__btn" @click="sequenceToolbarReverse">Reverse</button>\
            <button v-if="sequenceToolbar.type === &quot;message&quot;" class="edge-toolbar__btn" @click.stop="sequenceToolbarToggleLineType">Line</button>\
            <button class="edge-toolbar__btn edge-toolbar__btn--danger" @click="sequenceToolbarDelete">Delete</button>\
          </template>\
        </div>\
      </div>\
      <div v-else class="preview-area__empty">\
        <div class="preview-area__empty-icon">[]</div>\
        <div class="preview-area__empty-text">{{ renderError || &quot;Enter Mermaid script to render a diagram here.&quot; }}</div>\
        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">{{ renderError ? &quot;Rendering failed. Check the Mermaid script.&quot; : &quot;Flowchart and sequence diagrams are supported.&quot; }}</div>\
      </div>\
    </div>\
  '
});


/* ===== src/components/MermaidFullEditor.js ===== */
/**
 * MermaidFullEditor — 임베드용 올인원 컴포넌트
 * MermaidEditor(텍스트) + MermaidToolbar + MermaidPreview를 하나로 묶음.
 * 부모와 v-model(:value + @input)으로 diagram 문자열을 양방향 동기화한다.
 *
 * 사용법:
 *   <mermaid-full-editor :value="myDiagram" @input="myDiagram = $event">
 *   </mermaid-full-editor>
 */

Vue.component('mermaid-full-editor', {
  props: {
    value: { type: String, default: '' }
  },

  data: function () {
    return {
      script: this.value || '',
      model:  { type: 'flowchart', direction: 'TD', nodes: [], edges: [] },
      error:  '',

      selectedNode: '',
      selectedEdge: null,
      selectedSequenceParticipant: '',
      selectedSequenceMessage: null,
      nodeCounter:  0,
      participantCounter: 0,

      history: null,

      toastMsg:     '',
      toastVisible: false,
      _toastTimer:  null
    };
  },

  computed: {
    canUndo:     function () { return !!(this.history && this.history.canUndo()); },
    canRedo:     function () { return !!(this.history && this.history.canRedo()); },
    isFlowchart: function () { return !!this.model && this.model.type !== 'sequenceDiagram'; }
  },

  watch: {
    // 부모 → 컴포넌트 동기화
    value: function (newVal) {
      if (newVal !== this.script) {
        this.script = newVal;
        this.parseScript();
      }
    },
    // 컴포넌트 → 부모 동기화
    script: function (newVal) {
      this.$emit('input', newVal);
    }
  },

  mounted: function () {
    this.history = new HistoryManager();
    if (this.script) {
      this.parseScript();
    }
    var self = this;
    this.$nextTick(function () {
      self.updateNodeCounter();
      self.updateParticipantCounter();
    });
  },

  methods: {

    // ── 텍스트 에디터에서 편집 ──────────────────────────────────────
    onScriptChange: function (newScript) {
      this.script = newScript;
      this._schedulePreviewFit();
      this.parseScript();
    },

    _schedulePreviewFit: function () {
      if (this.$refs.preview) this.$refs.preview.scheduleFit();
    },

    _normalizeSequenceMessages: function (messages) {
      var result = [];
      var activeCounts = {};
      var splitOperator = function (operator) {
        var suffix = '', base = operator || '->>';
        if (/[+-]$/.test(base)) { suffix = base.slice(-1); base = base.slice(0, -1); }
        return { base: base, suffix: suffix };
      };
      for (var i = 0; i < messages.length; i++) {
        var msg = Object.assign({}, messages[i]);
        var parts = splitOperator(msg.operator);
        if (parts.suffix === '+') { activeCounts[msg.to] = (activeCounts[msg.to] || 0) + 1; }
        if (parts.suffix === '-') {
          if (activeCounts[msg.from] > 0) { activeCounts[msg.from]--; }
          else { msg.operator = parts.base; }
        }
        result.push(msg);
      }
      return result;
    },

    _updateSequenceModel: function (patch) {
      var nextModel = Object.assign({}, this.model, patch);
      nextModel.explicitParticipants = true;
      if (nextModel.messages) { nextModel.messages = this._normalizeSequenceMessages(nextModel.messages); }
      this.model = nextModel;
      this.updateScriptFromModel();
    },

    _snapshot: function () { if (this.history) this.history.snapshot(this.model); },

    parseScript: function () {
      try {
        var parsed = MermaidParser.parse(this.script);
        this.model = parsed;
        this.error = '';
        this.updateNodeCounter();
        this.updateParticipantCounter();
      } catch (e) {
        this.error = e.message || 'Parse error';
      }
    },

    updateScriptFromModel: function () {
      this.script = MermaidGenerator.generate(this.model);
      this.error  = '';
    },

    updateNodeCounter: function () {
      if (!this.model || !this.model.nodes) return;
      var max = 0;
      for (var i = 0; i < this.model.nodes.length; i++) {
        var nm = this.model.nodes[i].id.match(/(\d+)$/);
        if (nm) { var n = parseInt(nm[1], 10); if (n > max) max = n; }
      }
      if (max > this.nodeCounter) this.nodeCounter = max;
    },

    updateParticipantCounter: function () {
      var participants = (this.model && this.model.participants) || [];
      var max = 0;
      for (var i = 0; i < participants.length; i++) {
        var pm = String(participants[i].id || '').match(/(\d+)$/);
        if (!pm) continue;
        var n = parseInt(pm[1], 10);
        if (n > max) max = n;
      }
      if (max > this.participantCounter) this.participantCounter = max;
    },

    addNode: function (shape) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodeShape = shape, nodeText = 'Node', nodeFill = '';
      if (shape && typeof shape === 'object') { nodeShape = shape.shape; nodeText = shape.text || nodeText; nodeFill = shape.fill || ''; }
      if (!nodeShape) nodeShape = 'rect';
      this.nodeCounter++;
      var newNode = { id: 'N' + this.nodeCounter, text: nodeText, shape: nodeShape };
      if (nodeFill) newNode.fill = nodeFill;
      var nodes = this.model.nodes.slice(); nodes.push(newNode);
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel(); this._schedulePreviewFit();
    },

    addEdge: function (data) {
      if (!this.isFlowchart) return;
      var edges = this.model.edges;
      if (data.from === data.to) {
        for (var i = 0; i < edges.length; i++) { if (edges[i].from === data.from && edges[i].to === data.to) return; }
      }
      this._snapshot();
      var newEdges = edges.slice(); newEdges.push({ from: data.from, to: data.to, text: '', type: '-->' });
      this.model = Object.assign({}, this.model, { edges: newEdges }); this.updateScriptFromModel();
    },

    addSequenceParticipant: function () {
      if (this.isFlowchart) return; this._snapshot(); this.participantCounter++;
      var participants = (this.model.participants || []).slice();
      participants.push({ id: 'P' + this.participantCounter, label: 'Participant ' + this.participantCounter, kind: 'participant' });
      this._updateSequenceModel({ participants: participants });
    },

    addSequenceActor: function () {
      if (this.isFlowchart) return; this._snapshot(); this.participantCounter++;
      var participants = (this.model.participants || []).slice();
      participants.push({ id: 'P' + this.participantCounter, label: 'Actor ' + this.participantCounter, kind: 'actor' });
      this._updateSequenceModel({ participants: participants });
    },

    toggleParticipantKind: function (data) {
      if (this.isFlowchart) return; this._snapshot();
      var participants = (this.model.participants || []).map(function (p) {
        return p.id !== data.participantId ? p : Object.assign({}, p, { kind: p.kind === 'actor' ? 'participant' : 'actor' });
      });
      this._updateSequenceModel({ participants: participants });
    },

    moveSequenceParticipant: function (data) {
      if (this.isFlowchart) return;
      var participants = (this.model.participants || []).slice(), idx = -1;
      for (var i = 0; i < participants.length; i++) { if (participants[i].id === data.participantId) { idx = i; break; } }
      if (idx === -1) return;
      var swapIdx = data.direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= participants.length) return;
      this._snapshot();
      var tmp = participants[idx]; participants[idx] = participants[swapIdx]; participants[swapIdx] = tmp;
      this._updateSequenceModel({ participants: participants });
    },

    addSequenceMessage: function (payload) {
      if (this.isFlowchart) return;
      var participants = this.model.participants || []; if (!participants.length) return;
      this._snapshot();
      var fromId = participants[0].id, toId = participants[Math.min(1, participants.length - 1)].id, messageText = 'Message';
      if (payload && payload.fromId) fromId = payload.fromId;
      if (payload && payload.toId)   toId   = payload.toId;
      if (payload && payload.text)   messageText = payload.text;
      if (payload && payload.participantId && !payload.fromId) {
        fromId = payload.participantId;
        for (var i = 0; i < participants.length; i++) {
          if (participants[i].id === payload.participantId) { toId = participants[(i + 1) % participants.length].id; break; }
        }
      }
      var messages = (this.model.messages || []).slice();
      var insertAt = messages.length;
      if (payload && payload.insertIndex != null) insertAt = Math.max(0, Math.min(messages.length, payload.insertIndex));
      else if (payload && payload.afterIndex != null) insertAt = Math.min(messages.length, payload.afterIndex + 1);
      messages.splice(insertAt, 0, { from: fromId, to: toId, operator: '->>', text: messageText });
      this._updateSequenceModel({ messages: messages });
    },

    deleteSelected: function (data) {
      if (!data) return; this._snapshot();
      if (this.isFlowchart && data.nodeId) {
        var nodes = this.model.nodes.filter(function (n) { return n.id !== data.nodeId; });
        var edges = this.model.edges.filter(function (e) { return e.from !== data.nodeId && e.to !== data.nodeId; });
        this.model = Object.assign({}, this.model, { nodes: nodes, edges: edges });
      } else if (this.isFlowchart && data.edgeIndex != null) {
        var ec = this.model.edges.slice(); ec.splice(data.edgeIndex, 1);
        this.model = Object.assign({}, this.model, { edges: ec });
      } else if (!this.isFlowchart && data.sequenceParticipantId) {
        var pts  = (this.model.participants || []).filter(function (p) { return p.id !== data.sequenceParticipantId; });
        var msgs = (this.model.messages   || []).filter(function (m) { return m.from !== data.sequenceParticipantId && m.to !== data.sequenceParticipantId; });
        this._updateSequenceModel({ participants: pts, messages: msgs }); return;
      } else if (!this.isFlowchart && data.sequenceMessageIndex != null) {
        var mc = (this.model.messages || []).slice(); mc.splice(data.sequenceMessageIndex, 1);
        this._updateSequenceModel({ messages: mc }); return;
      } else { return; }
      this.selectedNode = ''; this.selectedEdge = null;
      this.selectedSequenceParticipant = ''; this.selectedSequenceMessage = null;
      if (this.isFlowchart) this.updateScriptFromModel();
    },

    updateNodeText:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id === data.nodeId ? Object.assign({}, n, { text: data.text }) : n; }) }); this.updateScriptFromModel(); },
    updateNodeShape: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id === data.nodeId ? Object.assign({}, n, { shape: data.shape }) : n; }) }); this.updateScriptFromModel(); },
    updateNodeStyle: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id !== data.nodeId ? n : Object.assign({}, n, { text: data.text, fill: data.fill }); }) }); this.updateScriptFromModel(); },
    updateNodeFill:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id !== data.nodeId ? n : Object.assign({}, n, { fill: data.fill }); }) }); this.updateScriptFromModel(); },
    updateEdgeText:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i === data.index ? Object.assign({}, e, { text: data.text }) : e; }) }); this.updateScriptFromModel(); },
    updateEdgeStyle: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i !== data.index ? e : Object.assign({}, e, { text: data.text, color: data.color }); }) }); this.updateScriptFromModel(); },
    updateEdgeColor: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i !== data.index ? e : Object.assign({}, e, { color: data.color }); }) }); this.updateScriptFromModel(); },

    changeDirection: function (dir) {
      if (!this.isFlowchart) return; this._snapshot();
      this.model = Object.assign({}, this.model, { direction: dir });
      this.updateScriptFromModel(); this._schedulePreviewFit();
    },

    updateSequenceParticipantText: function (data) { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ participants: (this.model.participants || []).map(function (p) { return p.id === data.participantId ? Object.assign({}, p, { label: data.text }) : p; }) }); },
    updateSequenceMessageText:     function (data) { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) { return i === data.index ? Object.assign({}, m, { text: data.text }) : m; }) }); },
    reverseSequenceMessage:        function (index) { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) { return i !== index ? m : Object.assign({}, m, { from: m.to, to: m.from }); }) }); },
    toggleAutonumber:              function ()      { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ autonumber: !this.model.autonumber }); },

    toggleSequenceMessageLineType: function (index) {
      if (this.isFlowchart) return; this._snapshot();
      this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) { return i !== index ? m : Object.assign({}, m, { operator: SequenceSvgHandler.toggleMessageLineType(m) }); }) });
    },
    setSequenceMessageLineType: function (data) {
      if (this.isFlowchart) return; this._snapshot();
      this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) {
        if (i !== data.index) return m;
        var suffix = /[+-]$/.test(m.operator || '') ? m.operator.slice(-1) : '';
        return Object.assign({}, m, { operator: data.operator + suffix });
      }) });
    },

    undo: function () { if (!this.history) return; var prev = this.history.undo(this.model); if (!prev) return; this.model = prev; this.script = MermaidGenerator.generate(this.model); },
    redo: function () { if (!this.history) return; var next = this.history.redo(this.model); if (!next) return; this.model = next; this.script = MermaidGenerator.generate(this.model); },

    onNodeSelected:                function (id)    { this.selectedNode = id; this.selectedEdge = null; },
    onEdgeSelected:                function (idx)   { this.selectedEdge = this.model.edges[idx] || null; this.selectedNode = ''; },
    onSequenceParticipantSelected: function (id)    { this.selectedSequenceParticipant = id; this.selectedSequenceMessage = null; },
    onSequenceMessageSelected:     function (idx)   { this.selectedSequenceMessage = (this.model.messages || [])[idx] || null; this.selectedSequenceParticipant = ''; },

    fitView:  function () { if (this.$refs.preview) this.$refs.preview.fitView(); },
    zoomIn:   function () { if (this.$refs.preview) this.$refs.preview.zoomIn(); },
    zoomOut:  function () { if (this.$refs.preview) this.$refs.preview.zoomOut(); },

    exportPng: function () {
      var preview = this.$refs.preview; if (!preview) return;
      var svgStr = preview.svgContent; if (!svgStr) return;
      var self = this, scale = 2, pad = 20;
      var doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
      var svgEl = doc.querySelector('svg'); if (!svgEl) return;
      var fos = svgEl.querySelectorAll('foreignObject');
      for (var i = 0; i < fos.length; i++) {
        var fo = fos[i], fx = parseFloat(fo.getAttribute('x')||0), fy = parseFloat(fo.getAttribute('y')||0), fw = parseFloat(fo.getAttribute('width')||100), fh = parseFloat(fo.getAttribute('height')||20);
        var lines = (fo.textContent||'').trim().split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
        var textEl = doc.createElementNS('http://www.w3.org/2000/svg','text');
        textEl.setAttribute('x',fx+fw/2); textEl.setAttribute('y',fy+fh/2); textEl.setAttribute('text-anchor','middle'); textEl.setAttribute('dominant-baseline','middle'); textEl.setAttribute('font-size','14'); textEl.setAttribute('font-family','sans-serif'); textEl.setAttribute('fill','#333');
        if (lines.length <= 1) { textEl.textContent = lines[0]||''; }
        else { var lineH=18, startDy=-(lines.length-1)/2*lineH; for(var li=0;li<lines.length;li++){var tspan=doc.createElementNS('http://www.w3.org/2000/svg','tspan');tspan.setAttribute('x',fx+fw/2);tspan.setAttribute('dy',li===0?startDy:lineH);tspan.textContent=lines[li];textEl.appendChild(tspan);} }
        fo.parentNode.replaceChild(textEl, fo);
      }
      var vb=svgEl.getAttribute('viewBox'),w,h;
      if(vb){var pts=vb.trim().split(/[\s,]+/);w=parseFloat(pts[2])||800;h=parseFloat(pts[3])||600;}else{w=parseFloat(svgEl.getAttribute('width'))||800;h=parseFloat(svgEl.getAttribute('height'))||600;}
      w=Math.ceil(w+pad*2);h=Math.ceil(h+pad*2);
      svgEl.setAttribute('width',w);svgEl.setAttribute('height',h);svgEl.setAttribute('viewBox',(-pad)+' '+(-pad)+' '+w+' '+h);
      var url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgEl)],{type:'image/svg+xml;charset=utf-8'}));
      var img=new Image();
      img.onload=function(){var cvs=document.createElement('canvas');cvs.width=w*scale;cvs.height=h*scale;var ctx=cvs.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cvs.width,cvs.height);ctx.scale(scale,scale);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);cvs.toBlob(function(pngBlob){var a=document.createElement('a');a.download='diagram.png';a.href=URL.createObjectURL(pngBlob);a.click();URL.revokeObjectURL(a.href);self.showToast('PNG exported!');},'image/png');};
      img.onerror=function(){URL.revokeObjectURL(url);self.showToast('Export failed');};
      img.src=url;
    },

    copySvg: function () {
      var preview=this.$refs.preview; if(!preview) return;
      var canvas=preview.$refs.canvas; if(!canvas) return;
      var svgEl=canvas.querySelector('svg'); if(!svgEl) return;
      var svgStr=new XMLSerializer().serializeToString(svgEl), self=this;
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(svgStr).then(function(){self.showToast('SVG copied!');}).catch(function(){self._fallbackCopy(svgStr);});}else{this._fallbackCopy(svgStr);}
    },
    _fallbackCopy: function (text) {
      var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.top='-9999px';document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');this.showToast('SVG copied!');}catch(e){this.showToast('Copy failed');}
      document.body.removeChild(ta);
    },

    showToast: function (msg) {
      var self=this; this.toastMsg=msg; this.toastVisible=true;
      clearTimeout(this._toastTimer);
      this._toastTimer=setTimeout(function(){self.toastVisible=false;},2800);
    }
  },

  template: '\
    <div class="gui-editor-shell">\
      <div class="gui-editor-shell__editor-pane">\
        <mermaid-editor\
          :value="script"\
          :error="error"\
          :diagram-type="model.type"\
          @input="onScriptChange"\
        ></mermaid-editor>\
      </div>\
      <div class="gui-editor-shell__preview-pane">\
        <mermaid-toolbar\
          :diagram-type="model.type"\
          :direction="model.direction"\
          :can-undo="canUndo"\
          :can-redo="canRedo"\
          :autonumber="!!model.autonumber"\
          @add-node="addNode"\
          @add-sequence-participant="addSequenceParticipant"\
          @add-sequence-actor="addSequenceActor"\
          @add-sequence-message="addSequenceMessage"\
          @toggle-autonumber="toggleAutonumber"\
          @undo="undo"\
          @redo="redo"\
          @change-direction="changeDirection"\
          @zoom-in="zoomIn"\
          @zoom-out="zoomOut"\
          @fit-view="fitView"\
          @copy-svg="copySvg"\
          @export-png="exportPng"\
        ></mermaid-toolbar>\
        <mermaid-preview\
          ref="preview"\
          :model="model"\
          @add-node="addNode"\
          @add-edge="addEdge"\
          @add-sequence-message="addSequenceMessage"\
          @delete-selected="deleteSelected"\
          @update-node-text="updateNodeText"\
          @update-node-shape="updateNodeShape"\
          @update-edge-text="updateEdgeText"\
          @update-node-style="updateNodeStyle"\
          @update-edge-style="updateEdgeStyle"\
          @update-node-fill="updateNodeFill"\
          @update-edge-color="updateEdgeColor"\
          @update-sequence-participant-text="updateSequenceParticipantText"\
          @update-sequence-message-text="updateSequenceMessageText"\
          @reverse-sequence-message="reverseSequenceMessage"\
          @toggle-sequence-message-line-type="toggleSequenceMessageLineType"\
          @set-sequence-message-line-type="setSequenceMessageLineType"\
          @toggle-participant-kind="toggleParticipantKind"\
          @move-sequence-participant="moveSequenceParticipant"\
          @node-selected="onNodeSelected"\
          @edge-selected="onEdgeSelected"\
          @sequence-participant-selected="onSequenceParticipantSelected"\
          @sequence-message-selected="onSequenceMessageSelected"\
          @undo="undo"\
          @redo="redo"\
        ></mermaid-preview>\
      </div>\
      <div\
        class="gui-editor-toast"\
        :class="[toastVisible ? \'gui-editor-toast--visible\' : \'\']"\
      >{{ toastMsg }}</div>\
    </div>\
  '
});


/* ===== src/runtime/GuiEditorMount.js ===== */
var GuiEditor = global.GuiEditor || (global.GuiEditor = {});

GuiEditor.componentName = 'mermaid-full-editor';

GuiEditor.mount = function (target, options) {
  options = options || {};

  if (!global.Vue || !/^2\./.test(String(global.Vue.version || ''))) {
    throw new Error('GuiEditor.mount requires global Vue 2.');
  }

  var host = null;
  if (typeof target === 'string') {
    host = global.document.querySelector(target);
  } else if (target && target.nodeType === 1) {
    host = target;
  }

  if (!host) {
    throw new Error('GuiEditor.mount could not find the target element.');
  }

  if (host.__guiEditorMountInstance && typeof host.__guiEditorMountInstance.destroy === 'function') {
    host.__guiEditorMountInstance.destroy();
  }

  var mermaidInstance = global.mermaid;
  if (!mermaidInstance || typeof mermaidInstance.render !== 'function') {
    throw new Error('GuiEditor.mount requires global Mermaid to be loaded before mounting.');
  }

  if (options.initializeMermaid === true) {
    var defaultMermaidConfig = {
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        padding: 15,
        nodeSpacing: 50,
        rankSpacing: 50,
        useMaxWidth: false
      },
      sequence: {
        useMaxWidth: false,
        diagramMarginY: 40,
        actorMargin: 80,
        messageMargin: 48
      }
    };

    var isPlainObject = function (value) {
      return !!value && Object.prototype.toString.call(value) === '[object Object]';
    };

    var mergeDeep = function (base, extra) {
      var merged = {};
      var key;

      base = base || {};
      extra = extra || {};

      for (key in base) {
        if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
        merged[key] = base[key];
      }

      for (key in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, key)) continue;
        if (isPlainObject(merged[key]) && isPlainObject(extra[key])) {
          merged[key] = mergeDeep(merged[key], extra[key]);
        } else {
          merged[key] = extra[key];
        }
      }

      return merged;
    };

    mermaidInstance.initialize(mergeDeep(defaultMermaidConfig, options.mermaidConfig || {}));
  }

  var initialValue = '';
  if (options.initialValue !== undefined && options.initialValue !== null) {
    initialValue = String(options.initialValue);
  } else if (options.value !== undefined && options.value !== null) {
    initialValue = String(options.value);
  }

  var resolvedHeight = options.height;
  if (resolvedHeight === undefined || resolvedHeight === null || resolvedHeight === '') {
    resolvedHeight = '640px';
  } else if (typeof resolvedHeight === 'number') {
    resolvedHeight = resolvedHeight + 'px';
  } else {
    resolvedHeight = String(resolvedHeight);
  }

  var mountClasses = ['gui-editor-mount-root'];
  if (options.className) {
    mountClasses = mountClasses.concat(String(options.className).split(/\s+/).filter(Boolean));
  }

  var mountApi = null;

  var vm = new global.Vue({
    data: function () {
      return {
        currentValue: initialValue
      };
    },

    render: function (h) {
      var self = this;

      return h('div', {
        class: mountClasses,
        style: {
          width: '100%',
          height: resolvedHeight,
          minHeight: '0',
          display: 'flex'
        }
      }, [
        h('mermaid-full-editor', {
          props: {
            value: self.currentValue
          },
          on: {
            input: function (nextValue) {
              self.currentValue = nextValue;
              if (typeof options.onChange === 'function') {
                options.onChange(nextValue, mountApi);
              }
            }
          }
        })
      ]);
    }
  });

  vm.$mount();
  host.appendChild(vm.$el);

  mountApi = {
    setValue: function (nextValue) {
      if (!vm) return mountApi;
      vm.currentValue = nextValue == null ? '' : String(nextValue);
      return mountApi;
    },

    getValue: function () {
      if (!vm) return '';
      return vm.currentValue;
    },

    getRootElement: function () {
      if (!vm) return null;
      return vm.$el;
    },

    getVueInstance: function () {
      if (!vm) return null;
      return vm.$children[0] || null;
    },

    destroy: function () {
      if (!vm) return;

      var rootEl = vm.$el;
      vm.$destroy();

      if (rootEl && rootEl.parentNode) {
        rootEl.parentNode.removeChild(rootEl);
      }

      if (host.__guiEditorMountInstance === mountApi) {
        delete host.__guiEditorMountInstance;
      }

      vm = null;
    }
  };

  host.__guiEditorMountInstance = mountApi;

  if (typeof options.onMount === 'function') {
    options.onMount(mountApi);
  }

  return mountApi;
};


})(typeof window !== 'undefined' ? window : this);
