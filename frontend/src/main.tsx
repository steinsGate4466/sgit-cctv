import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './styles.css';
import ErrorBoundary from './components/ErrorBoundary';
import { ProveedorDialogos } from './components/Dialogos';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* La de fuera atrapa lo que falle en el propio armazón o en el acceso.
        Hay otra dentro del Layout, alrededor del contenido, para que un fallo
        de UNA pantalla no se lleve por delante el menú. */}
    <ErrorBoundary donde="aplicación">
      <BrowserRouter>
        <AuthProvider>
          {/* Los diálogos van DENTRO del enrutador y DENTRO del acceso, para
              que un mensaje pueda nombrar al usuario o llevar a una ruta. Y
              por debajo del ErrorBoundary: si el proveedor mismo falla, la
              red de seguridad sigue por encima. */}
          <ProveedorDialogos>
            <App />
          </ProveedorDialogos>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
