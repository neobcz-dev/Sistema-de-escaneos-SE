import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { activarAutoActualizacion } from './lib/autoActualizar'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// La app se actualiza sola cuando publicamos una versión nueva.
activarAutoActualizacion()
