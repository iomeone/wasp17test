// src/components/SimpleQuad.tsx
import React, {useOne, PropsWithChildren} from '@use-gpu/live';
import type { LC } from '@use-gpu/live';
import type { GPUAttributes } from '@use-gpu/core';

import { WebGPU, AutoCanvas } from '@use-gpu/webgpu';
import { LinearRGB, Pass, Data, FaceLayer, OrbitCamera, 
  ShaderFlatMaterial, useShader, useShaderRef, useTimeContext , 
  useAnimationFrame} from '@use-gpu/workbench';
import { Cursor, FPSControls } from '@use-gpu/interact';


import { vec3 } from 'gl-matrix';


import { WGSLLinker } from '@use-gpu/shader';

import { Plot, Arrow } from '@use-gpu/plot';





const redTintShader = WGSLLinker.wgsl`
 
  @optional @link fn getTime() -> f32 { return 0.0; }
  @export fn main(
    inColor: vec4<f32>,
    mapUV: vec4<f32>,
    mapST: vec4<f32>,
  ) -> vec4<f32> {
    let t = getTime();
    return vec4<f32>(0.0, abs(sin(t * 4.0))*.2, 0.0, 1.0);
  }
`;


const Camera = ({children}: PropsWithChildren<object>) => (
  <FPSControls
    position={[0.5, 0.5, 3.5]}
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

const schema = {
  positions: { prop: 'position', format: 'vec3<f32>' },
  uvs:       { prop: 'uv',       format: 'vec2<f32>' },
  colors:    { prop: 'color',    format: 'vec4<f32>' },
};


 const data= [
  { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] }, // 红
  { position: [ .2, -.1, 0], uv: [1, 1], color: [0, 1, 0, 1] }, // 绿
  { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] }, // 蓝
  { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] },
  { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] },
  { position: [-.2,  .1, 0], uv: [0, 0], color: [1, 1, 0, 1] }, // 黄
];





const QuadContent: LC<{}> = () => {
 
  useAnimationFrame();  
  const time = useTimeContext();       
  const getTimeRef = useShaderRef(time.elapsed); 
  const fragment = useShader(redTintShader, [getTimeRef]);

  return (

        <Data data={data} schema={schema}>
          {
            ({positions, uvs, colors}) => (
              <ShaderFlatMaterial fragment={fragment}>
                <FaceLayer positions={positions} uvs={uvs} colors={colors} />
              </ShaderFlatMaterial>
            )
          }
        </Data>

  );
};



const TubeNeighbor: LC<{}> = () => {
  // 选了在 x≈0.55~0.85 范围，正好在你的 quad 右边一点点
  const path: number[][] = [
    [0.55, -0.25,  0.00],
    [0.80, -0.05,  0.15],
    [0.85,  0.15,  0.00],
    [0.70,  0.25, -0.10],
    [0.55,  0.10, -0.20],
  ];

  return (

      <Plot>
        <Arrow
          positions={path}             // 静态折线骨架
          color={[1, 0.8, 0.2, 1]}     // 琥珀色
          width={0.01}                 // 管粗（世界单位直径 ≈0.06）
          depth={-1}                   // 用“世界厚度”，后续开阴影时很关键
          sides={10}                   // 截面多边形边数（越大越圆、面数越多）
          join="round"                 // 折点圆角
          start={false}                // 首端封帽
          end={false}                  // 末端封帽
          // shaded                     // 先不加光照，纯色更直观；后面进阶再开
          // shadow                      // 需要灯光+shadowMap 才有影子
        />
      </Plot>

  );
};



export const QuadTest: LC<{canvas: HTMLCanvasElement}> = ({ canvas  }) => {

    console.log("QuadTest");

    return (
        <WebGPU fallback={<p>WebGPU is not supported.</p>}>
            <AutoCanvas 
                canvas={canvas} 
                samples={4}
                backgroundColor={[.2, 0.2, 0.2, 1]} >

                <Camera>
                  <Pass>
                    <QuadContent />
                    <TubeNeighbor />
                  </Pass>
                </Camera>
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