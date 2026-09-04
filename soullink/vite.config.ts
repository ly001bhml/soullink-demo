import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** 大 POST 走代理时，长连接略稳一些 */
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

/**
 * 代理出错时在终端打出可操作的提示（ECONNRESET 多为上游 Nginx 体积极限或进程崩）
 * @param proxy - http-proxy 实例
 * @param target - 上游 base URL
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- http-proxy 无稳定类型导入
function attachProxyUpstreamHints(proxy: any, target: string) {
  proxy.on('error', (err: NodeJS.ErrnoException) => {
    const code = err.code ?? err.message;
    console.error(`[vite] /api 代理 → ${target} 出错: ${code}`);
    if (code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) {
      console.error(
        '[vite] 提示: 上游在传大 JSON(Base64 图)时主动断连，常见原因是远端 Nginx 未设置足够大的 client_max_body_size（默认约 1m），或 Flask/网关崩溃。请在 19500 及前面每一层 Nginx 上放宽并重载。'
      );
    }
    if (code === 'ECONNREFUSED') {
      console.error('[vite] 提示: 连接被拒绝，请确认 VITE_FAY_API_URL 指向可访问的后端地址与端口。');
    }
  });
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(__dirname, '.'), '');
    /** 开发时代理 /api 的目标，需与 .env 中 VITE_FAY_API_URL 或 VITE_DEV_BACKEND 一致 */
    const proxyTarget = (env.VITE_DEV_BACKEND || env.VITE_FAY_API_URL || 'http://127.0.0.1:5000').replace(
      /\/+$/,
      ''
    );
    if (!env.VITE_DEV_BACKEND && !env.VITE_FAY_API_URL) {
      console.warn(
        '[vite] 未检测到 VITE_FAY_API_URL / VITE_DEV_BACKEND，/api 将代理到 http://127.0.0.1:5000（若图生3D连远程，请在 .env.local 配置与设置页一致的后端地址）'
      );
    } else {
      console.log(
        `[vite] /api 代理目标: ${proxyTarget}（图生3D 仅当该地址与设置页 API 的协议+主机+端口一致时才走代理，否则直连设置页）`
      );
    }
    const proxyAgent = proxyTarget.startsWith('https') ? httpsAgent : httpAgent;
    /** 图生/文生 3D 耗时长、JSON+Base64 体大；代理默认超时过短会导致 net::ERR_CONNECTION_RESET */
    const HUNYUAN_PROXY_MS = 900_000;
    const defaultApiProxy = {
      target: proxyTarget,
      changeOrigin: true,
      secure: false,
      agent: proxyAgent,
      timeout: 120_000,
      proxyTimeout: 120_000,
      configure: (proxy: any) => attachProxyUpstreamHints(proxy, proxyTarget),
    };
    return {
      build: {
        // Capacitor Android WebView can lag behind desktop Chrome, so force
        // Vite/esbuild to downlevel modern syntax such as optional chaining.
        target: ['chrome74'],
        cssTarget: ['chrome74'],
      },
      server: {
        port: 5173,
        host: '0.0.0.0',
        strictPort: false,
        proxy: {
          // 必须先写更长的前缀，避免被下面的 /api 抢先匹配
          '/api/hunyuan3d': {
            target: proxyTarget,
            changeOrigin: true,
            secure: false,
            agent: proxyAgent,
            timeout: HUNYUAN_PROXY_MS,
            proxyTimeout: HUNYUAN_PROXY_MS,
            configure: (proxy: any) => {
              attachProxyUpstreamHints(proxy, proxyTarget);
              proxy.on('proxyReq', (proxyReq, req) => {
                proxyReq.setTimeout(HUNYUAN_PROXY_MS);
                req.socket?.setTimeout(HUNYUAN_PROXY_MS);
              });
            },
          },
          '/api': defaultApiProxy,
        },
        watch: {
          ignored: [
            '**/android/app/build/**',
            '**/android/app/src/main/assets/public/**',
            '**/android/capacitor-cordova-android-plugins/**',
          ],
        },
      },
      plugins: [
        react(),
        {
          name: 'exclude-runtime-models-from-android-bundle',
          closeBundle() {
            const distModelsDir = path.resolve(__dirname, 'dist', 'models');
            if (fs.existsSync(distModelsDir)) {
              fs.rmSync(distModelsDir, { recursive: true, force: true });
              console.log('[vite] Removed dist/models to keep runtime GLB assets out of APK');
            }
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'PROCESS_ENV': JSON.stringify({
          WORKERS_CI_COMMIT_SHA: 'unknown',
          WORKERS_CI_BRANCH: 'main'
        })
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
          '@mesh2motion': path.resolve(__dirname, '../mesh2motion/src'),
        },
        extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
        // 确保能够从 soullink 的 node_modules 解析依赖
        dedupe: ['three', 'tippy.js', 'jszip', 'file-saver'],
        // 确保模块解析从当前项目的 node_modules 开始
        preserveSymlinks: false
      },
      optimizeDeps: {
        include: ['three', 'tippy.js', 'jszip', 'file-saver']
      }
    };
});
