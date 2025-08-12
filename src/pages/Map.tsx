import React, { useState, useLayoutEffect, useRef } from 'react';
import { LiveCanvas } from '@use-gpu/react';
import { QuadTest } from '../components/SimpleQuad';

export const Map: React.FC = () => {
  // 1. 创建一个 ref 来引用我们的 div 容器
  const containerRef = useRef<HTMLDivElement>(null);
  // 2. 使用 state 来存储和更新尺寸
  const [size, setSize] = useState({ width: 0, height: 0 });

  // 3. 使用 Effect 在 React 环境中安全地监听尺寸变化
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 4. 创建一个 ResizeObserver 来监测容器 div 的尺寸
    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });

    resizeObserver.observe(container);

    // 5. 组件卸载时，停止监听以防止内存泄漏
    return () => resizeObserver.disconnect();
  }, []); // 空依赖数组确保这个 Effect 只运行一次

  return (
    // 6. 将 ref 附加到 div 上
    <div  className="relative flex w-full h-full">
      <LiveCanvas >
        {/* 7. 现在，我们将从 state 中获取的 width 和 height 传递给 MyGpu */}
        {(canvas) => <QuadTest canvas={canvas}  />}
      </LiveCanvas>
    </div>
  );
};

export default Map;
