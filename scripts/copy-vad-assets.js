/**
 * copy-vad-assets.js
 * Copies @ricky0123/vad-web and onnxruntime-web static assets to public/
 * so they can be fetched at runtime by the browser.
 * Run automatically via "postinstall" in package.json.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

/** Copy src (relative to node_modules) → public/destName */
function copy(srcRelative, destName) {
  const src = path.join(root, 'node_modules', srcRelative);
  const dest = path.join(publicDir, destName);
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Not found (skipping): ${srcRelative}`);
    return;
  }
  fs.copyFileSync(src, dest);
  const kb = (fs.statSync(dest).size / 1024).toFixed(0);
  console.log(`✅ ${destName} (${kb} KB)`);
}

console.log('\n📦 Copying VAD static assets to public/\n');

// VAD worklet bundle
copy('@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 'vad.worklet.bundle.min.js');

// Silero VAD ONNX models
copy('@ricky0123/vad-web/dist/silero_vad_legacy.onnx', 'silero_vad_legacy.onnx');
copy('@ricky0123/vad-web/dist/silero_vad_v5.onnx', 'silero_vad_v5.onnx');

// onnxruntime-web WASM binaries + companion .mjs entry points (all of them)
const ortDist = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
if (fs.existsSync(ortDist)) {
  const ortFiles = fs.readdirSync(ortDist).filter(
    (f) => f.endsWith('.wasm') || f.endsWith('.mjs'),
  );
  ortFiles.forEach((f) => copy(`onnxruntime-web/dist/${f}`, f));
} else {
  console.warn('⚠️  onnxruntime-web/dist not found — ORT files not copied');
}

console.log('\n✔  Done.\n');
