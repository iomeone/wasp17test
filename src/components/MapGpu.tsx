
import { useState, useMemo, useResource, type LC, type PropsWithChildren } from '@use-gpu/live';
import { WebGPU, AutoCanvas , Canvas} from '@use-gpu/webgpu';
import { vec3 } from 'gl-matrix';
import {
  Pass, LinearRGB, ShaderFlatMaterial, useShader,
  ImageTexture, Data, FaceLayer,
  OrbitCamera
} from '@use-gpu/workbench';

import {
  Cursor, 
} from '@use-gpu/interact';


import { Scene, Mesh } from '@use-gpu/scene';


export const MapGpu: LC<{canvas: HTMLCanvasElement}> = ({ canvas  }) => {
    return (
        <WebGPU fallback={<p>WebGPU is not supported.</p>}>
            <AutoCanvas canvas={canvas}>



            </AutoCanvas>
        </WebGPU>
    );
};