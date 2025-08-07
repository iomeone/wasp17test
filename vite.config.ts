import { defineConfig } from 'vite'

import rollupWGSL from "@use-gpu/wgsl-loader/rollup";
import wasm from "vite-plugin-wasm";



export default defineConfig({
  server: {

    // 只在本机回环地址上监听，别人访问不了你的 IP
    host: '127.0.0.1',
    // 如果想指定端口也可以顺便写上
    port: 3000,
    // 如果 3000 被占用就报错，不再自动切换到 3001
    strictPort: true,


    open: true,
  },



 resolve: {
    // 硬性去重
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    // 不要把这几个包预打包成它们自己带的 React
    exclude: ['@use-gpu/react', '@use-gpu/live']
  },


    plugins: [
    rollupWGSL(),
     wasm()
  ],
})