import { defineConfig } from 'vite'

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
})