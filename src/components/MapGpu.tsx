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
        getNode: async (p: string, b: Bulk, i: number): Promise<NodePayload> => { const nE = b.epoch[i]; const nIE = b.imageryEpochArray ? b.imageryEpochArray[i] : b.defaultImageryEpoch; const nTF = b.textureFormatArray ? b.textureFormatArray[i] : b.defaultTextureFormat; const nF = b.flags[i]; const iEP = nF & 16 ? `!3u${nIE}` : ''; const url = `!1m2!1s${p}!2u${nE}!2e${nTF}${iEP}!4b0`; return await decode(CMD_NODE, `NodeData/pb=${url}`, false); },
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
        console.warn(`[剔除日志] 退化三角 i=${i} -> (${i1}, ${i2}, ${i3})`);
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
        console.warn(`[剔除日志] 跨 Octant 三角 i=${i} -> (${i1}, ${i2}, ${i3}) oct=(${o1},${o2},${o3})`);
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
    console.log(`[索引统计] 输入 stripLen=${stripIndices.length}, 有效 stripLen=${effectiveStripLen}, 输出 tris=${finalIndices.length / 3}, 退化剔除=${culledDegenerateCount}, 跨oct剔除=${culledOctantCount}`);








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
// == 步骤 1: 修改 useGoogle3DTile Hook
// ===================================================================

const useGoogle3DTile = (lat: number, lon: number, desiredLevel: number) => {
  const [center, setCenter] = useState<vec3>([0, 0, 0]);
  const [radius, setRadius] = useState(500);
  const [meshes, setMeshes] = useState<ProcessedMesh[]>([]);
  const [status, setStatus] = useState('正在初始化...');

  useResource(() => {
    console.log('[状态]', status);
    return () => {};
  }, [status]);

  useResource((dispose) => {
    let isCancelled = false;

    const loadData = async () => {
      try {
        // 1) 夹紧层级
        const MAX_LEVEL = 18;
        const MIN_LEVEL = 2;
        let req = Math.round(desiredLevel);
        if (req > MAX_LEVEL) {
          console.warn(`[层级夹紧] 请求 L${desiredLevel} 超过最大 L${MAX_LEVEL}，将使用 L${MAX_LEVEL}`);
          req = MAX_LEVEL;
        }
        if (req < MIN_LEVEL) {
          console.warn(`[层级夹紧] 请求 L${desiredLevel} 低于最小 L${MIN_LEVEL}，将使用 L${MIN_LEVEL}`);
          req = MIN_LEVEL;
        }
        setStatus(`正在查找所有可用路径（目标 L${req}）...`);

        const utils = initUtils({ URL_PREFIX: `https://kh.google.com/rt/earth/` });
        const pathFinder = initPathFinder(utils);

        // 2) 只搜索到 req 层，减少无谓请求
        console.time('[PathFinder] 用时');
        const allPaths = await pathFinder(lat, lon, req);
        console.timeEnd('[PathFinder] 用时');
        console.log('[路径集合] allPaths =', allPaths);

        if (isCancelled) return;
        if (allPaths.length === 0) {
          setStatus('错误: 未找到任何可用路径。');
          return;
        }

        // 3) 选择路径：先找等于 req；没有则找 <= req 的最长；再没有就用集合中最长
        let bestPath = allPaths.find(p => p.length === req);
        if (!bestPath) {
          console.warn(`[选路] 没有精确到 L${req} 的路径，尝试选择 <= L${req} 的最长...`);
          const candidates = allPaths.filter(p => p.length <= req);
          if (candidates.length > 0) {
            bestPath = candidates.reduce((a, b) => (a.length > b.length ? a : b));
            console.warn(`[选路] 采用就近 L${bestPath.length} 的路径: ${bestPath}`);
          } else {
            bestPath = allPaths.reduce((a, b) => (a.length > b.length ? a : b));
            console.warn(`[选路] 仅找到比 L${req} 更高层或异常集合，退回集合最长 L${bestPath.length}: ${bestPath}`);
          }
        } else {
          console.log(`[选路] 命中精确层级 L${req}: ${bestPath}`);
        }

        setStatus(`使用路径 ${bestPath} (L${bestPath.length})，正在下载...`);

        // 4) 校验并逐级进入 bulk，拿到 node
        const planetoid = await utils.getPlanetoid();
        const rootEpoch = planetoid.bulkMetadataEpoch[0];
        let bulk: Bulk | null = null;
        let index = -1;
        let currentEpoch = rootEpoch;

        for (let i = 4; i < bestPath.length + 4; i += 4) {
          const bulkPath = bestPath.substring(0, i - 4);
          const subPath  = bestPath.substring(0, i);
          const nextBulk = await utils.getBulk(bulkPath, currentEpoch);
          bulk = nextBulk;
          if (!bulk) throw new Error(`在重新校验路径时，未能获取元数据: ${bulkPath}`);
          index = utils.bulk.getIndexByPath(bulk, subPath);
          if (index < 0) throw new Error(`路径无效: ${subPath}`);
          currentEpoch = bulk.bulkMetadataEpoch[index];
        }

        if (!bulk || index === -1) throw new Error("无法为所选路径获取元数据");

        const nodePayload = await utils.getNode(bestPath, bulk, index);
        if (isCancelled) return;

        setStatus(`下载完成 (L${bestPath.length})，正在处理几何与纹理...`);
        const extractedMeshes: ProcessedMesh[] = [];

        if (nodePayload?.meshes) {
          for (const mesh of nodePayload.meshes) {
            if (!mesh.vertices || !mesh.indices) continue;
            const processed = processMesh(mesh, nodePayload.matrixGlobeFromMesh);

            if (mesh.texture) {
              try {
                const { buffer, extension } = await textureDecoder(mesh.texture);
                const blob = new Blob([buffer], { type: extension === 'jpg' ? 'image/jpeg' : 'image/png' });
                const textureUrl = URL.createObjectURL(blob);
                extractedMeshes.push({ ...processed, textureUrl });
              } catch (e) {
                console.error('[纹理解码失败]', e);
                extractedMeshes.push({ ...processed, textureUrl: null });
              }
            } else {
              extractedMeshes.push({ ...processed, textureUrl: null });
            }
          }
        }

        // （可选）加载同父邻居，可按需打开
        // ...

        // 5) 更新相机 & 网格
        if (extractedMeshes.length > 0) {
          console.log('--- 模型加载日志 (已清洗索引) ---');
          extractedMeshes.forEach((m, i) => {
            console.log(`Mesh ${i}: 顶点=${m.vertices.length / 3}, 三角形=${m.indices.length / 3}, 贴图=${!!m.textureUrl}`);
          });

          const vs = extractedMeshes[0].vertices;
          const min: vec3 = [Infinity, Infinity, Infinity];
          const max: vec3 = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < vs.length; i += 3) {
            if (vs[i] < min[0]) min[0] = vs[i];
            if (vs[i+1] < min[1]) min[1] = vs[i+1];
            if (vs[i+2] < min[2]) min[2] = vs[i+2];
            if (vs[i] > max[0]) max[0] = vs[i];
            if (vs[i+1] > max[1]) max[1] = vs[i+1];
            if (vs[i+2] > max[2]) max[2] = vs[i+2];
          }
          const newCenter = vec3.fromValues((min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2);
          const size = vec3.distance(min, max);
          const newRadius = Math.max(size, 200);

          console.log(`[相机] center=${newCenter} radius=${newRadius} (层级 L${bestPath.length})`);
          if (!isCancelled) {
            setCenter(newCenter);
            setRadius(newRadius);
          }
        }

        if (!isCancelled) {
          setMeshes(extractedMeshes);
          setStatus(`渲染完成！（L${bestPath.length}）`);
        }
      } catch (error: any) {
        if (!isCancelled) {
          console.error(error);
          setStatus(`错误: ${error.message}`);
        }
      }
    };

    loadData();
    return () => { isCancelled = true; };
    // ★ 依赖加上 desiredLevel，这样拖动 Slider 会重新加载
  }, [lat, lon, desiredLevel]);

  return { meshes, status, center, radius };
};



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




export const MapGpu: LC<{ canvas: HTMLCanvasElement; level: number; rings: number }> = ({ canvas, level, rings }) => {
  const { meshes, status, center, radius } = useGoogle3DTileWithLevelAndRings(37.795, -122.402, level, rings);

  const textureUrls = useMemo(() => meshes.map(m => m.textureUrl), [meshes]);

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
              <PointLight position={[center[0], center[1] + radius, center[2]]} intensity={50000000} />
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


const useGoogle3DTileWithLevelAndRings = (lat: number, lon: number, wantedLevel: number, rings: number) => {
  const [center, setCenter] = useState<vec3>([0, 0, 0]);
  const [radius, setRadius] = useState(500);
  const [meshes, setMeshes] = useState<ProcessedMesh[]>([]);
  const [status, setStatus] = useState('正在初始化...');

  useResource((dispose) => {
    console.log('[状态]', status);
    return () => {};
  }, [status]);

  useResource((dispose) => {
    let isCancelled = false;

    const loadData = async () => {
      try {
        setStatus('正在查找所有可用路径...');
        const utils = initUtils({ URL_PREFIX: `https://kh.google.com/rt/earth/` });
        const pathFinder = initPathFinder(utils);

        // 这里把 maxLevel 设得比较高，拿全，然后我们自己根据 wantedLevel 做选择
        const allPaths = await pathFinder(lat, lon, Math.max(22, wantedLevel));
        if (isCancelled) return;

        if (!allPaths.length) {
          setStatus('错误: 未找到任何可用路径。');
          return;
        }

        const maxFound = allPaths.reduce((m, p) => Math.max(m, p.length), 0);
        const effectiveLevel = Math.min(wantedLevel, maxFound);
        const chosen =
          allPaths.find(p => p.length === effectiveLevel) ||
          allPaths.reduce((best, p) => (p.length <= effectiveLevel && p.length > (best?.length ?? -1) ? p : best), '' as string);

        console.log(`[层级选择] 想要 L${wantedLevel}，可用最大 L${maxFound}，实际使用 L${effectiveLevel}，path=${chosen}`);

        if (!chosen) {
          console.warn('[层级选择] 找不到合适路径，退回使用 allPaths 中最长者。');
        }

        setStatus(`使用路径 (L${effectiveLevel}) ${chosen}，rings=${rings}，开始下载...`);

        // ======== 下载中心瓦片 ========
        const planetoid = await utils.getPlanetoid();
        const rootEpoch = planetoid.bulkMetadataEpoch[0];

        // 走 bulk 链定位 index
        let bulk: Bulk | null = null;
        let index = -1;
        let currentEpoch = rootEpoch;
        for (let i = 4; i < chosen.length + 4; i += 4) {
          const bulkPath = chosen.substring(0, i - 4);
          const subPath = chosen.substring(0, i);
          const nextBulk = await utils.getBulk(bulkPath, currentEpoch);
          bulk = nextBulk;
          if (!bulk) throw new Error(`在重新校验路径时，未能获取元数据: ${bulkPath}`);
          index = utils.bulk.getIndexByPath(bulk, subPath);
          if (index < 0) throw new Error('最佳路径无效，这不应该发生');
          currentEpoch = bulk.bulkMetadataEpoch[index];
        }

        if (!bulk || index === -1) throw new Error('无法为最佳路径获取元数据');
        const nodePayload = await utils.getNode(chosen, bulk, index);
        if (isCancelled) return;

        const extracted: ProcessedMesh[] = [];
        if (nodePayload?.meshes) {
          for (const m of nodePayload.meshes) {
            if (!m.vertices || !m.indices) continue;
            const processed = processMesh(m, nodePayload.matrixGlobeFromMesh);
            if (m.texture) {
              const { buffer, extension } = await textureDecoder(m.texture);
              const blob = new Blob([buffer], { type: extension === 'jpg' ? 'image/jpeg' : 'image/png' });
              const texUrl = URL.createObjectURL(blob);
              extracted.push({ ...processed, textureUrl: texUrl });
            } else {
              extracted.push({ ...processed, textureUrl: null });
            }
          }
        }

        // ===（下一步我们会把 rings BFS 真正接进去）===
        console.log(`[邻居拼接] 目标 rings=${rings}（此版本先只加载中心，已打日志）`);

        // === 计算相机中心和半径 ===
        if (extracted.length > 0) {
          const first = extracted[0].vertices;
          const min: vec3 = [Infinity, Infinity, Infinity];
          const max: vec3 = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < first.length; i += 3) {
            min[0] = Math.min(min[0], first[i]);
            min[1] = Math.min(min[1], first[i + 1]);
            min[2] = Math.min(min[2], first[i + 2]);
            max[0] = Math.max(max[0], first[i]);
            max[1] = Math.max(max[1], first[i + 1]);
            max[2] = Math.max(max[2], first[i + 2]);
          }
          const newCenter = vec3.fromValues((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
          const size = vec3.distance(min, max);
          const newRadius = Math.max(size, 200);
          console.log(`[相机] center=`, newCenter, ` size=`, size, ` -> radius=`, newRadius);
          if (!isCancelled) {
            setCenter(newCenter);
            setRadius(newRadius);
          }
        }

        if (!isCancelled) {
          setMeshes(extracted);
          setStatus('渲染完成！');
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error(err);
          setStatus(`错误: ${err.message}`);
        }
      }
    };

    loadData();
    return () => { isCancelled = true; };
  }, [lat, lon, wantedLevel, rings]);

  return { meshes, status, center, radius };
};