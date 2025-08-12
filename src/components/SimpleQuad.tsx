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



const redTintShader = WGSLLinker.wgsl`
 
  @optional @link fn getTime() -> f32 { return 0.0; }
  @export fn main(
    inColor: vec4<f32>,
    mapUV: vec4<f32>,
    mapST: vec4<f32>,
  ) -> vec4<f32> {
    let t = getTime();
    return vec4<f32>(0.0, abs(sin(t * 4.0)), 0.0, 1.0);
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
      <Pass>
        <Data data={data} schema={schema}>
          {
            ({positions, uvs, colors}) => (
              <ShaderFlatMaterial fragment={fragment}>
                <FaceLayer positions={positions} uvs={uvs} colors={colors} />
              </ShaderFlatMaterial>
            )
          }
        </Data>
      </Pass>
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
                  <QuadContent />
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