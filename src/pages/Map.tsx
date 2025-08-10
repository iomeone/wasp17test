import React, { useState, useLayoutEffect, useRef, useMemo, useCallback, useEffect } from 'react';
import { LiveCanvas } from '@use-gpu/react';
import { MapGpu } from '../components/MapGpu';
import { Card, Button, Slider } from "@heroui/react";

// 新增：从 MapGpu 导入工具函数
import { lonLatToTileXY, tileBounds, Bounds } from '../components/MapGpu';



const translucent = {
  backdropFilter: 'saturate(180%) blur(8px)',
  background: 'rgba(255,255,255,0.65)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

function suggestRingsByLevel(level: number) {
  if (level >= 16) return 0;
  if (level >= 12) return 1;
  if (level >= 9)  return 2;
  return 3;
}

export const Map: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // ✅ 新增：中心点经纬度
const [lat, setLat] = useState<number>(37.7946);  
const [lon, setLon] = useState<number>( -122.3999); 

  // UI state
  const [level, setLevel] = useState<number>(18);
  const [rings, setRings] = useState<number>(1);
  const [ringsManual, setRingsManual] = useState<boolean>(false);



  const [camTarget, setCamTarget] = useState<[number, number, number] | null>(null);
  const [camRadius, setCamRadius] = useState<number | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);


const handleBounds = useCallback((b: Bounds) => {
  setBounds(b);

  setCamTarget(prev => {
    // prev 为空：初始化到新中心
    if (!prev) return [b.center[0], b.center[1], b.center[2]];
    // 有 prev：如果不在新 bounds 内，重置到新中心；在的话保持不变
    return isInsideBounds(prev, b) ? prev : [b.center[0], b.center[1], b.center[2]];
  });

  setCamRadius(prev => {
    // 只有首次（prev 为空）或 camTarget 被重置（不在新 bounds 内）才设置半径
    if (!prev) return Math.max(b.diag, 200);
    // NOTE: 如果上面 camTarget 被重置，我们也希望同步半径：
    // 这里读取一下最新 camTarget 判断是否刚刚被重置：
    // 简化做法：以中心重置为准——若你想精确，只需把“是否重置”的布尔从上面传下来。
    return prev; // 保持半径不变；如需同步重置，改为 Math.max(b.diag, 200)
  });
}, []);



  const moveByBounds = useCallback((fx: number, fy: number, fz: number) => {
    if (!bounds) return;
    const dx = fx * bounds.sizeVec[0];
    const dy = fy * bounds.sizeVec[1];
    const dz = fz * bounds.sizeVec[2];
    setCamTarget((prev) => {
      const cur = prev ?? [bounds.center[0], bounds.center[1], bounds.center[2]];
      return [cur[0] + dx, cur[1] + dy, cur[2] + dz] as [number, number, number];
    });
  }, [bounds]);



  const isInsideBounds = (p: [number,number,number], b: Bounds) => {
  const EPS = 1e-3;
  return (
    p[0] >= b.min[0] - EPS && p[0] <= b.max[0] + EPS &&
    p[1] >= b.min[1] - EPS && p[1] <= b.max[1] + EPS &&
    p[2] >= b.min[2] - EPS && p[2] <= b.max[2] + EPS
  );
};





  const onLevelChange = useCallback((val: number | number[]) => {
    const L = Array.isArray(val) ? val[0]! : val;
    setLevel(L);
    if (!ringsManual) {
      const autoR = suggestRingsByLevel(L);
      setRings(autoR);
    }
  }, [ringsManual]);

  const onRingsChange = useCallback((val: number | number[]) => {
    const R = Array.isArray(val) ? val[0]! : val;
    setRings(R);
    if (!ringsManual) setRingsManual(true);
  }, [ringsManual]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 👉 工具：经纬度约束/环绕
  const clampLat = (x: number) => Math.max(-85, Math.min(85, x));
  const wrapLon = (x: number) => {
    // 把任何值转到 [-180, 180)
    const w = ((x + 180) % 360 + 360) % 360 - 180;
    return w === -180 ? 180 : w;
  };

  // 👉 关键：按“瓦片比例”移动（dxTiles/dyTiles 以瓦片为单位）
  const moveByTiles = useCallback((dxTiles: number, dyTiles: number) => {
    const { x, y } = lonLatToTileXY(lat, lon, level);
    const b = tileBounds(x, y, level);
    const tileLonWidth = b.east - b.west;       // 一块瓦片的经度宽度
    const tileLatHeight = b.north - b.south;    // 一块瓦片的纬度高度
    setLon((prev) => wrapLon(prev + dxTiles * tileLonWidth));
    setLat((prev) => clampLat(prev + dyTiles * tileLatHeight));

    moveByBounds(dxTiles, dyTiles, 0);

  }, [lat, lon, level]);

  // 👉 十字方向：上北(N)、下南(S)、左西(W)、右东(E)
  // 每次移动 0.35 个 tile，手感较明显，不至于跳得太远
  const STEP = 0.35;
  const goNorth = () => moveByTiles(0, +STEP);
  const goSouth = () => moveByTiles(0, -STEP);
  const goWest  = () => moveByTiles(-STEP, 0);
  const goEast  = () => moveByTiles(+STEP, 0);

  // 👉 键盘 WASD / 方向键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)) {
        e.preventDefault();
      }
      if (k === 'w' || k === 'arrowup')   goNorth();
      if (k === 's' || k === 'arrowdown') goSouth();
      if (k === 'a' || k === 'arrowleft') goWest();
      if (k === 'd' || k === 'arrowright') goEast();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNorth, goSouth, goWest, goEast]);

  // 👉 小信息卡：显示当前中心 & 当前 tile（便于你验证是否跨片）
  const tileInfo = useMemo(() => {
    const { x, y } = lonLatToTileXY(lat, lon, level);
    return { x, y, z: level };
  }, [lat, lon, level]);

  return (
    <div ref={containerRef} className="relative flex w-full h-full">
      {/* 左上：层级/环数控制 */}
      <div className="absolute top-4 left-4 z-50" style={{ minWidth: 320 }}>
        <Card className="p-4" style={translucent}>
          <Slider
            size="sm"
            label={`显示层级  (L${level})`}
            step={1}
            minValue={2}
            maxValue={22}
            value={level}
            onChange={onLevelChange}
            showSteps={false}
          />
          <div style={{ height: 12 }} />
          <Slider
            size="sm"
            label={`邻居环数  (rings=${rings}${ringsManual ? ', 手动' : ', 自动'})`}
            step={1}
            minValue={0}
            maxValue={4}
            value={rings}
            onChange={onRingsChange}
            showSteps={false}
          />
        </Card>
      </div>

      {/* 右上：方向控制 + 状态 */}
      <div className="absolute top-4 right-4 z-50">
        <div className="flex flex-col gap-3">
          {/* 方向键卡片 */}
          <Card className="p-3" style={translucent}>
            <div className="text-sm mb-2 opacity-80">导航（WASD / 方向键）</div>
            <div className="grid grid-cols-3 gap-2">
              <div />
              <Button size="sm" onPress={goNorth} aria-label="向上">↑</Button>
              <div />
              <Button size="sm" onPress={goWest} aria-label="向左">←</Button>
              <div />
              <Button size="sm" onPress={goEast} aria-label="向右">→</Button>
              <div />
              <Button size="sm" onPress={goSouth} aria-label="向下">↓</Button>
              <div />
            </div>
          </Card>

          {/* 信息卡片：用于你验证是否跨到新 tile */}
          <Card className="p-3" style={translucent}>
            <div className="text-xs opacity-70">中心</div>
            <div className="text-sm">lat {lat.toFixed(6)}, lon {lon.toFixed(6)}</div>
            <div className="text-xs opacity-70 mt-2">瓦片 (Slippy)</div>
            <div className="text-sm">z {tileInfo.z}, x {tileInfo.x}, y {tileInfo.y}</div>
          </Card>
        </div>
      </div>

      <LiveCanvas>
        {(canvas) => (
          <MapGpu
            canvas={canvas}
            level={level}
            rings={rings}
            lat={lat}
            lon={lon}
            cameraTarget={camTarget ?? undefined}
            cameraRadius={camRadius ?? undefined}
            onBoundsChange={handleBounds}


          />
        )}
      </LiveCanvas>
    </div>
  );
};

export default Map;
