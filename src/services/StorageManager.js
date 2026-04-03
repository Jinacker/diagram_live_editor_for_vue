(function (global) {
  'use strict';

  var STORAGE_KEY = 'mermaid-live-editor-v1';

  var StorageManager = {
    save: function (data) {
      // data = { script: string, editorWidth: number }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        // quota exceeded or unavailable — silently ignore
      }
    },

    load: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },

    clear: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  };

  global.StorageManager = StorageManager;

})(typeof window !== 'undefined' ? window : this);
