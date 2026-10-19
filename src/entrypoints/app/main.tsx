import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/styles.css';
import { LanguageRoot } from '@/lib/i18n/language-root';
import { startPageLanguage } from '@/lib/settings';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

// The first frame is already in the language of the setting.
void startPageLanguage().finally(() =>
  createRoot(root).render(
    <StrictMode>
      <LanguageRoot>
        <App />
      </LanguageRoot>
    </StrictMode>,
  ),
);
