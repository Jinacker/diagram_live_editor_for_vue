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

  global.SequenceMessageCodec = {
    DEFAULT_OPERATOR: DEFAULT_OPERATOR,
    MESSAGE_RE: MESSAGE_RE,
    LINE_TYPE_OPTIONS: LINE_TYPE_OPTIONS,
    parseOperator: parseOperator,
    toggleLineStyle: toggleLineStyle
  };

})(typeof window !== 'undefined' ? window : this);
