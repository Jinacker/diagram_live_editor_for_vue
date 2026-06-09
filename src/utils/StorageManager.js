(function (global) {
  'use strict';

  var STORAGE_KEY = 'mermaid-live-editor-v1';

  var StorageManager = {
    save: function (data) {
      // 에디터 내용과 좌우 패널 비율만 로컬에 저장한다.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        // 용량 초과나 접근 불가 상황은 조용히 무시한다.
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
