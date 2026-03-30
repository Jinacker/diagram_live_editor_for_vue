/**
 * App Entry Point
 * Initializes the Vue 2 application and mounts the MermaidLiveEditor.
 */

(function () {
  'use strict';

  // Initialize Mermaid with dark theme
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        padding: 15,
        nodeSpacing: 50,
        rankSpacing: 50,
        useMaxWidth: false
      },
      themeVariables: {
        darkMode: true,
        background: '#1c1f2e',
        primaryColor: '#6366f1',
        primaryTextColor: '#e4e6f0',
        primaryBorderColor: '#818cf8',
        secondaryColor: '#232738',
        tertiaryColor: '#2a2f45',
        lineColor: '#818cf8',
        textColor: '#e4e6f0',
        mainBkg: '#232738',
        nodeBorder: '#818cf8',
        clusterBkg: '#1c1f2e',
        clusterBorder: '#5c6380',
        titleColor: '#e4e6f0',
        edgeLabelBackground: '#232738',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px'
      }
    });
  }

  // Create Vue instance
  new Vue({
    el: '#app',
    template: '<mermaid-live-editor></mermaid-live-editor>'
  });

})();
