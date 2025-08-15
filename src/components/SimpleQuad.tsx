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











const neonGridShader = WGSLLinker.wgsl`
  @optional @link fn getTime() -> f32 { return 0.0; }

  // 网格参数（可热改）
  @optional @link fn getSpacing()     -> f32 { return 6.0; }   // 每世界单位多少格（越大越密）
  @optional @link fn getCorePx()      -> f32 { return 2.0; }   // 核心线宽（像素）
  @optional @link fn getGlowPx()      -> f32 { return 14.0; }  // 外发光宽度（像素）
  @optional @link fn getMajorEvery()  -> f32 { return 6.0; }   // 每多少格作为“主网格”
  @optional @link fn getMajorBoost()  -> f32 { return 1.6; }   // 主网格亮度加成

  // 地平线位置（用世界 z = uv.y）
  @optional @link fn getHStart() -> f32 { return 36.0; }  // 开始增亮
  @optional @link fn getHEnd()   -> f32 { return 60.0; }  // 完全贴近地平

  fn lineMask(d: f32, w: f32, aa: f32) -> f32 {
    // 0..1 线条强度；d 为到最近线的距离（UV 空间）
    return 1.0 - smoothstep(w - aa, w + aa, d);
  }

  @export fn main(
    inColor: vec4<f32>,
    mapUV: vec4<f32>,
    mapST: vec4<f32>,
  ) -> vec4<f32> {
    let uv = mapUV.xy;        // 我们把 uv 当成世界 xz（x, z）
    let s  = getSpacing();
    let u  = uv * s;          // 重复空间

    // 到最近“细网格线”的距离
    let fu = fract(u);
    let dv = min(fu.x, 1.0 - fu.x);
    let dh = min(fu.y, 1.0 - fu.y);
    let dMinor = min(dv, dh);

    // 到最近“主网格线”的距离
    let um = u / getMajorEvery();
    let fm = fract(um);
    let dmv = min(fm.x, 1.0 - fm.x);
    let dmh = min(fm.y, 1.0 - fm.y);
    let dMajor = min(dmv, dmh);

    // 屏幕空间导数：把像素宽度换算成 UV 宽度
    // fwidth 返回每像素 UV 的变化量，越远越小
    let duv = fwidth(u);
    let px2uv = max(min(duv.x, duv.y), 1e-5);

    let coreW = getCorePx() * px2uv;
    let glowW = getGlowPx() * px2uv;
    let aa    = 1.0 * px2uv;

    // 线条（主网格稍加粗）
    let coreMinor = lineMask(dMinor, coreW, aa);
    let glowMinor = lineMask(dMinor, glowW, aa * 2.0);

    let coreMajor = lineMask(dMajor, coreW * 1.8, aa);
    let glowMajor = lineMask(dMajor, glowW * 1.8, aa * 2.0);

    // 组合：主网格比细网格更亮
    let grid = max(glowMinor * 0.65 + coreMinor,
                   (glowMajor * 0.75 + coreMajor) * getMajorBoost());

    // 地平线光带 + 远处渐隐
    let z = uv.y;                        // 前向距离
    let hStart = getHStart();
    let hEnd   = getHEnd();
    let horizon  = smoothstep(hStart, hEnd, z);               // 越靠近地平线越亮
    let fadeFar  = 1.0 - smoothstep(hEnd * 0.85, hEnd, z);    // 远处淡出

    // 霓虹轻微闪烁（靠近地平线更明显）
    let flicker = 0.92 + 0.08 * sin(getTime() * 22.0) * (0.7 + 0.3 * horizon);

    // 颜色：深蓝底 + 青蓝霓虹
    let base = mix(vec3<f32>(0.01, 0.02, 0.06),   // 近处更暗
                   vec3<f32>(0.05, 0.09, 0.22),   // 远处略亮，接上地平线
                   horizon);
    let neon = vec3<f32>(0.12, 0.95, 1.00);

    let color = base * (0.35 + 0.65 * fadeFar)
              + neon * grid * (0.8 + 0.8 * horizon) * flicker;

    return vec4<f32>(color, 1.0);
  }
`;

// 生成一块大平面（位于 y = groundY，上朝 +Y）
function makeGroundPlane(
  halfW = 8,
  depth = 20,
  groundY = -0.22
) {
  const x0 = -halfW, x1 = halfW;
  const z0 = 0.0,    z1 = depth;

  return [
    // 三角形1：(+Y 朝上)
    { position:[x0, groundY, z0], uv:[x0, z0] },
    { position:[x1, groundY, z1], uv:[x1, z1] },
    { position:[x1, groundY, z0], uv:[x1, z0] },

    // 三角形2：(+Y 朝上)
    { position:[x0, groundY, z0], uv:[x0, z0] },
    { position:[x0, groundY, z1], uv:[x0, z1] },
    { position:[x1, groundY, z1], uv:[x1, z1] },
  ];
}

const gridSchema = {
  positions: { prop: 'position', format: 'vec3<f32>' },
  uvs:       { prop: 'uv',       format: 'vec2<f32>' },
};

const NeonGrid: LC<{
  y?: number; halfW?: number; depth?: number;
  spacing?: number; lineWidth?: number; glowWidth?: number;
}> = ({
  y = -0.22, halfW = 8, depth = 22,
  spacing = 10.0, lineWidth = 0.015, glowWidth = 0.08,
}) => {
  useAnimationFrame();
  const time = useTimeContext();

  // 参数下发到 shader（可热改）
  const timeRef   = useShaderRef(time.elapsed);
  const spacingRef= useShaderRef(spacing);
  const lwRef     = useShaderRef(lineWidth);
  const gwRef     = useShaderRef(glowWidth);

  const fragment = useShader(neonGridShader, [timeRef, spacingRef, lwRef, gwRef]);

  // 几何：一次生成即可
  const plane = useOne(() => makeGroundPlane(halfW, depth, y), [halfW, depth, y]);

  return (
    <Data data={plane} schema={gridSchema}>
      {({positions, uvs}) => (
        <ShaderFlatMaterial fragment={fragment}>
          <FaceLayer positions={positions} uvs={uvs} />
        </ShaderFlatMaterial>
      )}
    </Data>
  );
};






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

        near = {0.01}
        far = {100.0}
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


                <NeonGrid
                  y={-0.22}      // 地面高度
                  halfW={8}      // 左右宽度（越大越宽）
                  depth={80}     // 向前延伸距离
                  spacing={6.0}
                  lineWidth={2.0 /* 像素：由 shader 内的 getCorePx 读取 */}
                  glowWidth={14.0 /* 像素：由 shader 内的 getGlowPx 读取 */}
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