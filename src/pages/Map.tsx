import React, { useState, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { LiveCanvas } from '@use-gpu/react';
import { MapGpu } from '../components/MapGpu';
import { Card, CardHeader, CardBody, Button, Spacer, Slider } from "@heroui/react";




const translucent = {
  backdropFilter: 'saturate(180%) blur(8px)',
  background: 'rgba(255,255,255,0.65)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

function suggestRingsByLevel(level: number) {
  // 简单启发：L 高 → rings 小
  if (level >= 16) return 0;
  if (level >= 12) return 1;
  if (level >= 9)  return 2;
  return 3; // 别太大，避免炸网卡/GPU
}




export const Map: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // UI state
  const [level, setLevel] = useState<number>(18);
  const [rings, setRings] = useState<number>(1);
  const [ringsManual, setRingsManual] = useState<boolean>(false); // 是否已手动接管

  // 当 level 调整时，如果没有手动接管，就自动建议 rings
  const onLevelChange = useCallback((val: number | number[]) => {
    const L = Array.isArray(val) ? val[0]! : val;
    setLevel(L);
    if (!ringsManual) {
      const autoR = suggestRingsByLevel(L);
      console.log(`[UI][AutoRings] level=${L} -> rings=${autoR}`);
      setRings(autoR);
    }
  }, [ringsManual]);

  const onRingsChange = useCallback((val: number | number[]) => {
    const R = Array.isArray(val) ? val[0]! : val;
    setRings(R);
    // 一旦用户动过 rings，就标记为手动接管
    if (!ringsManual) {
      console.log('[UI] rings 被手动调整，进入手动模式');
      setRingsManual(true);
    }
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

  return (
    <div ref={containerRef} className="relative flex w-full h-full">
      {/* 叠加的控制面板 */}
      <div className="absolute top-4 left-4 z-50" style={{ minWidth: 320 }}>
        <Card className="p-4" style={translucent}>
          <Slider
            size="sm"
            label={`显示层级  (L${level})`}
            step={1}
            minValue={2}
            maxValue={22}  // UI 允许到 22；MapGpu 内部会根据真实可用层级夹紧
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
            maxValue={4}    // 给个安全上限，避免一次拉太多块
            value={rings}
            onChange={onRingsChange}
            showSteps={false}
          />
        </Card>
      </div>

      <LiveCanvas>
        {(canvas) => (
          <MapGpu
            canvas={canvas}
            level={level}
            rings={rings}
          />
        )}
      </LiveCanvas>
    </div>
  );
};
export default Map;
