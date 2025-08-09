import React, { useState, useLayoutEffect, useRef, useMemo, useCallback, useEffect } from 'react';
import { LiveCanvas } from '@use-gpu/react';
import { MapGpu } from '../components/MapGpu';
import { Card, Button, Slider } from "@heroui/react";

// 新增：从 MapGpu 导入工具函数
import { lonLatToTileXY, tileBounds } from '../components/MapGpu';

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
  const [lat, setLat] = useState<number>(30.3748035);
  const [lon, setLon] = useState<number>(-81.5933274);

  // UI state
  const [level, setLevel] = useState<number>(18);
  const [rings, setRings] = useState<number>(1);
  const [ringsManual, setRingsManual] = useState<boolean>(false);

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
          />
        )}
      </LiveCanvas>
    </div>
  );
};

export default Map;
