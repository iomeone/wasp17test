// src/components/MapGpu.tsx
import React, {useOne, PropsWithChildren} from '@use-gpu/live';
import type { LC } from '@use-gpu/live';
import type { GPUAttributes } from '@use-gpu/core';

import { WebGPU, AutoCanvas } from '@use-gpu/webgpu';
import { LinearRGB, Pass, Data, FaceLayer, OrbitCamera, ShaderFlatMaterial } from '@use-gpu/workbench';
import { Cursor, FPSControls } from '@use-gpu/interact';

import { vec3 } from 'gl-matrix';



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




export const MapGpu: LC<{canvas: HTMLCanvasElement}> = ({ canvas  }) => {


  const schema = useOne(() => ({
    positions: { prop: 'position', format: 'vec3<f32>' },
    uvs: { prop: 'uv', format: 'vec2<f32>' },
    colors:    { prop: 'color',    format: 'vec4<f32>' }, 
  }), []);

  const data = useOne(() => ([
    { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] }, // 红
    { position: [ .2, -.1, 0], uv: [1, 1], color: [0, 1, 0, 1] }, // 绿
    { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] }, // 蓝
    { position: [-.2, -.1, 0], uv: [0, 1], color: [1, 0, 0, 1] },
    { position: [ .2,  .1, 0], uv: [1, 0], color: [0, 0, 1, 1] },
    { position: [-.2,  .1, 0], uv: [0, 0], color: [1, 1, 0, 1] }, // 黄
  ]), []);



    return (
        <WebGPU fallback={<p>WebGPU is not supported.</p>}>
            <AutoCanvas canvas={canvas}>
                <Camera>
                    <Pass>
                        <Data data={data} schema={schema}>
                        {
                            ({positions, uvs, colors}) => {
                                return (
                                    <FaceLayer positions={positions} uvs={uvs} colors={colors}  />
                                );
                            }
                        
                        }
                        </Data>

                        {/* <Data
                        schema={schema}
                        data={data}
                        render={({ positions, uvs, colors }) => (
                            <FaceLayer positions={positions} uvs={uvs} colors={colors} />
                        )}
                        /> */}
                    </Pass>
                </Camera>
            </AutoCanvas>
        </WebGPU>
    );
};