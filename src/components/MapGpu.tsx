/* src/gpu/MyGPU.tsx */

// 导入所有需要的模块
import { useState, useMemo, useResource, type LC, type PropsWithChildren } from '@use-gpu/live';
import { WebGPU, AutoCanvas , Canvas} from '@use-gpu/webgpu';
import { vec3 } from 'gl-matrix';
import { 
    Pass, 
    OrbitCamera, 
    PointLight, 
    AmbientLight, 
    GeometryData, 
    ImageTexture,
    PBRMaterial,
} from '@use-gpu/workbench';

import {
  Cursor, OrbitControls,
} from '@use-gpu/interact';


import { Scene, Mesh } from '@use-gpu/scene';

import { decodeResource } from '../utils/decoder.js';
// ===================================================================
// == 1. TypeScript 类型定义
// ===================================================================
interface TexturePayload {
    textureFormat: number;
    bytes: Uint8Array;
    width: number;
    height: number;
}

interface MeshPayload {
    vertices: Uint8Array;
    indices: Uint16Array;
    normals?: Uint8Array;
    uvOffsetAndScale?: Float32Array;
    texture?: TexturePayload;
    layerBounds: Uint32Array;
}

interface NodePayload {
    meshes: MeshPayload[];
    matrixGlobeFromMesh: Float64Array;
}

interface Bulk {
    epoch: Uint32Array;
    imageryEpochArray?: Uint32Array;
    textureFormatArray?: Uint8Array;
    flags: Uint8Array;
    childIndices: Int16Array;
    defaultImageryEpoch: number;
    defaultTextureFormat: number;
    bulkMetadataEpoch: Uint32Array;
}

interface Planetoid {
    bulkMetadataEpoch: Uint32Array;
}

interface ProcessedMesh {
    vertices: Float32Array;
    indices: Uint16Array;
    uvs: Float32Array;
    textureUrl: string | null;
}


const textureDecoder = (() => {
    function decodeDXT(buffer: DataView, width: number, height: number): Uint8Array { const rgba = new Uint8Array(width * height * 4); const blockCountX = Math.floor((width + 3) / 4); const blockCountY = Math.floor((height + 3) / 4); for (let j = 0; j < blockCountY; j++) { for (let i = 0; i < blockCountX; i++) { const blockOffset = (j * blockCountX + i) * 8; const color0 = buffer.getUint16(blockOffset, true); const color1 = buffer.getUint16(blockOffset + 2, true); const code = buffer.getUint32(blockOffset + 4, true); const r0 = (color0 >> 11) & 0x1F, g0 = (color0 >> 5) & 0x3F, b0 = color0 & 0x1F; const r1 = (color1 >> 11) & 0x1F, g1 = (color1 >> 5) & 0x3F, b1 = color1 & 0x1F; const colorTable: (number[] | undefined)[] = [[r0 << 3, g0 << 2, b0 << 3, 255], [r1 << 3, g1 << 2, b1 << 3, 255], [], []]; if (color0 > color1) { colorTable[2] = [(2 * r0 + r1) / 3 << 3, (2 * g0 + g1) / 3 << 2, (2 * b0 + b1) / 3 << 3, 255]; colorTable[3] = [(r0 + 2 * r1) / 3 << 3, (g0 + 2 * g1) / 3 << 2, (b0 + 2 * b1) / 3 << 3, 255]; } else { colorTable[2] = [(r0 + r1) / 2 << 3, (g0 + g1) / 2 << 2, (b0 + b1) / 2 << 3, 255]; colorTable[3] = [0, 0, 0, 0]; } for (let y = 0; y < 4; y++) { for (let x = 0; x < 4; x++) { const pixelIndex = (j * 4 + y) * width + (i * 4 + x); if (pixelIndex < width * height) { const color = colorTable[(code >> (2 * (4 * y + x))) & 0x03]; if (color) { rgba[pixelIndex * 4] = color[0]; rgba[pixelIndex * 4 + 1] = color[1]; rgba[pixelIndex * 4 + 2] = color[2]; rgba[pixelIndex * 4 + 3] = color[3]; } } } } } } return rgba; }
    const bmp = (() => { function encode(imgData: { data: number[] | Uint8Array, width: number, height: number }): { data: Uint8Array } { const width = imgData.width, height = imgData.height, data = imgData.data; const extraBytes = (4 - (width * 3) % 4) % 4; const fileSize = 54 + (width * 3 + extraBytes) * height; const buf = new ArrayBuffer(fileSize); const view = new DataView(buf); view.setUint16(0, 0x424D, false); view.setUint32(2, fileSize, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true); view.setUint32(18, width, true); view.setUint32(22, height, true); view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, (width * 3 + extraBytes) * height, true); let p = 54; for (let y = height - 1; y >= 0; y--) { for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; view.setUint8(p++, data[i + 2]); view.setUint8(p++, data[i + 1]); view.setUint8(p++, data[i]); } for (let i = 0; i < extraBytes; i++) { view.setUint8(p++, 0); } } return { data: new Uint8Array(buf) }; } return { encode }; })();
    return async function decodeTexture(
        tex: TexturePayload
      ): Promise<{ extension: string; buffer: Uint8Array }> {
        switch (tex.textureFormat) {
          case 1:
            // jpg 直接返回
            return { extension: 'jpg', buffer: tex.bytes };
    
          case 6:
            // 这里面你已经用了 await，所以必须 async
            const bytes = tex.bytes;
            const abuf = new Uint8Array(bytes).buffer;
            const imageDataView = new DataView(abuf, 0, bytes.length);
            const rgbaData = decodeDXT(imageDataView, tex.width, tex.height);
    
            const canvas =
              typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(tex.width, tex.height)
                : Object.assign(document.createElement('canvas'), {
                    width: tex.width,
                    height: tex.height,
                  });
    
            const ctx = (canvas as any).getContext('2d');
            const imgData = new ImageData(new Uint8ClampedArray(rgbaData), tex.width, tex.height);
            ctx.putImageData(imgData, 0, 0);
    
            const blob = await new Promise<Blob>((resolve) => {
              if ('convertToBlob' in canvas) {
                (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' }).then(resolve);
              } else {
                (canvas as HTMLCanvasElement).toBlob((b) => resolve(b!), 'image/png');
              }
            });
    
            return { extension: 'png', buffer: new Uint8Array(await blob.arrayBuffer()) };
    
          default:
            throw new Error(`unknown textureFormat ${tex.textureFormat}`);
        }
      };
    })();

const initUtils = (config: { URL_PREFIX: string }) => {
    const { URL_PREFIX } = config;
    const [CMD_BULK, CMD_NODE] = [0, 3];
    async function getUrl(url: string): Promise<Uint8Array> { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP status ${response.status} for ${url}`); return new Uint8Array(await response.arrayBuffer()); }
    const cache: Record<string, any> = {}; const requests: Record<string, { resolve: (value: any) => void, reject: (reason?: any) => void }[]> = {};
    async function decode(command: number, url: string, useMemoryCache = true): Promise<any> { if (useMemoryCache && cache[url]) return cache[url]; if (requests[url]) return await new Promise((resolve, reject) => requests[url].push({ resolve, reject })); requests[url] = []; let res; try { const payload = await getUrl(`${URL_PREFIX}${url}`); const data = await decodeResource(command, payload); res = data.payload; if (useMemoryCache) cache[url] = res; } catch (ex) { requests[url].forEach(p => p.reject(ex as any)); delete requests[url]; throw ex; } requests[url].forEach(p => p.resolve(res)); delete requests[url]; return res; }
    const bulkUtils = { getIndexByPath: (b: Bulk, p: string): number => { let c = -1; for (let e = p, f = (e.length - 1) - ((e.length - 1) % 4); f < e.length; ++f) c = b.childIndices[8 * (c + 1) + (e.charCodeAt(f) - 48)]; return c; }, };
    return {
        bulk: bulkUtils, 
        getNode: async (p: string, b: Bulk, i: number): Promise<NodePayload> => {
          const nE  = b.epoch[i];
          const nIE = b.imageryEpochArray ? b.imageryEpochArray[i] : b.defaultImageryEpoch;
          const nTF = b.textureFormatArray ? b.textureFormatArray[i] : b.defaultTextureFormat;
          const nF  = b.flags[i];
          const iEP = nF & 16 ? `!3u${nIE}` : '';
          const url = `!1m2!1s${p}!2u${nE}!2e${nTF}${iEP}!4b0`;
          // ✅ 开启缓存（同一 URL 不再重复请求）
          return await decode(CMD_NODE, `NodeData/pb=${url}`, true);
          // 或者直接：return await decode(CMD_NODE, `NodeData/pb=${url}`);
        },



        getPlanetoid: async (): Promise<Planetoid> => await decode(CMD_BULK, `PlanetoidMetadata`),
    
    
        getBulk: async (p: string, e: number): Promise<Bulk> => await decode(CMD_BULK, `BulkMetadata/pb=!1m2!1s${p}!2u${e}`), };
};

type Box = { n: number; s: number; w: number; e: number };
type TileInfo = { path: string; bulk: Bulk; index: number; epoch: number };




const initPathFinder = (utils: ReturnType<typeof initUtils>) => {
    const { getPlanetoid, getBulk, bulk: { getIndexByPath } } = utils;

    function getFirstOctant(lat: number, lon: number): [string, Box] {
        if (lat < 0) {
            if (lon < -90) return ['02', { n: 0, s: -90, w: -180, e: -90 }];
            if (lon < 0) return ['03', { n: 0, s: -90, w: -90, e: 0 }];
            if (lon < 90) return ['12', { n: 0, s: -90, w: 0, e: 90 }];
            return ['13', { n: 0, s: -90, w: 90, e: 180 }];
        }
        if (lat >= 0) {
            if (lon < -90) return ['20', { n: 90, s: 0, w: -180, e: -90 }];
            if (lon < 0) return ['21', { n: 90, s: 0, w: -90, e: 0 }];
            if (lon < 90) return ['30', { n: 90, s: 0, w: 0, e: 90 }];
            return ['31', { n: 90, s: 0, w: 90, e: 180 }];
        }
        throw new Error(`无效的经纬度`);
    }

    function getNextOctant(box: Box, lat: number, lon: number): [number, Box] {
        let { n, s, w, e } = box;
        const mid_lat = (n + s) / 2;
        const mid_lon = (w + e) / 2;
        let key = 0;
        if (lat < mid_lat) { n = mid_lat; } else { s = mid_lat; key += 2; }
        if (lon < mid_lon) { e = mid_lon; } else { w = mid_lon; key += 1; }
        return [key, { n, s, w, e }];
    }

    return async function findAllPaths(lat: number, lon: number, maxLevel = 18): Promise<string[]> {
        const planetoid = await getPlanetoid();
        const rootEpoch = planetoid.bulkMetadataEpoch[0];
        
        // 这个对象将存储所有找到的有效路径，按层级划分
        const foundOctants: Record<number, { octants: string[] }> = {};

        // test.html 中的 checkNodePath 的精确移植
        async function checkNodePath(nodePath: string): Promise<boolean> {
            let bulk: Bulk | null = null;
            let index = -1;
            let currentEpoch = rootEpoch;
            
            for (let i = 4; i < nodePath.length + 4; i += 4) {
                const bulkPath = nodePath.substring(0, i - 4);
                const subPath = nodePath.substring(0, i);
                
                if (bulk) {
                    const idx = getIndexByPath(bulk, bulkPath);
                    // 关键检查：如果这个节点指向了更详细的元数据，说明它是个“目录”，不能用。
                    // test.html 的 hasBulkMetadataAtIndex(bulk, idx) 逻辑就是检查这个flag
                    if (bulk.flags[idx] & 4) { 
                        return false;
                    }
                }
                
                const nextBulk = await getBulk(bulkPath, currentEpoch);
                bulk = nextBulk;
                index = getIndexByPath(bulk, subPath);
                
                if (index < 0) return false;
                currentEpoch = bulk.bulkMetadataEpoch[index];
            }
            return index >= 0;
        }

        // test.html 中的 search 递归函数的精确移植
        async function search(nodePath: string, box: Box) {
            if (nodePath.length > maxLevel) return;

            try {
                // 如果当前路径前缀无效，则停止深入此分支
                if (!await checkNodePath(nodePath)) {
                    return;
                }
                
                // 如果路径有效，则记录下来
                const octantLevel = nodePath.length;
                if (!foundOctants[octantLevel]) {
                    foundOctants[octantLevel] = { octants: [] };
                }
                foundOctants[octantLevel].octants.push(nodePath);

                // **无论当前路径是否有效，都继续探索子节点**
                const [next_key, next_box] = getNextOctant(box, lat, lon);
                await search(nodePath + "" + next_key, next_box);
                await search(nodePath + "" + (next_key + 4), next_box);
            } catch (ex) {
                // 忽略错误并继续搜索其他分支
            }
        }
        
        const [startPath, startBox] = getFirstOctant(lat, lon);
        await search(startPath, startBox);

        // 将所有找到的路径合并成一个数组返回
        let allPaths: string[] = [];
        for (const level in foundOctants) {
            allPaths = allPaths.concat(foundOctants[level].octants);
        }
        return allPaths;
    }
};



/**
 * 完整复刻 test.html 的几何体处理逻辑。
 * 1. 转换顶点到世界坐标。
 * 2. 将三角带转换为三角列表。
 * 3. 剔除退化三角形。
 * 4. 剔除跨 Octant 的无效三角形。
 * 5. 修正缠绕顺序。
 * @param mesh - 从服务器获取的原始 mesh 数据
 * @param transformMatrix - 用于坐标转换的矩阵
 * @returns 处理完成的、干净的 ProcessedMesh 对象
 */


const processMesh = (mesh: MeshPayload, transformMatrix: Float64Array): Omit<ProcessedMesh, 'textureUrl'> => {
    const rawVertices = mesh.vertices;
    const stripIndices = mesh.indices;
    
    // 1. 转换所有顶点到世界坐标 (逻辑不变)
    const worldVertices = new Float32Array(rawVertices.length / 8 * 3);
    for (let i = 0, j = 0; i < rawVertices.length; i += 8, j += 3) {
        const x = rawVertices[i], y = rawVertices[i + 1], z = rawVertices[i + 2];
        worldVertices[j]     = x * transformMatrix[0] + y * transformMatrix[4] + z * transformMatrix[8] + transformMatrix[12];
        worldVertices[j + 1] = x * transformMatrix[1] + y * transformMatrix[5] + z * transformMatrix[9] + transformMatrix[13];
        worldVertices[j + 2] = x * transformMatrix[2] + y * transformMatrix[6] + z * transformMatrix[10] + transformMatrix[14];
    }
    
   

    // === 2) 处理 UV 坐标（总是计算，与纹理格式无关）===
    const uvs = new Float32Array(rawVertices.length / 8 * 2);

    // 预扫最大 u/v，用于无 uvOffsetAndScale 时反推 uMod/vMod
    let uMax = 0, vMax = 0;
    for (let i = 0; i < rawVertices.length; i += 8) {
    const u = rawVertices[i + 5] * 256 + rawVertices[i + 4];
    const v = rawVertices[i + 7] * 256 + rawVertices[i + 6];
    if (u > uMax) uMax = u;
    if (v > vMax) vMax = v;
    }

    if (mesh.uvOffsetAndScale && mesh.texture) {
    // 有 uvOffsetAndScale：直接套用
    const [offX, offY, sclX, sclY] = mesh.uvOffsetAndScale;
    for (let i = 0, j = 0; i < rawVertices.length; i += 8, j += 2) {
        const u = rawVertices[i + 5] * 256 + rawVertices[i + 4];
        const v = rawVertices[i + 7] * 256 + rawVertices[i + 6];
        uvs[j]     = (u + offX) * sclX;
        uvs[j + 1] = (v + offY) * sclY;
    }
    } else {
    // 无 uvOffsetAndScale：使用 C++ 的“默认 + 翻V”分支
    const uMod = uMax + 1;
    const vMod = vMax + 1;

    const offX = 0.5;
    const offY = 0.5 - 1 / vMod; // 关键：翻 V
    const sclX = 1 / uMod;
    const sclY = -1 / vMod;      // 关键：翻 V（负号）

    for (let i = 0, j = 0; i < rawVertices.length; i += 8, j += 2) {
        const u = rawVertices[i + 5] * 256 + rawVertices[i + 4];
        const v = rawVertices[i + 7] * 256 + rawVertices[i + 6];
        uvs[j]     = (u + offX) * sclX;
        uvs[j + 1] = (v + offY) * sclY;
    }
    }

    // === 3) 清洗索引：先按 layerBounds[3] 截断，再做 strip->list 与剔除 ===
    const listIndices: number[] = [];
    let culledDegenerateCount = 0;
    let culledOctantCount = 0;

    // 和 C++ 对齐：有效 strip 长度 = layerBounds[3]
    const effectiveStripLen = Math.min(
    stripIndices.length,
    (mesh.layerBounds && mesh.layerBounds[3] != null) ? mesh.layerBounds[3] : stripIndices.length
    );

    for (let i = 0; i < effectiveStripLen - 2; i++) {
    const i1 = stripIndices[i];
    const i2 = stripIndices[i + 1];
    const i3 = stripIndices[i + 2];

    // 退化三角
    if (i1 === i2 || i1 === i3 || i2 === i3) {
        if (culledDegenerateCount < 5) {
        // console.warn(`[剔除日志] 退化三角 i=${i} -> (${i1}, ${i2}, ${i3})`);
        }
        culledDegenerateCount++;
        continue;
    }

    // 剔除跨 octant
    const o1 = rawVertices[i1 * 8 + 3];
    const o2 = rawVertices[i2 * 8 + 3];
    const o3 = rawVertices[i3 * 8 + 3];
    if (o1 !== o2 || o2 !== o3) {
        if (culledOctantCount < 5) {
        // console.warn(`[剔除日志] 跨 Octant 三角 i=${i} -> (${i1}, ${i2}, ${i3}) oct=(${o1},${o2},${o3})`);
        }
        culledOctantCount++;
        continue;
    }

    // strip -> list，保持与 OpenGL TRIANGLE_STRIP 一致的缠绕奇偶翻转
    if (i % 2 === 0) {
        listIndices.push(i1, i2, i3);
    } else {
        listIndices.push(i1, i3, i2);
    }
    }

    const finalIndices = new Uint16Array(listIndices);

    // （可选）简单统计
    // console.log(`[索引统计] 输入 stripLen=${stripIndices.length}, 有效 stripLen=${effectiveStripLen}, 输出 tris=${finalIndices.length / 3}, 退化剔除=${culledDegenerateCount}, 跨oct剔除=${culledOctantCount}`);








    return {
        vertices: worldVertices,
        indices: finalIndices,
        uvs: uvs,
    };
};


function getSameParentNeighbors(path: string): string[] {
    if (!path || path.length < 3) return [];
    const parent = path.slice(0, -1);
    const last   = path.charCodeAt(path.length - 1) - 48; // '0'->0
    const high   = last & 4;   // 保留最高位
    const base   = last & 3;   // 低两位 0..3: 0=SW,1=SE,2=NW,3=NE
    const horiz  = parent + String.fromCharCode(48 + (high | (base ^ 1)));
    const vert   = parent + String.fromCharCode(48 + (high | (base ^ 2)));
    const diag   = parent + String.fromCharCode(48 + (high | (base ^ 3)));
    return [horiz, vert, diag];
  }

  





// ===================================================================
// == 3. React 和 use.gpu 的集成组件
// ===================================================================
// ===================================================================
// == 步骤 2: 修改 Camera 组件
// ===================================================================
type CameraProps = PropsWithChildren<{
  initialCenter?: vec3;
  initialRadius?: number;
}>;

const Camera = ({children, initialCenter, initialRadius}: CameraProps) => (
  <OrbitControls
    // 使用传入的属性作为初始值，如果未提供则使用默认值
    radius={initialRadius ?? 500}
    target={initialCenter ?? [0, 0, 0]}
    pitch={0.5}
    bearing={-0.5}
    render={(radius: number, phi: number, theta: number, target: vec3) => (
      <OrbitCamera 
        radius={radius} 
        phi={phi} 
        theta={theta} 
        target={target}
        near={0.1}
        far={radius * 20}
        >
        {children}
      </OrbitCamera>
    )}
  />
);




export const MapGpu: LC<{ canvas: HTMLCanvasElement; level: number; rings: number; lat: number; lon: number}> = ({ canvas, level, rings, lat, lon }) => {
  const { meshes, status, center, radius } = useGoogle3DTileWithLevelAndRings(lat,  lon, level, rings);

  const textureUrls = useMemo(() => meshes.map(m => m.textureUrl), [meshes]);

//   console.log("radius is ", radius, center);
  useResource((dispose) => {
    dispose(() => {
      textureUrls.forEach(url => url && URL.revokeObjectURL(url));
    });
  }, [textureUrls]);

  return (
    <WebGPU fallback={<p>WebGPU is not supported.</p>}>
      <AutoCanvas canvas={canvas}>
        <Camera initialCenter={center} initialRadius={radius}>
          <Scene>
            <Pass lights>
              <AmbientLight intensity={1.5} />
              {/* <PointLight position={[center[0], center[1] + radius, center[2]]} intensity={0} /> */}
              {meshes.length > 0
                ? meshes.map((mesh, i) => (
                  <GeometryData
                    key={i}
                    attributes={{
                      positions: mesh.vertices,
                      uvs: mesh.uvs,
                      indices: mesh.indices,
                    }}
                    count={mesh.indices.length}
                    formats={{
                      positions: 'vec3<f32>',
                      uvs: 'vec2<f32>',
                      indices: 'u16',
                    }}
                  >
                    {(gpuGeometry) => (
                      mesh.textureUrl ? (
                        <ImageTexture url={mesh.textureUrl}>
                          {(texture) =>
                            texture ? (
                              <PBRMaterial albedoMap={texture} albedo={[1, 1, 1, 1]}>
                                <Mesh mesh={gpuGeometry} shaded />
                              </PBRMaterial>
                            ) : null
                          }
                        </ImageTexture>
                      ) : (
                        <PBRMaterial albedo={[0.7, 0.7, 0.7, 1]}>
                          <Mesh mesh={gpuGeometry} />
                        </PBRMaterial>
                      )
                    )}
                  </GeometryData>
                ))
                : null}
            </Pass>
          </Scene>
        </Camera>
      </AutoCanvas>
    </WebGPU>
  );
};




// ===================== BFS 邻居加载（同父） =====================
// 返回“同父”的 8 邻：左右、上下、四个对角（不跨父）。跨父留到下一步。
function getSameParent8Neighbors(path: string): string[] {
  if (!path || path.length < 3) return [];
  const parent = path.slice(0, -1);
  const last   = path.charCodeAt(path.length - 1) - 48; // 0..7
  const high   = last & 4;   // 高位不变（同父）
  const base   = last & 3;   // 0..3: 0=SW,1=SE,2=NW,3=NE

  // 同父四个子块的“坐标”:
  //   2(NW) 3(NE)
  //   0(SW) 1(SE)
  const sw = high | 0, se = high | 1, nw = high | 2, ne = high | 3;

  // 把当前块当作 (cx, cy)
  // base: 0(SW)→(0,0), 1(SE)→(1,0), 2(NW)→(0,1), 3(NE)→(1,1)
  const cx = (base & 1) ? 1 : 0;
  const cy = (base & 2) ? 1 : 0;

  // 在同父 2×2 内取 8 邻时，只有落在同父内的才有效
  const idx = (x:number,y:number) => (x===0&&y===0)?sw:(x===1&&y===0)?se:(x===0&&y===1)?nw:ne;

  const out: string[] = [];
  const pushIfInside = (x:number,y:number) => {
    if (x>=0 && x<=1 && y>=0 && y<=1) {
      out.push(parent + String.fromCharCode(48 + idx(x,y)));
    } else {
      console.debug('[邻居][TODO cross-parent] 越界: 从', path, '想去', {x,y});
    }
  };

  // 左右上下
  pushIfInside(cx-1, cy);
  pushIfInside(cx+1, cy);
  pushIfInside(cx, cy-1);
  pushIfInside(cx, cy+1);
  // 4 对角
  pushIfInside(cx-1, cy-1);
  pushIfInside(cx+1, cy-1);
  pushIfInside(cx-1, cy+1);
  pushIfInside(cx+1, cy+1);

  // 去重
  return Array.from(new Set(out)).filter(p => p !== path);
}








// —— 用 Morton 位加减，保证邻居严格相邻（不会乱跳）——
function get8Neighbors(path: string): string[] {
  // 顶层两位是 getFirstOctant 返回的 '02','21' 之类，后面每一位是 0..7
  if (!path || path.length < 3) return [];
  const L = path.length - 2; // 除去前2位的“象限头”，后面 L 位是四叉格层

  // 取出“头两位”不动；后面的每位拆成 (high, xBit, yBit)
  const head = path.slice(0, 2);
  const high: number[] = new Array(L);
  const xbits: number[] = new Array(L);
  const ybits: number[] = new Array(L);
  for (let i = 0; i < L; i++) {
    const c = path.charCodeAt(2 + i) - 48;
    high[i]  = c & 4;           // 保留该层的高位
    const b  = c & 3;           // 低两位 0..3
    xbits[i] =  b       & 1;    // 0:W, 1:E
    ybits[i] = (b >> 1) & 1;    // 0:S, 1:N
  }

  // 把 (xbits[], ybits[]) 看成两个 L 位二进制数，做 +1/-1（带借位/进位）
  function addBits(bits: number[], delta: number): boolean {
    if (delta === 0) return true;
    if (delta === 1) {
      // 加一（从最低位开始）
      for (let i = L - 1; i >= 0; i--) {
        if (bits[i] === 0) { bits[i] = 1; return true; }
        bits[i] = 0;
      }
      return false; // 溢出（已经在最右边了）
    } else if (delta === -1) {
      // 减一
      for (let i = L - 1; i >= 0; i--) {
        if (bits[i] === 1) { bits[i] = 0; return true; }
        bits[i] = 1;
      }
      return false; // 下溢（已经在最左边了）
    }
    return false;
  }

  function buildPath(xb: number[], yb: number[]): string {
    let s = head;
    for (let i = 0; i < L; i++) {
      const base = (yb[i] << 1) | xb[i];     // 0..3
      s += String.fromCharCode(48 + (high[i] | base));
    }
    return s;
  }

  const out = new Set<string>();

  // 4 邻 + 4 对角
  const dirs = [
    [-1, 0], [1, 0], [0,-1], [0, 1],
    [-1,-1], [1,-1], [-1,1], [1, 1],
  ];

  for (const [dx, dy] of dirs) {
    const X = xbits.slice();  // 拷贝
    const Y = ybits.slice();
    // 先在 X 方向做加减；失败表示越界（地图边缘）
    if ((dx === 0 || addBits(X, dx)) && (dy === 0 || addBits(Y, dy))) {
      out.add(buildPath(X, Y));
    }
  }

  out.delete(path);
  return [...out];
}







/** 角度转弧度 */
const deg2rad = (d: number) => d * Math.PI / 180;

/** 把 (lat, lon, z) 转成 Slippy Map 的 (x, y, z) 瓦片坐标 */
export function lonLatToTileXY(lat: number, lon: number, z: number) {
  const n = 1 << z; // 2^z
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = deg2rad(lat);
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  );
  const xmax = n - 1, ymax = n - 1;
  // 裁剪，避免越界
  return { x: Math.min(Math.max(0, x), xmax), y: Math.min(Math.max(0, y), ymax), z };
}

/** 计算一个 tile 的经纬度包围盒（用于调试验证范围） */
export function tileBounds(x: number, y: number, z: number) {
  const n = 1 << z;
  const lonL = x / n * 360 - 180;
  const lonR = (x + 1) / n * 360 - 180;

  const latRadT = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const latRadB = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  const latT = latRadT * 180 / Math.PI;
  const latB = latRadB * 180 / Math.PI;

  return { north: latT, south: latB, west: lonL, east: lonR };
}

/** 生成以 Chebyshev 距离 rings 为半径的邻居列表（包含中心） */
export function neighborsChebyshev(x: number, y: number, z: number, rings: number) {
  const n = 1 << z;
  const res: Array<{x:number;y:number;z:number;ring:number}> = [];
  const seen = new Set<string>();

  const push = (tx:number, ty:number, ring:number) => {
    if (tx < 0 || ty < 0 || tx >= n || ty >= n) return; // 越界丢弃
    const k = `${tx}:${ty}`;
    if (seen.has(k)) return;
    seen.add(k);
    res.push({ x: tx, y: ty, z, ring });
  };

  // BFS 按圈推进：ring=0 是中心；1 → 3x3；2 → 5x5；…
  for (let r = 0; r <= rings; r++) {
    const minx = x - r, maxx = x + r;
    const miny = y - r, maxy = y + r;

    // 四条边扫一圈（避免重复点）
    for (let tx = minx; tx <= maxx; tx++) {
      push(tx, miny, r);
      if (r > 0) push(tx, maxy, r);
    }
    for (let ty = miny + 1; ty <= maxy - 1; ty++) {
      push(minx, ty, r);
      if (r > 0) push(maxx, ty, r);
    }
  }

  // 按 ring 由小到大排序（加载时可以渐进显示）
  res.sort((a, b) => a.ring - b.ring);
  return res;
}

/** 可选：把 (x,y,z) 编码成 QuadKey（0..3）——方便日志或和服务对接 */
export function tileToQuadKey(x: number, y: number, z: number) {
  let quadKey = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += digit.toString();
  }
  return quadKey;
}

















const useGoogle3DTileWithLevelAndRings = (lat: number, lon: number, wantedLevel: number, rings: number) => {

            // 假设你有 lat/lon/wantedLevel/rings
        const z = Math.max(0, Math.min(23, Math.floor(wantedLevel))); // 保护一下层级
        const { x, y } = lonLatToTileXY(lat, lon, z);

        // 打日志：中心 tile
        //console.log(`[TILES] center -> z=${z} x=${x} y=${y} quadKey=${tileToQuadKey(x,y,z)}`);
        //console.log(`[TILES] center bounds`, tileBounds(x, y, z));

        // 生成 rings 范围内所有邻居（包含中心）
        const tiles = neighborsChebyshev(x, y, z, rings);
        //console.log(`[TILES] rings=${rings} → tiles=${tiles.length}`);
        for (const t of tiles) {
        if (t.ring === 0 || t.ring === rings) { // 只挑几条关键日志
            const qb = tileBounds(t.x, t.y, t.z);
            // console.log(
            // `[TILES] ring=${t.ring} -> z=${t.z} x=${t.x} y=${t.y} quadKey=${tileToQuadKey(t.x,t.y,t.z)}`,
            // qb
            // );
        }
        }


  const tileKey = useMemo(() => `${z}/${x}/${y}`, [z, x, y]);



  const [center, setCenter] = useState<vec3>([0, 0, 0]);
  const [radius, setRadius] = useState(500);
  const [hasFramed, setHasFramed] = useState(false);


  const [meshes, setMeshes] = useState<ProcessedMesh[]>([]);
  const [status, setStatus] = useState('正在初始化...');

//   useResource(() => {
//     console.log('[状态]', status);
//     return () => {};
//   }, [status]);

  const utils = useMemo(
    () => initUtils({ URL_PREFIX: `https://kh.google.com/rt/earth/` }),
    []
  );

  const pathFinder = useMemo(
    () => initPathFinder(utils),
    [utils]  // utils 只会在第一次渲染创建，所以 pathFinder 也只会创建一次
  );

  useResource((dispose) => {
    let isCancelled = false;

    const loadData = async () => {
      try {
        setStatus(`准备查找路径与加载：level=${wantedLevel}, rings=${rings}`);

       

        // 先取到 wantedLevel（或能找到的最接近）那一级的中心 path
        const allPaths = await pathFinder(lat, lon, wantedLevel);
        if (isCancelled) return;

        if (!allPaths.length) {
          setStatus('错误: 未找到任何可用路径。');
          return;
        }

        const maxFound = allPaths.reduce((m, p) => Math.max(m, p.length), 0);
        const effectiveLevel = Math.min(wantedLevel, maxFound);
        const centerPath =
          allPaths.find(p => p.length === effectiveLevel) ||
          allPaths.reduce((best, p) => (p.length <= effectiveLevel && p.length > (best?.length ?? -1) ? p : best), '' as string);

        if (!centerPath) throw new Error('未能选出中心 path');

        // console.log(`[层级选择] 想要 L${wantedLevel}，可用最大 L${maxFound}，实际使用 L${effectiveLevel}，center=${centerPath}`);
        setStatus(`中心瓦片 L${effectiveLevel}：${centerPath}；开始 BFS 加载，rings=${rings}`);

        // ======== BFS 队列 & 去重 ========
        const visited = new Set<string>();
        const queue: Array<{path:string, ring:number}> = [{ path: centerPath, ring: 0 }];
        visited.add(centerPath);

        // 负载保护：理论期望瓦片数 (2r+1)^2
        const expected = (2 * rings + 1) ** 2;
        const HARD_CAP = Math.min(expected * 1.5, 256);   // 安全上限
        const MAX_CONCURRENCY = 4;                         // 并发抓取限制
        console.log(`[BFS] 期望=${expected}，硬上限=${HARD_CAP}，并发=${MAX_CONCURRENCY}`);

        // 一个简易的并发池
        const pool: Promise<void>[] = [];
        const extractedAll: ProcessedMesh[] = [];

        // 工具：进入 bulk & 拉 node
        async function fetchNode(path: string) {
          // 逐级进 bulk 定位 index
          const planetoid = await utils.getPlanetoid();
          const rootEpoch = planetoid.bulkMetadataEpoch[0];
          let bulk: Bulk | null = null;
          let index = -1;
          let currentEpoch = rootEpoch;

          for (let i = 4; i < path.length + 4; i += 4) {
            const bulkPath = path.substring(0, i - 4);
            const subPath  = path.substring(0, i);
            const nextBulk = await utils.getBulk(bulkPath, currentEpoch);
            bulk = nextBulk;
            if (!bulk) throw new Error(`获取元数据失败: ${bulkPath}`);
            index = utils.bulk.getIndexByPath(bulk, subPath);
            if (index < 0) throw new Error(`无效 path: ${subPath}`);
            currentEpoch = bulk.bulkMetadataEpoch[index];
          }
          if (!bulk || index === -1) throw new Error('找不到节点索引');
          return await utils.getNode(path, bulk, index);
        }

        // 工具：加载并解析一个瓦片
        async function loadOneTile(path: string, ring: number) {
        //   console.log(`[Tile][fetch] ring=${ring} path=${path}`);
          const nodePayload = await fetchNode(path);

          if (isCancelled) return;
          let count = 0;
          if (nodePayload?.meshes) {
            for (const m of nodePayload.meshes) {
              if (!m.vertices || !m.indices) continue;
              const processed = processMesh(m, nodePayload.matrixGlobeFromMesh);
              if (m.texture) {
                try {
                  const { buffer, extension } = await textureDecoder(m.texture);
                  const blob = new Blob([buffer], { type: extension === 'jpg' ? 'image/jpeg' : 'image/png' });
                  const url = URL.createObjectURL(blob);
                  extractedAll.push({ ...processed, textureUrl: url });
                } catch (e) {
                  console.error('[纹理解码失败]', e);
                  extractedAll.push({ ...processed, textureUrl: null });
                }
              } else {
                extractedAll.push({ ...processed, textureUrl: null });
              }
              count++;
            }
          }
        //   console.log(`[Tile][done] ring=${ring} path=${path} meshes=${count}`);
        }

        // BFS 主循环（同父 8 邻）
        let processed = 0;
        while (queue.length && processed < HARD_CAP) {
          // 控制并发
          while (pool.length >= MAX_CONCURRENCY) {
            await Promise.race(pool);
            // 清理已完成
            for (let i = pool.length - 1; i >= 0; i--) {
              if ((pool[i] as any).settled) pool.splice(i, 1);
            }
          }

          const { path, ring } = queue.shift()!;
          processed++;

          // 把这个 tile 的加载任务推进池子
          const p = loadOneTile(path, ring)
            .catch(err => console.error(`[Tile][error] ring=${ring} path=${path}`, err))
            .finally(() => { (p as any).settled = true; });
          pool.push(p);

          // 扩展邻居
          if (ring < rings) {
            const neigh = get8Neighbors(path);
            console.log(`[BFS][expand] ring=${ring} -> ${ring+1}，邻居数量=${neigh.length}`);
            for (const np of neigh) {
              if (!visited.has(np) && visited.size < HARD_CAP) {
                visited.add(np);
                queue.push({ path: np, ring: ring + 1 });
              }
            }
          }
        }

        console.log(`[BFS] 队列出完或达到上限。已访问=${visited.size}，已派发=${processed}，等待任务收尾...`);
        // 等待所有并发完成
        await Promise.allSettled(pool);

        if (isCancelled) return;

        // 计算相机包围盒（用所有已加载网格）
        if (extractedAll.length > 0) {
          let min: vec3 = [Infinity, Infinity, Infinity];
          let max: vec3 = [-Infinity, -Infinity, -Infinity];
          for (const m of extractedAll) {
            const a = m.vertices;
            for (let i = 0; i < a.length; i += 3) {
              if (a[i] < min[0]) min[0] = a[i];
              if (a[i+1] < min[1]) min[1] = a[i+1];
              if (a[i+2] < min[2]) min[2] = a[i+2];
              if (a[i] > max[0]) max[0] = a[i];
              if (a[i+1] > max[1]) max[1] = a[i+1];
              if (a[i+2] > max[2]) max[2] = a[i+2];
            }
          }
          const newCenter = vec3.fromValues((min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2);
          const size = vec3.distance(min, max);
          const newRadius = Math.max(size, 200);
          console.log(`[相机] 由 ${extractedAll.length} 个网格计算 -> center=${newCenter} radius=${newRadius}`);
          setCenter(newCenter);
          if (!hasFramed) {
                setRadius(newRadius);     // 只在第一次按包围盒设半径
                setHasFramed(true);
            } else {
            // 之后别动 radius（或者做很小幅度变化）
            // setRadius(prev => prev); // 等价什么都不做
            }
        }

        setMeshes(extractedAll);
        setStatus(`渲染完成！tiles=${visited.size}, rings=${rings}, level=${effectiveLevel}`);
      } catch (err:any) {
        if (!isCancelled) {
          console.error(err);
          setStatus(`错误: ${err.message}`);
        }
      }
    };

    loadData();
    return () => { isCancelled = true; };
  }, [tileKey, rings]);

  return { meshes, status, center, radius };
};