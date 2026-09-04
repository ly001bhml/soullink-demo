import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { APIConfig } from './services/apiConfig';

// 应用启动时初始化 API 配置
APIConfig.init();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);