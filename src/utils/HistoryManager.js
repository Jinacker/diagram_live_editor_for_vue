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
