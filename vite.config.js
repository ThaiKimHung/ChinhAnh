import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * @imgly/background-removal always points onnxruntime at the WASM files on its
 * own CDN (ort.env.wasm.wasmPaths), so the ~24 MB copy that Vite emits from
 * onnxruntime-web is never requested. Drop it from the build output.
 */
function dropUnusedOnnxWasm() {
  return {
    name: 'drop-unused-onnx-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm[\w.-]*\.wasm$/.test(name)) delete bundle[name];
      }
    },
  };
}

// Cross-origin isolation lets the AI cutout run WebAssembly on several threads.
// `credentialless` keeps cross-origin CDN files (model, WASM) loadable without
// those servers having to opt in. Production gets the same headers from sw.js.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  // Set BASE_PATH (e.g. "/ChinhAnh/") when the app is served from a sub-path such as GitHub Pages.
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), dropUnusedOnnxWasm()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
