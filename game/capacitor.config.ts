import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.soullink.virtualcompanion',
  appName: 'SoulLink 虚拟陪伴',
  webDir: 'dist',
  server: {
    androidScheme: 'http', // 改为 http 以允许 HTTP API 请求
    // 开发模式：取消注释下面两行，并设置你的开发服务器地址
    // url: 'http://192.168.1.100:3003', // 替换为你的局域网 IP 和端口
    // cleartext: true // 允许 HTTP（仅开发时）
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0f172a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    Keyboard: {
      resize: "native",
      style: "dark",
      resizeOnFullScreen: true
    }
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: undefined
    }
  }
};

export default config;
