// WebGL2 implementation of `processImagePipeline` (imagePipeline.js).
//
// Every step mirrors the CPU code so both paths produce the same pixels (within
// float rounding). Passes, all rendered into RGBA8 textures:
//   1-2. separable box blur of the source for skin smoothing   (if skinSmooth > 0)
//   3-4. separable box blur of the source for clarity          (if clarity != 0)
//   5.   per-pixel beauty + color pipeline
//   6.   3×3 unsharp mask                                       (if sharpen > 0)
// The result is read back into an ImageData because cutout matting, compositing
// and text overlays run on the CPU / 2D canvas.
//
// Falls back to the CPU pipeline when WebGL2 is unavailable, the image exceeds
// the GPU's texture limits, or anything fails (the GPU path is then disabled
// for the session).

import { HIGHLIGHT_KNEE, HIGHLIGHT_SOFTNESS, SKIN_TEXTURE_KEEP, processImagePipeline } from './imagePipeline.js';
import { SKIN_MASK_SCALE, getEffectiveSkinMask } from './skinMask.js';

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform ivec2 u_size;
uniform ivec2 u_dir;
uniform int u_radius;
uniform bool u_alphaWeighted;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int k = -u_radius; k <= u_radius; k++) {
    vec4 px = texelFetch(u_src, clamp(p + u_dir * k, ivec2(0), u_size - 1), 0);
    sum += u_alphaWeighted ? vec4(px.rgb * px.a, px.a) : px;
  }
  float count = float(2 * u_radius + 1);
  if (u_alphaWeighted) {
    o = vec4(sum.a > 0.0 ? sum.rgb / sum.a : vec3(0.0), sum.a / count);
  } else {
    o = sum / count;
  }
}`;

const MAIN = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform sampler2D u_skinBlur;
uniform sampler2D u_clarityBlur;
uniform sampler2D u_fineBlur;
uniform sampler2D u_skinMask;
uniform vec2 u_skinMaskSize;
uniform float u_textureKeep;
uniform ivec2 u_size;
uniform bool u_hasBeauty;
uniform bool u_hasSkinBlur;
uniform bool u_hasClarity;
uniform bool u_hasHsl;
uniform float u_smoothStrength;
uniform float u_brightenAmount;
uniform float u_rosyAmount;
uniform float u_clarityAmount;
uniform float u_expFactor;
uniform float u_tempShift;
uniform float u_tintShift;
uniform float u_hlAmount;
uniform float u_shAmount;
uniform float u_contrastFactor;
uniform float u_satFactor;
uniform float u_vibAmount;
uniform float u_fadeAmount;
uniform float u_vigStrength;
uniform float u_grainAmount;
uniform vec3 u_hsl[6];
out vec4 o;

const float BAND_CENTER[6] = float[6](0.0, 30.0, 60.0, 125.0, 215.0, 290.0);
const float BAND_SPAN[6] = float[6](35.0, 30.0, 35.0, 55.0, 55.0, 50.0);

vec3 shoulder(vec3 v) {
  vec3 soft = ${HIGHLIGHT_KNEE.toFixed(1)} + ${HIGHLIGHT_SOFTNESS.toFixed(1)} * (1.0 - exp(-(v - ${HIGHLIGHT_KNEE.toFixed(1)}) / ${HIGHLIGHT_SOFTNESS.toFixed(1)}));
  return mix(v, soft, step(${HIGHLIGHT_KNEE.toFixed(1)}, v));
}

vec3 rgbToHsl(vec3 c) {
  vec3 n = c / 255.0;
  float mx = max(n.r, max(n.g, n.b));
  float mn = min(n.r, min(n.g, n.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == n.r) h = (n.g - n.b) / d + (n.g < n.b ? 6.0 : 0.0);
  else if (mx == n.g) h = (n.b - n.r) / d + 2.0;
  else h = (n.r - n.g) / d + 4.0;
  return vec3(h * 60.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(float hDeg, float s, float l) {
  float h = mod(hDeg, 360.0) / 360.0;
  if (s <= 0.0) return vec3(l * 255.0);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0)) * 255.0;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 srcPx = texelFetch(u_src, p, 0);
  if (srcPx.a == 0.0) {
    o = srcPx;
    return;
  }
  vec3 c = srcPx.rgb * 255.0;

  // 1. Portrait beauty (skin-masked, edge-preserving)
  if (u_hasBeauty) {
    float skinW = texture(u_skinMask, ((vec2(p) + 0.5) / ${SKIN_MASK_SCALE.toFixed(1)}) / u_skinMaskSize).r;
    if (skinW > 0.02) {
      if (u_hasSkinBlur) {
        vec3 bl = texelFetch(u_skinBlur, p, 0).rgb * 255.0;
        vec3 dv = abs(c - bl);
        float diff = (dv.r + dv.g + dv.b) / 3.0;
        float edgeKeep = exp(-(diff * diff) / 380.0);
        float blend = u_smoothStrength * skinW * edgeKeep * 0.85;
        vec3 fine = srcPx.rgb * 255.0 - texelFetch(u_fineBlur, p, 0).rgb * 255.0;
        c = c + (bl - c) * blend + fine * (blend * u_textureKeep);
      }
      if (u_brightenAmount > 0.0) {
        float add = u_brightenAmount * skinW;
        c += vec3(add, add * 0.96, add * 0.92);
      }
      if (u_rosyAmount > 0.0) {
        c += vec3(u_rosyAmount * skinW, -u_rosyAmount * 0.15 * skinW, u_rosyAmount * 0.12 * skinW);
      }
    }
  }

  // 2. Clarity
  if (u_hasClarity) {
    vec4 blurred = texelFetch(u_clarityBlur, p, 0);
    if (blurred.a > 0.0) {
      vec3 d = c - blurred.rgb * 255.0;
      float lum = dot(c, vec3(0.299, 0.587, 0.114)) / 255.0;
      float midMask = 1.0 - abs(lum - 0.5) * 1.4;
      c += d * (u_clarityAmount * max(0.2, midMask) * 0.85);
    }
  }

  // 3. Exposure
  c *= u_expFactor;

  // 4. Temperature & tint
  c += vec3(u_tempShift + u_tintShift * 0.35, -u_tintShift, -(u_tempShift - u_tintShift * 0.35));

  // 5. Highlights & shadows
  if (u_hlAmount != 0.0 || u_shAmount != 0.0) {
    float lum = clamp(dot(c, vec3(0.299, 0.587, 0.114)) / 255.0, 0.0, 1.0);
    if (u_shAmount != 0.0) c += u_shAmount * pow(1.0 - lum, 1.6) * 75.0;
    if (u_hlAmount != 0.0) c += u_hlAmount * pow(lum, 1.6) * 75.0;
  }

  // 6. Contrast
  c = (c - 128.0) * u_contrastFactor + 128.0;

  // 7. Saturation & vibrance
  if (u_satFactor != 1.0 || u_vibAmount != 0.0) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float effSat = u_satFactor;
    if (u_vibAmount != 0.0) {
      float maxC = clamp(max(c.r, max(c.g, c.b)), 0.0, 255.0);
      float minC = clamp(min(c.r, min(c.g, c.b)), 0.0, 255.0);
      float curSat = maxC > 0.0 ? (maxC - minC) / maxC : 0.0;
      effSat += u_vibAmount * (1.0 - curSat);
    }
    c = lum + (c - lum) * effSat;
  }

  // 8. HSL mixer
  if (u_hasHsl) {
    vec3 hsl = rgbToHsl(clamp(c, 0.0, 255.0));
    if (hsl.y > 0.02) {
      vec3 delta = vec3(0.0);
      for (int k = 0; k < 6; k++) {
        vec3 v = u_hsl[k];
        if (v == vec3(0.0)) continue;
        float rawDist = abs(hsl.x - BAND_CENTER[k]);
        float dist = min(rawDist, 360.0 - rawDist);
        if (dist < BAND_SPAN[k]) delta += v * (1.0 - dist / BAND_SPAN[k]);
      }
      if (delta != vec3(0.0)) {
        float nh = hsl.x + delta.x * 0.45;
        float ns = clamp(hsl.y * (1.0 + delta.y / 100.0), 0.0, 1.0);
        float nl = clamp(hsl.z + (delta.z / 100.0) * 0.35 * (1.0 - abs(hsl.z - 0.5) * 1.2), 0.0, 1.0);
        c = hslToRgb(nh, ns, nl);
      }
    }
  }

  // 9. Film fade
  if (u_fadeAmount > 0.0) c += u_fadeAmount * (1.0 - clamp(c, 0.0, 255.0) / 255.0);

  // 10. Vignette
  if (u_vigStrength > 0.0) {
    vec2 half_ = vec2(u_size) * 0.5;
    vec2 nrm = (vec2(p) - half_) / half_;
    float dist2 = dot(nrm, nrm);
    c *= 1.0 - min(0.85, max(0.0, (dist2 - 0.35) * 0.55 * u_vigStrength));
  }

  // 11. Film grain (same integer hash as the CPU path)
  if (u_grainAmount > 0.0) {
    uint h = (uint(p.x) * 0x27d4eb2du) ^ (uint(p.y) * 0x165667b1u);
    h ^= h >> 15u;
    h *= 0x85ebca6bu;
    h ^= h >> 13u;
    h *= 0xc2b2ae35u;
    h ^= h >> 16u;
    c += (float(h & 255u) / 255.0 - 0.5) * u_grainAmount;
  }

  // Highlight shoulder (same as rollOff in imagePipeline.js).
  vec3 base = srcPx.rgb * 255.0;
  if (u_satFactor == 0.0 && u_vibAmount == 0.0) {
    base = vec3(dot(base, vec3(0.299, 0.587, 0.114)));
  }
  vec3 rolled = base + shoulder(c) - shoulder(base);
  c = mix(c, rolled, step(base, c));
  o = vec4(clamp(c, 0.0, 255.0) / 255.0, srcPx.a);
}`;

const SHARPEN = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform ivec2 u_size;
uniform float u_gain;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(u_src, p, 0);
  if (p.x < 1 || p.y < 1 || p.x >= u_size.x - 1 || p.y >= u_size.y - 1 || c.a == 0.0) {
    o = c;
    return;
  }
  vec4 t = texelFetch(u_src, p + ivec2(0, -1), 0);
  vec4 b = texelFetch(u_src, p + ivec2(0, 1), 0);
  vec4 l = texelFetch(u_src, p + ivec2(-1, 0), 0);
  vec4 r = texelFetch(u_src, p + ivec2(1, 0), 0);
  vec3 C = c.rgb * 255.0;
  // Transparent neighbours have no visible contrast to sharpen.
  vec3 contrast = (C - t.rgb * 255.0) * (t.a * 255.0)
    + (C - b.rgb * 255.0) * (b.a * 255.0)
    + (C - l.rgb * 255.0) * (l.a * 255.0)
    + (C - r.rgb * 255.0) * (r.a * 255.0);
  o = vec4(clamp(C + contrast * u_gain, 0.0, 255.0) / 255.0, c.a);
}`;

let engine; // undefined: not tried yet, null: unavailable, object: ready

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
  }
  return shader;
}

function link(gl, vertex, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

function createEngine() {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(1, 1)
    : globalThis.document?.createElement('canvas');
  const gl = canvas?.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const e = {
    gl,
    blur: link(gl, vertex, BLUR),
    main: link(gl, vertex, MAIN),
    sharpen: link(gl, vertex, SHARPEN),
    vao: gl.createVertexArray(),
    skinTex: (() => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
      return t;
    })(),
    fbo: gl.createFramebuffer(),
    textures: [],
    size: null,
    maxSize: Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
  };
  canvas.addEventListener?.('webglcontextlost', () => {
    if (engine === e) engine = undefined;
  });
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  return e;
}

function getEngine() {
  if (engine === undefined) {
    try {
      engine = createEngine();
    } catch (error) {
      console.warn('WebGL pipeline unavailable, using CPU:', error);
      engine = null;
    }
  }
  if (engine?.gl.isContextLost()) engine = undefined;
  return engine ?? null;
}

/** Six same-size RGBA8 textures: source, three blur results, scratch, output. */
function ensureTextures(e, width, height) {
  const { gl } = e;
  if (e.size && e.size.width === width && e.size.height === height) return;
  e.textures.forEach((t) => gl.deleteTexture(t));
  e.textures = Array.from({ length: 6 }, () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    return t;
  });
  e.size = { width, height };
}

function runPass(e, pass, target, inputs, setUniforms) {
  const { gl } = e;
  gl.useProgram(pass.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, e.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  inputs.forEach(([name, texture], unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(pass.uniforms[name], unit);
  });
  gl.uniform2i(pass.uniforms.u_size, e.size.width, e.size.height);
  setUniforms?.(gl, pass.uniforms);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function boxBlur(e, source, scratch, target, radius, alphaWeighted = false) {
  const r = Math.max(1, Math.round(radius));
  const set = (dx, dy) => (gl, u) => {
    gl.uniform2i(u.u_dir, dx, dy);
    gl.uniform1i(u.u_radius, r);
    gl.uniform1i(u.u_alphaWeighted, alphaWeighted ? 1 : 0);
  };
  runPass(e, e.blur, scratch, [['u_src', source]], set(1, 0));
  runPass(e, e.blur, target, [['u_src', scratch]], set(0, 1));
}

function hasHslChanges(hsl) {
  return !!hsl && Object.values(hsl).some((v) => v && (v[0] !== 0 || v[1] !== 0 || v[2] !== 0));
}

const HSL_KEYS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

/** GPU version of `processImagePipeline`; returns null when the GPU path cannot be used. */
export function processImageGpu(srcImageData, adjustments, beauty, skinOverride = null) {
  const e = getEngine();
  if (!e) return null;
  const { width, height } = srcImageData;
  if (width > e.maxSize || height > e.maxSize) return null;
  const { gl } = e;

  ensureTextures(e, width, height);
  const [srcTex, skinTex, clarityTex, scratchTex, outTex, fineTex] = e.textures;
  gl.bindVertexArray(e.vao);
  gl.viewport(0, 0, width, height);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  const src = srcImageData.data;
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array(src.buffer, src.byteOffset, src.byteLength));

  const minSide = Math.min(width, height);
  const hasSkinBlur = beauty.skinSmooth > 0;
  if (hasSkinBlur) {
    boxBlur(e, srcTex, scratchTex, skinTex, Math.max(2, Math.round((minSide / 360) * (2 + beauty.skinSmooth * 0.06))));
    boxBlur(e, srcTex, scratchTex, fineTex, 1);
  }
  const clarity = adjustments.clarity || 0;
  if (clarity !== 0) {
    boxBlur(e, srcTex, scratchTex, clarityTex, Math.max(3, Math.round(minSide / 140)), true);
  }

  const hasBeauty = beauty.skinSmooth > 0 || beauty.skinBrighten > 0 || beauty.skinRosy > 0;
  let skinSize = [1, 1];
  if (hasBeauty) {
    const skin = getEffectiveSkinMask(srcImageData, skinOverride);
    gl.bindTexture(gl.TEXTURE_2D, e.skinTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, skin.width, skin.height, 0, gl.RED, gl.UNSIGNED_BYTE, skin.mask);
    skinSize = [skin.width, skin.height];
  }

  const sharpen = adjustments.sharpen > 0;
  const mainTarget = sharpen ? scratchTex : outTex;
  runPass(
    e,
    e.main,
    mainTarget,
    [['u_src', srcTex], ['u_skinBlur', skinTex], ['u_clarityBlur', clarityTex], ['u_fineBlur', fineTex], ['u_skinMask', e.skinTex]],
    (g, u) => {
      g.uniform1i(u.u_hasBeauty, hasBeauty ? 1 : 0);
      g.uniform2f(u.u_skinMaskSize, skinSize[0], skinSize[1]);
      g.uniform1i(u.u_hasSkinBlur, hasSkinBlur ? 1 : 0);
      g.uniform1i(u.u_hasClarity, clarity !== 0 ? 1 : 0);
      g.uniform1i(u.u_hasHsl, hasHslChanges(adjustments.hsl) ? 1 : 0);
      g.uniform1f(u.u_smoothStrength, beauty.skinSmooth / 100);
      g.uniform1f(u.u_textureKeep, SKIN_TEXTURE_KEEP);
      g.uniform1f(u.u_brightenAmount, beauty.skinBrighten * 0.35);
      g.uniform1f(u.u_rosyAmount, beauty.skinRosy * 0.22);
      g.uniform1f(u.u_clarityAmount, clarity / 100);
      g.uniform1f(u.u_expFactor, adjustments.exposure !== 0 ? Math.pow(2, adjustments.exposure / 55) : 1);
      const tempOn = adjustments.temperature !== 0 || adjustments.tint !== 0;
      g.uniform1f(u.u_tempShift, tempOn ? adjustments.temperature * 0.65 : 0);
      g.uniform1f(u.u_tintShift, tempOn ? adjustments.tint * 0.5 : 0);
      g.uniform1f(u.u_hlAmount, adjustments.highlights / 100);
      g.uniform1f(u.u_shAmount, adjustments.shadows / 100);
      g.uniform1f(u.u_contrastFactor, adjustments.contrast !== 0 ? Math.pow((100 + adjustments.contrast) / 100, 2) : 1);
      g.uniform1f(u.u_satFactor, 1 + adjustments.saturation / 100);
      g.uniform1f(u.u_vibAmount, adjustments.vibrance / 100);
      g.uniform1f(u.u_fadeAmount, (adjustments.fade || 0) * 0.42);
      g.uniform1f(u.u_vigStrength, adjustments.vignette / 100);
      g.uniform1f(u.u_grainAmount, (adjustments.grain || 0) * 0.45);
      const hsl = new Float32Array(18);
      HSL_KEYS.forEach((key, k) => {
        const v = adjustments.hsl?.[key];
        if (v) hsl.set([v[0], v[1], v[2]], k * 3);
      });
      g.uniform3fv(u.u_hsl, hsl);
    }
  );

  if (sharpen) {
    runPass(e, e.sharpen, outTex, [['u_src', scratchTex]], (g, u) => {
      g.uniform1f(u.u_gain, ((adjustments.sharpen / 100) * 1.15) / (4 * 255));
    });
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, e.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete');
  const out = new Uint8ClampedArray(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.buffer));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`);
  return new ImageData(out, width, height);
}

let gpuDisabled = false;

/** Beauty + color pipeline: GPU when available, CPU otherwise. Same output either way. */
export function processImage(imageData, adjustments, beauty, skinOverride = null) {
  if (!gpuDisabled) {
    try {
      const result = processImageGpu(imageData, adjustments, beauty, skinOverride);
      if (result) return result;
    } catch (error) {
      console.warn('WebGL pipeline failed, switching to CPU:', error);
      gpuDisabled = true;
    }
  }
  return processImagePipeline(imageData, adjustments, beauty, skinOverride);
}

/** For diagnostics: whether the GPU path is currently in use. */
export function isGpuPipelineActive() {
  return !gpuDisabled && !!getEngine();
}
