/**
 * IdAllocator
 * GUI에서 새 노드/참가자를 추가할 때 충돌 없는 ID(`N12`, `P3` 등)를 할당한다.
 *
 * - script와 model 양쪽을 모두 살펴 충돌을 피한다 (parser가 누락한 ID도 보호).
 * - counter는 한 번 올라가면 절대 내려가지 않는다 (단조 증가).
 * - prefix별 인스턴스 생성: `new IdAllocator('N')` / `new IdAllocator('P')`.
 */
(function (global) {
  'use strict';

  function IdAllocator(prefix) {
    this.prefix = prefix;
    this.counter = 0;
  }

  // script의 prefix+숫자와 modelItems의 ID 끝 숫자를 모두 훑어 counter를 끌어올린다.
  // 사용자가 수동으로 큰 번호를 쓴 ID를 보존하기 위함.
  IdAllocator.prototype.seed = function (script, items) {
    var max = this._scanScriptMax(script);
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i] && list[i].id || '');
      var nm = id.match(/(\d+)$/);
      if (nm) {
        var n = parseInt(nm[1], 10);
        if (n > max) max = n;
      }
    }
    if (max > this.counter) this.counter = max;
  };

  // 충돌 없는 다음 ID를 반환. counter를 함께 증가시킴.
  IdAllocator.prototype.next = function (script, items) {
    var candidate = '';
    do {
      this.counter++;
      candidate = this.prefix + this.counter;
    } while (this.scriptContainsId(script, candidate) || this.itemsContainId(items, candidate));
    return candidate;
  };

  IdAllocator.prototype.scriptContainsId = function (script, id) {
    if (!id) return false;
    var escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escapedId + '\\b').test(script || '');
  };

  IdAllocator.prototype.itemsContainId = function (items, id) {
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return true;
    }
    return false;
  };

  IdAllocator.prototype._scanScriptMax = function (script) {
    var src = script || '';
    var escapedPrefix = String(this.prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('\\b' + escapedPrefix + '(\\d+)\\b', 'g');
    var max = 0;
    var match;
    while ((match = regex.exec(src))) {
      var n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
    return max;
  };

  global.IdAllocator = IdAllocator;

})(typeof window !== 'undefined' ? window : this);
