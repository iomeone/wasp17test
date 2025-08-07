// src/components/nextui/sidebarNested/cn.js
export function cn(...classes) {
  return classes
    .flat(Infinity)          // 允许嵌套数组
    .filter(Boolean)         // 过滤掉 false / null / undefined
    .join(" ");
}
