import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

// 로더 숨기기
setTimeout(() => {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
}, 500);
