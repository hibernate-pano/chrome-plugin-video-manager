import { createRoot } from 'react-dom/client';
import OptionsPage from './components/OptionsPage';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);
root.render(<OptionsPage />);
