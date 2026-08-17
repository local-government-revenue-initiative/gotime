import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
// Mulish: free substitute for the brand's Avenir LT, bundled locally rather
// than fetched from Google Fonts. 200 is the display/logo light weight.
import '@fontsource/mulish/latin-200.css';
import '@fontsource/mulish/latin-400.css';
import '@fontsource/mulish/latin-600.css';
import '@fontsource/mulish/latin-700.css';
import '@fontsource/mulish/latin-800.css';
import './tokens.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
