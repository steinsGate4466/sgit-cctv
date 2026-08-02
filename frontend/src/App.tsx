import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { EsqueletoTablero } from './components/Esqueleto';

/**
 * CARGA POR PÁGINA (4D-2).
 *
 * Antes esto importaba las 22 pantallas arriba del todo, así que el
 * navegador se descargaba TODAS antes de pintar la primera: 932 kB, 263 kB
 * comprimidos. Con la wifi de planta, en un celular, eso son varios segundos
 * mirando una pantalla en blanco — y el técnico sólo iba a abrir una.
 *
 * Con `lazy` cada pantalla viaja en su propio archivo y se descarga cuando
 * se entra en ella. El primer arranque baja a lo imprescindible: acceso,
 * armazón y tablero.
 *
 * Login, Layout y ProtectedRoute NO van aquí a propósito: hacen falta
 * siempre y en el primer instante. Partirlos añadiría una espera justo donde
 * más se nota.
 *
 * El respaldo mientras carga es el mismo esqueleto que ya usa el tablero.
 * Un texto de "cargando" distinto en cada sitio se lee como que el sistema
 * hace cosas raras.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Bandeja = lazy(() => import('./pages/Bandeja'));
const MiTren = lazy(() => import('./pages/MiTren'));
const TrainBoard = lazy(() => import('./pages/TrainBoard'));
const Assets = lazy(() => import('./pages/Assets'));
const Mapeo = lazy(() => import('./pages/Mapeo'));
const Cableado = lazy(() => import('./pages/Cableado'));
const Incidents = lazy(() => import('./pages/Incidents'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Preventive = lazy(() => import('./pages/Preventive'));
const Corrective = lazy(() => import('./pages/Corrective'));
const Predictive = lazy(() => import('./pages/Predictive'));
const Improvements = lazy(() => import('./pages/Improvements'));
const Cabinets = lazy(() => import('./pages/Cabinets'));
const Locations = lazy(() => import('./pages/Locations'));
const Access = lazy(() => import('./pages/Access'));
const AssetScan = lazy(() => import('./pages/AssetScan'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Audit = lazy(() => import('./pages/Audit'));
const Users = lazy(() => import('./pages/Users'));
const Roles = lazy(() => import('./pages/Roles'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* El Suspense envuelve TODAS las rutas de dentro, no cada una:
            así el armazón (menú y cabecera) no parpadea al cambiar de
            pantalla. Sólo se reemplaza el contenido. */}
        <Route
          element={
            <Suspense fallback={<EsqueletoTablero kpis={4} paneles={2} />}>
              <Outlet />
            </Suspense>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/bandeja" element={<Bandeja />} />
          <Route path="/mi-tren" element={<MiTren />} />
          <Route path="/trains" element={<TrainBoard />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/mapeo" element={<Mapeo />} />
          <Route path="/cableado" element={<Cableado />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/preventive" element={<Preventive />} />
          <Route path="/corrective" element={<Corrective />} />
          <Route path="/predictive" element={<Predictive />} />
          <Route path="/improvements" element={<Improvements />} />
          <Route path="/cabinets" element={<Cabinets />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/access" element={<Access />} />
          {/* Destino del QR pegado en el equipo (ficha rápida para el celular) */}
          <Route path="/a/:id" element={<AssetScan />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/users" element={<Users />} />
          <Route path="/roles" element={<Roles />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
