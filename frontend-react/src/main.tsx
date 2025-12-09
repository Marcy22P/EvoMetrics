import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from '@shopify/polaris';
import it from '@shopify/polaris/locales/it.json';
import '@shopify/polaris/build/esm/styles.css';
import './index.css'
import App from './App.tsx'
import { LinkAdapter } from './components/LinkAdapter';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider i18n={it} linkComponent={LinkAdapter}>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
