(function (global) {
  'use strict';

  var MAX_STACK = 50;

  function HistoryManager() {
    this._past   = [];
    this._future = [];
  }

  // Call BEFORE a mutation — saves current model so it can be restored by undo
  HistoryManager.prototype.snapshot = function (model) {
    this._past.push(JSON.stringify(model));
    if (this._past.length > MAX_STACK) this._past.shift();
    this._future = []; // new action clears redo stack
  };

  // Returns the previous model (or null if nothing to undo)
  HistoryManager.prototype.undo = function (currentModel) {
    if (!this._past.length) return null;
    this._future.push(JSON.stringify(currentModel));
    return JSON.parse(this._past.pop());
  };

  // Returns the next model (or null if nothing to redo)
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
