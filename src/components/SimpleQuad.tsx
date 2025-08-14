// src/components/SimpleQuad.tsx
import React, { useOne, PropsWithChildren } from '@use-gpu/live';
import type { LC } from '@use-gpu/live';

import { WebGPU, AutoCanvas } from '@use-gpu/webgpu';
import {
  LinearRGB, Pass, Data, FaceLayer, OrbitCamera,
  ShaderFlatMaterial, useShader, useShaderRef, useTimeContext,
  useAnimationFrame, PBRMaterial, AmbientLight, DirectionalLight,
} from '@use-gpu/workbench';
import { FPSControls } from '@use-gpu/interact';

import { vec3 } from 'gl-matrix';
import { WGSLLinker } from '@use-gpu/shader';
import { Plot, Arrow, Line } from '@use-gpu/plot';

// ---- Fragment shader for the small quad (pulsing green tint) ----
const redTintShader = WGSLLinker.wgsl`
  @optional @link fn getTime() -> f32 { return 0.0; }
  @export fn main(
    inColor: vec4<f32>,
    mapUV: vec4<f32>,
    mapST: vec4<f32>,
  ) -> vec4<f32> {
    let t = getTime();
    return vec4<f32>(0.0, abs(sin(t * 4.0)) * 0.2, 0.0, 1.0);
  }
`;

// ---- Camera (orthographic via OrbitCamera scale) ----
const Camera = ({children}: PropsWithChildren<object>) => (
  <FPSControls
    position={[0.2, 0.0, 1.5]}
    bearing={0.1}
    pitch={0.1}
    moveSpeed={8}
  >{
    (phi: number, theta: number, target: vec3) => (
      <OrbitCamera
        radius={0}
        phi={phi}
        theta={theta}
        target={target}
        scale={1080}
      >
        {children}
      </OrbitCamera>
    )
  }</FPSControls>
);

// ---- Quad data (positions / uvs / colors) ----
const schema = {
  positions: { prop: 'position', format: 'vec3<f32>' },
  uvs:       { prop: 'uv',       format: 'vec2<f32>' },
  colors:    { prop: 'color',    format: 'vec4<f32>' },
};

const data = [
  { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] }, // 红
  { position: [ .2, -.1, 0], uv: [1, 1], color: [0, 1, 0, 1] }, // 绿
  { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] }, // 蓝
  { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] },
  { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] },
  { position: [-.2,  .1, 0], uv: [0, 0], color: [1, 1, 0, 1] }, // 黄
];

// ---- Small pulsing quad ----
const QuadContent: LC<{}> = () => {
  useAnimationFrame();
  const time = useTimeContext();
  const getTimeRef = useShaderRef(time.elapsed);
  const fragment = useShader(redTintShader, [getTimeRef]);

  return (
    <Data data={data} schema={schema}>
      {({positions, uvs, colors}) => (
        <ShaderFlatMaterial fragment={fragment}>
          <FaceLayer positions={positions} uvs={uvs} colors={colors} />
        </ShaderFlatMaterial>
      )}
    </Data>
  );
};

// ---- Helix path generator ----
function makeHelixPath(opts: {
  center: [number, number, number];
  radius: number;
  height: number;
  turns: number;
  steps: number;
  phase?: number;
  axis?: 'x' | 'y' | 'z';
}): number[][] {
  const {
    center: [cx, cy, cz],
    radius,
    height,
    turns,
    steps,
    phase = 0,
    axis = 'z',
  } = opts;

  const pts: number[][] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const theta = 2 * Math.PI * turns * t + phase;
    const h = height * (t - 0.5);

    let x = cx, y = cy, z = cz;
    if (axis === 'z') {
      x = cx + radius * Math.cos(theta);
      y = cy + radius * Math.sin(theta);
      z = cz + h;
    } else if (axis === 'y') {
      x = cx + radius * Math.cos(theta);
      y = cy + h;
      z = cz + radius * Math.sin(theta);
    } else {
      x = cx + h;
      y = cy + radius * Math.cos(theta);
      z = cz + radius * Math.sin(theta);
    }
    pts.push([x, y, z]);
  }
  return pts;
}

// ---- Helix neighbor (Arrow + PBR + shadows) ----
const HelixNeighbor: LC<{}> = () => {
  useAnimationFrame();
  const time = useTimeContext();
  const phase = time.elapsed * 0.003;

  const path = makeHelixPath({
    center: [0.85, 0.0, 0.02], // 稍微靠近相机
    radius: 0.12,
    height: 0.6,
    turns: 2.0,
    steps: 200,
    phase,
    axis: 'z',
  });

  return (
    <Plot>
      <PBRMaterial albedo={[0.25, 0.7, 1.0, 1]} roughness={0.35} metalness={0.0}>
        <Line
          positions={path}
          width={0.1}
          depth={-1}     // 世界厚度（阴影需要）
          sides={14}
          join="tangent" // 螺旋用 tangent 更顺滑
          shaded
          shadow
        />
      </PBRMaterial>
    </Plot>
  );
};

// ---- Sine neighbor (Arrow + PBR + shadows) ----
const TubeNeighbor: LC<{}> = () => {
  useAnimationFrame();
  const time = useTimeContext();
  const phase = time.elapsed * 0.005;

  function makeSinePath(start:[number,number,number], dx:number, steps:number): number[][] {
    const pts: number[][] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const x = start[0] + dx * t;
      const y = start[1] + 0.18 * Math.sin(2 * Math.PI * t + phase);
      const z = start[2] + 0.12 * Math.sin(Math.PI * t + phase * 0.7);
      pts.push([x, y, z]);
    }
    return pts;
  }

  // 静态采样（如需随时间重算，把 [] 改成 [phase] 或直接每帧计算）
  const path = useOne(() => makeSinePath([0.55, -0.15, 0], 3.35, 64), []);

  return (
    <Plot>
      <PBRMaterial albedo={[1.0, 0.75, 0.25, 1]} roughness={0.5} metalness={0.1}>
        <Arrow
          positions={path}
          width={0.03}
          depth={-1}
          sides={12}
          join="round"
          shaded
          shadow
        />
      </PBRMaterial>
    </Plot>
  );
};

// ---- App ----
export const QuadTest: LC<{canvas: HTMLCanvasElement}> = ({ canvas }) => {
  return (
    <WebGPU fallback={<p>WebGPU is not supported.</p>}>
      <AutoCanvas
        canvas={canvas}
        samples={4}
        backgroundColor={[.2, 0.2, 0.2, 1]}
      >
        <LinearRGB>
          <Camera>
            <Pass lights shadows ssao overscan={0.03}>
              {/* 灯光 */}
              <AmbientLight intensity={0.25} />
              <DirectionalLight
                position={[-1.5, 2.5, 1.2, 1]}
                intensity={1.1}
                color={[1, 1, 1, 1]}
                shadowMap={{
                  size: [1024, 1024],
                  span: [4, 4],
                  depth: [0.1, 6],
                  bias: [1/4096, 1/2048, 0],
                  blur: 2,
                }}
              />

              {/* 内容 */}
              <QuadContent />
              <TubeNeighbor />
              <HelixNeighbor />
            </Pass>
          </Camera>
        </LinearRGB>
      </AutoCanvas>
    </WebGPU>
  );
};








//  <Data
// schema={schema}
// data={data}
// render={({ positions, uvs, colors }) => (
//     <FaceLayer positions={positions} uvs={uvs} colors={colors} />
// )}
// /> 




//   const schema = useOne(() => ({
//     positions: { prop: 'position', format: 'vec3<f32>' },
//     uvs: { prop: 'uv', format: 'vec2<f32>' },
//     colors:    { prop: 'color',    format: 'vec4<f32>' }, 
//   }), []);





//   const data = useOne(() => ([
//     { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] }, // 红
//     { position: [ .2, -.1, 0], uv: [1, 1], color: [0, 1, 0, 1] }, // 绿
//     { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] }, // 蓝
//     { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] },
//     { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] },
//     { position: [-.2,  .1, 0], uv: [0, 0], color: [1, 1, 0, 1] }, // 黄
//   ]), []);