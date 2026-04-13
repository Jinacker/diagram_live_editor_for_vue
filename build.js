/**
 * gui-editor bundle builder
 * Usage: node build.js
 * Output: dist/gui-editor.bundle.js
 *
 * 의존성 순서가 중요하다 — 하위 유틸부터 상위 컴포넌트 순으로 나열.
 */
const fs = require('fs');
const path = require('path');

const files = [
  'src/sequence-parser.js',
  'src/sequence-generator.js',
  'src/mermaid-parser.js',
  'src/mermaid-generator.js',
  'src/services/HistoryManager.js',
  'src/actions/SvgPositionTracker.js',
  'src/actions/SvgNodeHandler.js',
  'src/actions/SvgEdgeHandler.js',
  'src/actions/PortDragHandler.js',
  'src/actions/SequencePositionTracker.js',
  'src/actions/SequenceMessageDragHandler.js',
  'src/actions/SequenceSvgHandler.js',
  'src/components/MermaidEditor.js',
  'src/components/MermaidToolbar.js',
  'src/components/MermaidPreview.js',
  'src/components/MermaidFullEditor.js',
];

const banner = `/**
 * gui-editor.bundle.js
 * Built: ${new Date().toISOString()}
 *
 * Concatenation of gui-editor source files (no minification).
 * Requires: Vue 2, Mermaid (loaded separately before this bundle).
 *
 * Exposes global Vue components:
 *   <mermaid-full-editor> — all-in-one embed component (text + GUI)
 */
`;

fs.mkdirSync('dist', { recursive: true });

const parts = [banner];
for (const file of files) {
  const abs = path.join(__dirname, file);
  if (!fs.existsSync(abs)) {
    console.error('Missing:', abs);
    process.exit(1);
  }
  const src = fs.readFileSync(abs, 'utf8');
  parts.push(`/* ===== ${file} ===== */\n${src}`);
  console.log('  +', file);
}

const bundle = parts.join('\n\n');
const outPath = path.join(__dirname, 'dist', 'gui-editor.bundle.js');
fs.writeFileSync(outPath, bundle, 'utf8');
console.log(`\nBundle written: ${outPath} (${(bundle.length / 1024).toFixed(1)} KB)`);