/**
 * [INPUT]: 依赖 react-dom/client 的 createRoot，依赖 ./App 的根组件
 * [OUTPUT]: 无导出（副作用入口：挂载 React 应用到 #root DOM 节点）
 * [POS]: 项目启动入口，整个应用的引导层；被 index.html 通过 <script type="module"> 引用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
