/**
 * Sequence 메시지 operator 관련 규칙을 한 곳에서 관리하는 공용 헬퍼
 * - sequence-parser.js  : MESSAGE_RE 사용
 * - sequence-generator.js : DEFAULT_OPERATOR 사용
 * - SequenceSvgHandler.js : parseOperator / toggleLineStyle 사용
 * - MermaidPreview.js     : LINE_TYPE_OPTIONS 사용
 */
(function (global) {
  'use strict';

  var DEFAULT_OPERATOR = '->>';

  // 지원 operator 정규식 (activation suffix +/- 포함)
  var MESSAGE_RE = /^([A-Za-z0-9_\u3131-\uD79D]+)\s*((?:-->>|--x|--\)|-->|->>|-x|-\)|->)[+-]?)\s*([A-Za-z0-9_\u3131-\uD79D]+)\s*:(.*)$/;

  // UI 라벨 목록 (MermaidPreview sequence-toolbar 드롭다운)
  var LINE_TYPE_OPTIONS = [
    { operator: '->>',  label: '───▶' },
    { operator: '-->>',  label: '···▶' },
    { operator: '->',   label: '───'  },
    { operator: '-->',  label: '···'  },
    { operator: '-x',   label: '───x' },
    { operator: '--x',  label: '···x' },
    { operator: '-)',   label: '───)' },
    { operator: '--)',  label: '···)' }
  ];

  // solid(단일 dash) ↔ dotted(이중 dash) 토글 맵
  var TOGGLE_MAP = {
    '->>':  '-->>',  '-->>': '->>',
    '->':   '-->',   '-->':  '->',
    '-x':   '--x',   '--x':  '-x',
    '-)':   '--)',   '--)':  '-)'
  };

  // operator에서 activation suffix (+/-) 분리
  function parseOperator(operator) {
    var op = operator || DEFAULT_OPERATOR;
    var suffix = '';
    if (/[+-]$/.test(op)) {
      suffix = op.slice(-1);
      op = op.slice(0, -1);
    }
    return { base: op || DEFAULT_OPERATOR, suffix: suffix };
  }

  // solid ↔ dotted 토글 (activation suffix 유지)
  function toggleLineStyle(operator) {
    var parts = parseOperator(operator);
    var nextBase = TOGGLE_MAP.hasOwnProperty(parts.base) ? TOGGLE_MAP[parts.base] : parts.base;
    return nextBase + parts.suffix;
  }

  // activation +/- 균형 재계산
  // GUI에서 메시지를 지운 뒤 남은 -가 inactive participant에 붙어 있으면
  // Mermaid가 "Trying to inactivate an inactive participant"로 렌더 실패한다.
  // 실제로 active가 아닌 from에 붙은 -만 떼어내고, 나머지는 그대로 둔다.
  function normalizeActivations(messages) {
    var result = [];
    var activeCounts = {};
    for (var i = 0; i < messages.length; i++) {
      var msg = Object.assign({}, messages[i]);
      var parts = parseOperator(msg.operator);
      if (parts.suffix === '+') {
        activeCounts[msg.to] = (activeCounts[msg.to] || 0) + 1;
      }
      if (parts.suffix === '-') {
        if (activeCounts[msg.from] > 0) {
          activeCounts[msg.from]--;
        } else {
          msg.operator = parts.base;
        }
      }
      result.push(msg);
    }
    return result;
  }

  global.SequenceMessageCodec = {
    DEFAULT_OPERATOR: DEFAULT_OPERATOR,
    MESSAGE_RE: MESSAGE_RE,
    LINE_TYPE_OPTIONS: LINE_TYPE_OPTIONS,
    parseOperator: parseOperator,
    toggleLineStyle: toggleLineStyle,
    normalizeActivations: normalizeActivations
  };

})(typeof window !== 'undefined' ? window : this);
