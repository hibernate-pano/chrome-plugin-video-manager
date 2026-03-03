import { createRoot } from 'react-dom/client';
import ContentApp from './components/ContentApp';
import './styles/globals.css';

// 创建 Shadow DOM 容器
const container = document.createElement('div');
container.id = 'vsc-root';
document.body.appendChild(container);

const shadowRoot = container.attachShadow({ mode: 'open' });

// 注入样式
const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');
`;
shadowRoot.appendChild(style);

// 创建 React 根
const root = createRoot(shadowRoot);
root.render(<ContentApp />);
