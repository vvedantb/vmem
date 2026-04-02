import { NodeProgram, type ProgramInfo } from "sigma/rendering";
import type { NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;

const UNIFORMS = ["u_sizeRatio", "u_pixelRatio", "u_matrix"] as const;

const VERTEX_SHADER = /* glsl */ `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
attribute vec4 a_id;

uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform mat3 u_matrix;

varying vec4 v_color;
varying float v_border;

void main() {
  float size = a_size * u_sizeRatio * 4.0;

  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  gl_PointSize = size * u_pixelRatio;

  v_color = a_color;
  v_border = 0.5 / size;

  #ifdef PICKING_MODE
  v_color = a_id;
  #endif
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying float v_border;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord) * 2.0;

  #ifdef PICKING_MODE
  if (dist > 1.0) discard;
  gl_FragColor = v_color;
  return;
  #endif

  float coreRadius = 0.5;
  float glowRadius = 1.0;

  if (dist <= coreRadius) {
    gl_FragColor = v_color;
    return;
  }

  if (dist <= glowRadius) {
    float t = (dist - coreRadius) / (glowRadius - coreRadius);
    float falloff = 1.0 - t * t;
    gl_FragColor = vec4(v_color.rgb, v_color.a * falloff * 0.35);
    return;
  }

  discard;
}
`;

export default class NodeGlowProgram extends NodeProgram<
  (typeof UNIFORMS)[number]
> {
  getDefinition() {
    return {
      VERTICES: 1,
      VERTEX_SHADER_SOURCE: VERTEX_SHADER,
      FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER,
      METHOD: WebGLRenderingContext.POINTS,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
    };
  }

  processVisibleItem(
    nodeIndex: number,
    startIndex: number,
    data: NodeDisplayData,
  ) {
    const array = this.array;
    array[startIndex++] = data.x;
    array[startIndex++] = data.y;
    array[startIndex++] = data.size;
    array[startIndex++] = floatColor(data.color);
    array[startIndex] = nodeIndex;
  }

  setUniforms(
    params: RenderParams,
    { gl, uniformLocations }: ProgramInfo,
  ): void {
    const { u_sizeRatio, u_pixelRatio, u_matrix } = uniformLocations;
    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform1f(u_pixelRatio, params.pixelRatio);
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
  }
}
