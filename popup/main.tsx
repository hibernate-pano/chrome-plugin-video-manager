import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from './PopupApp';
import './styles/index.css';

// 渲染 Popup 应用
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
