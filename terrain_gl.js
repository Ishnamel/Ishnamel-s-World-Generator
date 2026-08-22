/**
 * ============================================================================
 * TERRAIN_GL.JS - Universal Mobile & Desktop WebGL2 Terrain Engine
 * ============================================================================
 * Features in-shader bilinear filtering (100% mobile compatible), dynamic 
 * resolution scaling for mobile canvas limits, and real-time 3D hillshading.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TerrainGL = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const VS_SOURCE = `#version 300 es
    in vec2 a_position;
    out vec2 v_uv;
    void main() {
      v_uv = (a_position + 1.0) * 0.5;
      v_uv.y = 1.0 - v_uv.y; // Flip Y for WebGL texture orientation
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FS_SOURCE = `#version 300 es
    precision highp float;

    uniform sampler2D u_elevationTex;
    uniform sampler2D u_zoneTex;
    uniform vec2 u_texelSize;
    uniform vec2 u_gridSize;
    uniform vec3 u_lightDir;
    uniform int u_style; // 0: biomes, 1: parchment, 2: dark
    uniform bool u_showHillshade;
    uniform bool u_showZoneOverlay;

    in vec2 v_uv;
    out vec4 fragColor;

    // Mobile-safe hardware-independent bilinear sampling
    float sampleElevationBilinear(vec2 uv) {
      vec2 pos = uv * u_gridSize - 0.5;
      vec2 f = fract(pos);
      vec2 uv0 = (floor(pos) + 0.5) * u_texelSize;

      float e00 = texture(u_elevationTex, uv0).r;
      float e10 = texture(u_elevationTex, uv0 + vec2(u_texelSize.x, 0.0)).r;
      float e01 = texture(u_elevationTex, uv0 + vec2(0.0, u_texelSize.y)).r;
      float e11 = texture(u_elevationTex, uv0 + u_texelSize).r;

      return mix(mix(e00, e10, f.x), mix(e01, e11, f.x), f.y);
    }

    vec3 getBiomeColor(float e, int style) {
      if (style == 0) { // Realistic Biomes
        if (e < 0.25) return vec3(18.0, 50.0, 95.0) / 255.0;
        if (e < 0.38) return vec3(32.0, 80.0, 135.0) / 255.0;
        if (e < 0.40) return vec3(60.0, 125.0, 170.0) / 255.0;
        if (e < 0.44) return vec3(210.0, 195.0, 140.0) / 255.0;
        if (e < 0.62) return vec3(90.0, 140.0, 70.0) / 255.0;
        if (e < 0.74) return vec3(40.0, 100.0, 50.0) / 255.0;
        if (e < 0.85) return vec3(110.0, 120.0, 80.0) / 255.0;
        if (e < 0.93) return vec3(115.0, 110.0, 105.0) / 255.0;
        return vec3(240.0, 240.0, 250.0) / 255.0;
      } else if (style == 1) { // Parchment
        if (e < 0.25) return vec3(175.0, 160.0, 130.0) / 255.0;
        if (e < 0.38) return vec3(190.0, 175.0, 145.0) / 255.0;
        if (e < 0.40) return vec3(205.0, 190.0, 160.0) / 255.0;
        if (e < 0.44) return vec3(220.0, 205.0, 175.0) / 255.0;
        if (e < 0.62) return vec3(230.0, 218.0, 188.0) / 255.0;
        if (e < 0.74) return vec3(215.0, 200.0, 170.0) / 255.0;
        if (e < 0.85) return vec3(200.0, 185.0, 155.0) / 255.0;
        if (e < 0.93) return vec3(170.0, 155.0, 130.0) / 255.0;
        return vec3(240.0, 230.0, 210.0) / 255.0;
      } else { // Dark Fantasy
        if (e < 0.25) return vec3(10.0, 15.0, 25.0) / 255.0;
        if (e < 0.38) return vec3(20.0, 30.0, 48.0) / 255.0;
        if (e < 0.40) return vec3(35.0, 50.0, 75.0) / 255.0;
        if (e < 0.44) return vec3(80.0, 75.0, 65.0) / 255.0;
        if (e < 0.62) return vec3(40.0, 60.0, 45.0) / 255.0;
        if (e < 0.74) return vec3(20.0, 45.0, 30.0) / 255.0;
        if (e < 0.85) return vec3(60.0, 55.0, 50.0) / 255.0;
        if (e < 0.93) return vec3(90.0, 85.0, 80.0) / 255.0;
        return vec3(180.0, 185.0, 195.0) / 255.0;
      }
    }

    void main() {
      // 1. Sample elevation with universal bilinear filtering
      float e = sampleElevationBilinear(v_uv);

      // 2. Real-time 3D GPU Hillshade
      float shade = 1.0;
      if (u_showHillshade) {
        float left  = sampleElevationBilinear(v_uv - vec2(u_texelSize.x, 0.0));
        float right = sampleElevationBilinear(v_uv + vec2(u_texelSize.x, 0.0));
        float down  = sampleElevationBilinear(v_uv - vec2(0.0, u_texelSize.y));
        float up    = sampleElevationBilinear(v_uv + vec2(0.0, u_texelSize.y));

        float dzdx = (right - left) * 2.0;
        float dzdy = (up - down) * 2.0;
        vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));
        shade = clamp(0.6 + dot(normal, u_lightDir) * 0.8, 0.4, 1.4);
      }

      // 3. Base Biome Color
      vec3 col = getBiomeColor(e, u_style) * shade;

      // 4. Political Zone Tint Overlay
      if (u_showZoneOverlay && e >= 0.40) {
        vec4 zoneColor = texture(u_zoneTex, v_uv);
        if (zoneColor.a > 0.0) {
          col = mix(col, zoneColor.rgb, zoneColor.a);
        }
      }

      fragColor = vec4(col, 1.0);
    }
  `;

  class WebGLTerrainEngine {
    constructor() {
      this.gl = null;
      this.program = null;
      this.elevationTex = null;
      this.zoneTex = null;
      this.quadVao = null;
      this.gw = 2560;
      this.gh = 1440;
      this.isInitialized = false;
      this.currentZoneTier = 'none';
      this.uniforms = {};
    }

    init(canvas) {
      if (!canvas) return false;

      // Mobile Hardware Check: Clamp canvas size if exceeding device limits
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 1024;
      const testGl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const maxDim = testGl ? testGl.getParameter(testGl.MAX_TEXTURE_SIZE) : 4096;

      if (isMobile || maxDim < 5120) {
        canvas.width = Math.min(2560, maxDim);
        canvas.height = Math.min(1440, Math.round(maxDim * 9 / 16));
        
        const featCanvas = document.getElementById('featureCanvas');
        const actorCanvas = document.getElementById('actorCanvas');
        if (featCanvas) { featCanvas.width = canvas.width; featCanvas.height = canvas.height; }
        if (actorCanvas) { actorCanvas.width = canvas.width; actorCanvas.height = canvas.height; }
      }

      const gl = canvas.getContext('webgl2', {
        preserveDrawingBuffer: true,
        antialias: false,
        depth: false,
        powerPreference: "high-performance"
      });

      if (!gl) {
        console.warn("WebGL2 not available on this device, will fallback to 2D canvas.");
        return false;
      }

      this.gl = gl;

      const vs = this.compileShader(gl.VERTEX_SHADER, VS_SOURCE);
      const fs = this.compileShader(gl.FRAGMENT_SHADER, FS_SOURCE);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Shader Link Error:", gl.getProgramInfoLog(program));
        return false;
      }
      this.program = program;

      gl.useProgram(program);
      this.uniforms = {
        elevationTex: gl.getUniformLocation(program, 'u_elevationTex'),
        zoneTex: gl.getUniformLocation(program, 'u_zoneTex'),
        texelSize: gl.getUniformLocation(program, 'u_texelSize'),
        gridSize: gl.getUniformLocation(program, 'u_gridSize'),
        lightDir: gl.getUniformLocation(program, 'u_lightDir'),
        style: gl.getUniformLocation(program, 'u_style'),
        showHillshade: gl.getUniformLocation(program, 'u_showHillshade'),
        showZoneOverlay: gl.getUniformLocation(program, 'u_showZoneOverlay')
      };

      const quadVertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]);

      this.quadVao = gl.createVertexArray();
      gl.bindVertexArray(this.quadVao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // NEAREST filtering on R32F is 100% compliant on all mobile GPUs
      this.elevationTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.elevationTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      this.zoneTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.zoneTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      gl.uniform1i(this.uniforms.elevationTex, 0);
      gl.uniform1i(this.uniforms.zoneTex, 1);

      const lx = -0.707, ly = -0.707, lz = 0.5;
      const len = Math.hypot(lx, ly, lz);
      gl.uniform3f(this.uniforms.lightDir, lx / len, ly / len, lz / len);

      this.isInitialized = true;
      return true;
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader Compile Error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    uploadWorldData(worldData, activeZoneTier = 'none') {
      if (!this.isInitialized || !worldData) return;
      const gl = this.gl;
      this.gw = worldData.gw;
      this.gh = worldData.gh;

      gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.texelSize, 1.0 / this.gw, 1.0 / this.gh);
      gl.uniform2f(this.uniforms.gridSize, this.gw, this.gh);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.elevationTex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.R32F,
        this.gw, this.gh, 0,
        gl.RED, gl.FLOAT,
        worldData.elevation
      );

      this.updateZoneTexture(worldData, activeZoneTier, true);
    }

    updateZoneTexture(worldData, activeZoneTier = 'none', force = false) {
      if (!this.isInitialized || !worldData) return;
      
      if (!force && this.currentZoneTier === activeZoneTier) return;
      this.currentZoneTier = activeZoneTier;

      const gl = this.gl;
      const totalCells = this.gw * this.gh;
      const zoneBuffer = new Uint8Array(totalCells * 4);

      if (activeZoneTier !== 'none') {
        const { grandState, medState, smallState, grandZones, medZones, smallZones } = worldData;

        const colorMap = new Map();
        if (activeZoneTier === 'grand' && grandZones) {
          grandZones.forEach(z => { if (z && z.color) colorMap.set(z.id, z.color); });
        } else if (activeZoneTier === 'med' && medZones) {
          medZones.forEach(z => { if (z && z.color) colorMap.set(z.id, z.color); });
        } else if (activeZoneTier === 'small' && smallZones) {
          smallZones.forEach(z => { if (z && z.color) colorMap.set(z.id, z.color); });
        }

        const stateArray = (activeZoneTier === 'grand') ? grandState : (activeZoneTier === 'med' ? medState : smallState);

        if (stateArray) {
          for (let i = 0; i < totalCells; i++) {
            const zId = stateArray[i];
            if (zId >= 0) {
              const zColor = colorMap.get(zId);
              if (zColor) {
                const idx = i * 4;
                zoneBuffer[idx]     = zColor.fillR;
                zoneBuffer[idx + 1] = zColor.fillG;
                zoneBuffer[idx + 2] = zColor.fillB;
                zoneBuffer[idx + 3] = Math.round((zColor.alpha || 0.40) * 255);
              }
            }
          }
        }
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.zoneTex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA,
        this.gw, this.gh, 0,
        gl.RGBA, gl.UNSIGNED_BYTE,
        zoneBuffer
      );
    }

    updateElevationSubRegion(worldData, minX, minY, maxX, maxY) {
      if (!this.isInitialized || !worldData) return;
      const gl = this.gl;
      
      const x0 = Math.max(0, Math.min(this.gw - 1, minX));
      const x1 = Math.max(0, Math.min(this.gw - 1, maxX));
      const y0 = Math.max(0, Math.min(this.gh - 1, minY));
      const y1 = Math.max(0, Math.min(this.gh - 1, maxY));
      if (x0 > x1 || y0 > y1) return;

      const width = (x1 - x0) + 1;
      const height = (y1 - y0) + 1;
      if (width <= 0 || height <= 0) return;

      const subData = new Float32Array(width * height);
      for (let r = 0; r < height; r++) {
        const srcStart = (y0 + r) * this.gw + x0;
        subData.set(worldData.elevation.subarray(srcStart, srcStart + width), r * width);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.elevationTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0,
        x0, y0,
        width, height,
        gl.RED, gl.FLOAT,
        subData
      );
    }

    render(options = {}) {
      if (!this.isInitialized) return;
      const gl = this.gl;

      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.useProgram(this.program);

      let styleIdx = 0;
      if (options.style === 'parchment') styleIdx = 1;
      else if (options.style === 'dark') styleIdx = 2;

      const hasActiveZoneOverlay = this.currentZoneTier && this.currentZoneTier !== 'none';

      gl.uniform1i(this.uniforms.style, styleIdx);
      gl.uniform1i(this.uniforms.showHillshade, options.showHillshade ? 1 : 0);
      gl.uniform1i(this.uniforms.showZoneOverlay, hasActiveZoneOverlay ? 1 : 0);

      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  return new WebGLTerrainEngine();
}));
