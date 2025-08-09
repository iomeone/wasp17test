import React, { useState, useLayoutEffect, useRef } from 'react';
import { LiveCanvas } from '@use-gpu/react';
import { MapGpu } from '../components/MapGpu';
import { Card, CardHeader, CardBody, Button, Spacer, Slider } from "@heroui/react";

export const Map: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // 新增：当前 zoom 层级
  const [level, setLevel] = useState<number>(18);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative flex w-full h-full">
      {/* GPU 渲染 */}
      <LiveCanvas>
        {(canvas) => <MapGpu canvas={canvas}  />}
      </LiveCanvas>


      <div className="absolute top-4 left-4 z-10 w-72">
        <Card
          shadow="none"                // 去掉阴影
          className="bg-transparent p-2" // 背景透明 + 内边距
        >
          <CardBody className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
            <Slider
              label="显示层级"
              minValue={2}
              maxValue={18}
              step={1}
              value={level}
              onChange={(v) => setLevel(Array.isArray(v) ? v[0] : v)}
              getValue={(v) => `L${Array.isArray(v) ? v[0] : v}`}
            />
          </CardBody>
        </Card>
      </div>


    
    </div>
  );
};

export default Map;
