import { createRoot } from 'react-dom/client';
import ContentApp from './components/ContentApp';
import './styles/globals.css';

const existingContainer = document.getElementById('vsc-root');
const container = existingContainer ?? document.createElement('div');

if (!existingContainer) {
  container.id = 'vsc-root';
  container.setAttribute('data-vsc-root', 'true');
  document.documentElement.appendChild(container);
}

const root = createRoot(container);
root.render(<ContentApp />);
