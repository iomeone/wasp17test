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
    return function decodeTexture(tex: TexturePayload): { extension: string, buffer: Uint8Array } { switch (tex.textureFormat) { case 1: return { extension: 'jpg', buffer: tex.bytes }; case 6: const bytes = tex.bytes; const abuf = new Uint8Array(bytes).buffer; const imageDataView = new DataView(abuf, 0, bytes.length); const rgbaData = decodeDXT(imageDataView, tex.width, tex.height); const rawData = bmp.encode({ data: rgbaData, width: tex.width, height: tex.height }); return { extension: 'bmp', buffer: rawData.data }; default: throw new Error(`unknown textureFormat ${tex.textureFormat}`); } }
})();

const initUtils = (config: { URL_PREFIX: string }) => {
    const { URL_PREFIX } = config;
    const [CMD_BULK, CMD_NODE] = [0, 3];
    async function getUrl(url: string): Promise<Uint8Array> { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP status ${response.status} for ${url}`); return new Uint8Array(await response.arrayBuffer()); }
    const cache: Record<string, any> = {}; const requests: Record<string, { resolve: (value: any) => void, reject: (reason?: any) => void }[]> = {};
    async function decode(command: number, url: string, useMemoryCache = true): Promise<any> { if (useMemoryCache && cache[url]) return cache[url]; if (requests[url]) return await new Promise((resolve, reject) => requests[url].push({ resolve, reject })); requests[url] = []; let res; try { const payload = await getUrl(`${URL_PREFIX}${url}`); const data = await decodeResource(command, payload); res = data.payload; if (useMemoryCache) cache[url] = res; } catch (ex) { requests[url].forEach(p => p.reject(ex as any)); delete requests[url]; throw ex; } requests[url].forEach(p => p.resolve(res)); delete requests[url]; return res; }
    const bulkUtils = { getIndexByPath: (b: Bulk, p: string): number => { let c = -1; for (let e = p, f = (e.length - 1) - ((e.length - 1) % 4); f < e.length; ++f) c = b.childIndices[8 * (c + 1) + (e.charCodeAt(f) - 48)]; return c; }, };
    return { bulk: bulkUtils, getNode: async (p: string, b: Bulk, i: number): Promise<NodePayload> => { const nE = b.epoch[i]; const nIE = b.imageryEpochArray ? b.imageryEpochArray[i] : b.defaultImageryEpoch; const nTF = b.textureFormatArray ? b.textureFormatArray[i] : b.defaultTextureFormat; const nF = b.flags[i]; const iEP = nF & 16 ? `!3u${nIE}` : ''; const url = `!1m2!1s${p}!2u${nE}!2e${nTF}${iEP}!4b0`; return await decode(CMD_NODE, `NodeData/pb=${url}`, false); }, getPlanetoid: async (): Promise<Planetoid> => await decode(CMD_BULK, `PlanetoidMetadata`), getBulk: async (p: string, e: number): Promise<Bulk> => await decode(CMD_BULK, `BulkMetadata/pb=!1m2!1s${p}!2u${e}`), };
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
    
    // 2. 处理 UV 坐标 (逻辑不变)
    const uvs = new Float32Array(rawVertices.length / 8 * 2);
    if (mesh.uvOffsetAndScale && mesh.texture) {
        for (let i = 0, j = 0; i < rawVertices.length; i += 8, j += 2) {
            const u = rawVertices[i + 5] * 256 + rawVertices[i + 4];
            const v = rawVertices[i + 7] * 256 + rawVertices[i + 6];
            const ut = (u + mesh.uvOffsetAndScale[0]) * mesh.uvOffsetAndScale[2];
            let vt = (v + mesh.uvOffsetAndScale[1]) * mesh.uvOffsetAndScale[3];
            uvs[j] = ut;
            uvs[j + 1] = mesh.texture.textureFormat === 6 ? 1 - vt : vt;
        }
    }

    // 3. 清洗索引数据
    const listIndices: number[] = [];
    let culledDegenerateCount = 0;
    let culledOctantCount = 0;

    for (let i = 0; i < stripIndices.length - 2; i++) {
        const i1 = stripIndices[i];
        const i2 = stripIndices[i + 1];
        const i3 = stripIndices[i + 2];

        // ======================================================
        // ==           日志请求 1: 打印剔除行为             ==
        // ======================================================
        if (i1 === i2 || i1 === i3 || i2 === i3) {
            if (culledDegenerateCount < 5) { // 只打印前5条，避免刷屏
                console.warn(`[剔除日志] 发现退化三角形 (索引 ${i})，顶点索引为 (${i1}, ${i2}, ${i3})，已剔除。`);
            }
            culledDegenerateCount++;
            continue;
        }

        const octant1 = rawVertices[i1 * 8 + 3];
        const octant2 = rawVertices[i2 * 8 + 3];
        const octant3 = rawVertices[i3 * 8 + 3];
        
        if (octant1 !== octant2 || octant2 !== octant3) {
            if (culledOctantCount < 5) { // 只打印前5条
                 console.warn(`[剔除日志] 发现跨区三角形 (索引 ${i})，octant值为 (${octant1}, ${octant2}, ${octant3})，已剔除。`);
            }
            culledOctantCount++;
            continue;
        }

        // 修正缠绕顺序
        if (i % 2 === 0) {
            listIndices.push(i1, i2, i3);
        } else {
            listIndices.push(i1, i3, i2);
        }
    }

    console.log(`[剔除总结] 共剔除 ${culledDegenerateCount} 个退化三角形, ${culledOctantCount} 个跨区三角形。`);
    
    // ======================================================
    // ==         日志请求 2: 抽样打印10个结果三角形         ==
    // ======================================================
    console.log("--- 清洗后顶点数据抽样 (前10个三角形) ---");
    const finalIndices = new Uint16Array(listIndices);
    const numTrianglesToLog = Math.min(10, finalIndices.length / 3);
    if (numTrianglesToLog > 0) {
        for (let i = 0; i < numTrianglesToLog; i++) {
            const index1 = finalIndices[i * 3];
            const index2 = finalIndices[i * 3 + 1];
            const index3 = finalIndices[i * 3 + 2];

            const vert1: vec3 = [worldVertices[index1 * 3], worldVertices[index1 * 3 + 1], worldVertices[index1 * 3 + 2]];
            const vert2: vec3 = [worldVertices[index2 * 3], worldVertices[index2 * 3 + 1], worldVertices[index2 * 3 + 2]];
            const vert3: vec3 = [worldVertices[index3 * 3], worldVertices[index3 * 3 + 1], worldVertices[index3 * 3 + 2]];

            console.log(`▼ 清洗后三角形 ${i}:`);
            console.log(`  - 顶点 (索引 ${index1}): [${vert1[0].toFixed(2)}, ${vert1[1].toFixed(2)}, ${vert1[2].toFixed(2)}]`);
            console.log(`  - 顶点 (索引 ${index2}): [${vert2[0].toFixed(2)}, ${vert2[1].toFixed(2)}, ${vert2[2].toFixed(2)}]`);
            console.log(`  - 顶点 (索引 ${index3}): [${vert3[0].toFixed(2)}, ${vert3[1].toFixed(2)}, ${vert3[2].toFixed(2)}]`);
        }
    } else {
        console.log("清洗后已无有效三角形可供抽样。");
    }
    console.log("---------------------------------");


    return {
        vertices: worldVertices,
        indices: finalIndices,
        uvs: uvs,
    };
};



// ===================================================================
// == 步骤 1: 修改 useGoogle3DTile Hook
// ===================================================================

const useGoogle3DTile = (lat: number, lon: number) => {
    const [center, setCenter] = useState<vec3>([0, 0, 0]);
    const [radius, setRadius] = useState(500);
    const [meshes, setMeshes] = useState<ProcessedMesh[]>([]);
    const [status, setStatus] = useState('正在初始化...');


    useResource(() => {
        console.log(status);
        return () => {}; 
    }, [status]);


    useResource((dispose) => {
        let isCancelled = false;
        const loadData = async () => {
            try {
                setStatus('正在查找所有可用路径...');
                const utils = initUtils({ URL_PREFIX: `https://kh.google.com/rt/earth/` });
                const pathFinder = initPathFinder(utils);
                const allPaths = await pathFinder(lat, lon);
                
                if (isCancelled) return;
                if (allPaths.length === 0) {
                    setStatus('错误: 未找到任何可用路径。');
                    return;
                }

                // 默认选择最详细（最长）的路径
                // const bestPath = allPaths.reduce((a, b) => a.length > b.length ? a : b);
                // setStatus(`使用最详细路径 ${bestPath}，正在下载...`);
                
                // 如果需要切换到最低层级，请使用下面这行代码替换上面两行
                // const bestPath = allPaths.reduce((a, b) => a.length < b.length ? a : b);


                const bestPath = allPaths.find(path => path.length === 18);

                if (!bestPath) {
                    console.error("在 allPaths 数组中未找到长度为18的路径");
                    return;
                }

                setStatus(`使用最低层级路径 ${bestPath}，正在下载...`);

                const planetoid = await utils.getPlanetoid();
                const rootEpoch = planetoid.bulkMetadataEpoch[0];
                let bulk: Bulk | null = null;
                let index = -1;
                let currentEpoch = rootEpoch;

                for (let i = 4; i < bestPath.length + 4; i += 4) {
                    const bulkPath = bestPath.substring(0, i - 4);
                    const subPath = bestPath.substring(0, i);
                    const nextBulk = await utils.getBulk(bulkPath, currentEpoch);
                    bulk = nextBulk;
                    if (!bulk) {
                        throw new Error(`在重新校验路径时，未能获取元数据: ${bulkPath}`);
                    }
                    index = utils.bulk.getIndexByPath(bulk, subPath);
                    if (index < 0) throw new Error("最佳路径无效，这不应该发生");
                    currentEpoch = bulk.bulkMetadataEpoch[index];
                }

                if (!bulk || index === -1) {
                    throw new Error("无法为最佳路径获取元数据");
                }
                
                const nodePayload = await utils.getNode(bestPath, bulk, index);
                if (isCancelled) return;
                
                setStatus('下载完成, 正在处理...');
                const extractedMeshes: ProcessedMesh[] = [];
                
                if (nodePayload && nodePayload.meshes) {
                    for (const mesh of nodePayload.meshes) {
                         if (!mesh.vertices || !mesh.indices) continue;
                        
                        const processedGeometry = processMesh(mesh, nodePayload.matrixGlobeFromMesh);

                        let textureUrl: string | null = null;
                        if (mesh.texture) {
                            const { buffer, extension } = textureDecoder(mesh.texture);
                            const blob = new Blob([buffer], { type: extension === 'jpg' ? 'image/jpeg' : 'image/bmp' });
                            textureUrl = URL.createObjectURL(blob);
                        }
                        
                        extractedMeshes.push({
                            ...processedGeometry,
                            textureUrl,
                        });
                    }
                }
                
                if (extractedMeshes.length > 0) {
                    console.log("--- 模型加载日志 (已清洗索引) ---");
                    extractedMeshes.forEach((mesh, index) => {
                        const vertexCount = mesh.vertices.length / 3;
                        const triangleCount = mesh.indices.length / 3; // 已经是三角列表，可直接除以3
                        console.log(`模型 Mesh ${index}:`);
                        console.log(`  - 顶点 (Vertices): ${vertexCount}`);
                        console.log(`  - 三角形 (Triangles): ${triangleCount}`);
                    });

                    const firstMeshVertices = extractedMeshes[0].vertices;
                    const min: vec3 = [Infinity, Infinity, Infinity];
                    const max: vec3 = [-Infinity, -Infinity, -Infinity];

                    for (let i = 0; i < firstMeshVertices.length; i += 3) {
                        min[0] = Math.min(min[0], firstMeshVertices[i]);
                        min[1] = Math.min(min[1], firstMeshVertices[i + 1]);
                        min[2] = Math.min(min[2], firstMeshVertices[i + 2]);
                        max[0] = Math.max(max[0], firstMeshVertices[i]);
                        max[1] = Math.max(max[1], firstMeshVertices[i + 1]);
                        max[2] = Math.max(max[2], firstMeshVertices[i + 2]);
                    }

                    const newCenter = vec3.fromValues(
                        (min[0] + max[0]) / 2,
                        (min[1] + max[1]) / 2,
                        (min[2] + max[2]) / 2
                    );

                    const size = vec3.distance(min, max);
                    const newRadius = Math.max(size, 200);
                    // const newRadius = Math.max(size / 2, 200);

                    console.log("计算出的模型中心点 (Center):", newCenter);
                    console.log("计算出的相机半径 (Radius):", newRadius);
                    console.log("--------------------");

                    if (!isCancelled) {
                        setCenter(newCenter);
                        setRadius(newRadius);
                    }
                }
                
                if (!isCancelled) { setMeshes(extractedMeshes); setStatus('渲染完成！'); }
            } catch (error: any) {
                if (!isCancelled) {
                    console.error(error);
                    setStatus(`错误: ${error.message}`);
                }
            }
        };

        loadData();
        return () => { isCancelled = true; };
    }, [lat, lon]);

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
        far={radius * 2}
        >
        {children}
      </OrbitCamera>
    )}
  />
);
// 这是最终的、与官方示例对齐的正确版本
// ===================================================================
// == 步骤 3: 修改 MyGpu 主组件
// ===================================================================
export const MapGpu: LC<{canvas: HTMLCanvasElement}> = ({ canvas  }) => {
    // 从 Hook 中获取 center 和 radius
    const { meshes, status, center, radius } = useGoogle3DTile(37.795, -122.402);
    console.log(37.795, -122.402);

    const textureUrls = useMemo(() => meshes.map(m => m.textureUrl), [meshes]);
    
    useResource((dispose) => {
        dispose(() => {
            textureUrls.forEach(url => {
                if (url) URL.revokeObjectURL(url);
            });
        });
    }, [textureUrls]);

    return (
        <WebGPU fallback={<p>WebGPU is not supported.</p>}>
            <AutoCanvas canvas={canvas}>
                {/* 将 center 和 radius 传递给 Camera 组件 */}
                <Camera initialCenter={center} initialRadius={radius}>
                    <Scene>
                        <Pass lights>
                            <AmbientLight intensity={1.5} />
                            {/* 让点光源也围绕模型中心，确保能照到 */}
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
                                            mesh.textureUrl ?
                                            <ImageTexture url={mesh.textureUrl}>
                                                    {(texture) => {
                                                        
                                                        // ======================================================
                                                        // ==           *** 第 2 处新增日志 *** ==
                                                        // ==  检查 <ImageTexture> 是否成功加载并返回 texture 对象 ==
                                                        // ======================================================
                                                        console.log(`[调试日志] Mesh ${i} 的 ImageTexture 组件加载结果 (texture 对象):`, texture, '对应的URL:', mesh.textureUrl);
                                                        
                                                        return (
                                                            texture ?
                                                            <PBRMaterial albedoMap={texture} albedo={[1, 1, 1, 1]}>
                                                                <Mesh mesh={gpuGeometry} shaded/>
                                                            </PBRMaterial>
                                                            : null
                                                        )
                                                    }}
                                            </ImageTexture>
                                            :
                                            <PBRMaterial albedo={[0.7, 0.7, 0.7, 1]}>
                                                <Mesh mesh={gpuGeometry} />
                                            </PBRMaterial>
                                        )}
                                    </GeometryData>
                                ))
                                : null
                            }
                        </Pass>
                    </Scene>
                </Camera>
            </AutoCanvas>
        </WebGPU>
    );
};