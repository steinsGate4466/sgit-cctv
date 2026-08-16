import { Suspense } from 'react';
import { lazyConReintento } from './lazy-con-reintento';
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
const Dashboard = lazyConReintento(() => import('./pages/Dashboard'));
const Bandeja = lazyConReintento(() => import('./pages/Bandeja'));
const MiTren = lazyConReintento(() => import('./pages/MiTren'));
const TrainBoard = lazyConReintento(() => import('./pages/TrainBoard'));
const Assets = lazyConReintento(() => import('./pages/Assets'));
const Mapeo = lazyConReintento(() => import('./pages/Mapeo'));
const Cableado = lazyConReintento(() => import('./pages/Cableado'));
const Topologia = lazyConReintento(() => import('./pages/Topologia'));
const Riesgo = lazyConReintento(() => import('./pages/Riesgo'));
const MisCamaras = lazyConReintento(() => import('./pages/MisCamaras'));
const Rotulado = lazyConReintento(() => import('./pages/Rotulado'));
const Monitoreo = lazyConReintento(() => import('./pages/Monitoreo'));
const Grabadores = lazyConReintento(() => import('./pages/Grabadores'));
const Exportar = lazyConReintento(() => import('./pages/Exportar'));
const Conexiones = lazyConReintento(() => import('./pages/Conexiones'));
const Gruas = lazyConReintento(() => import('./pages/Gruas'));
const Documentos = lazyConReintento(() => import('./pages/Documentos'));
const Limpieza = lazyConReintento(() => import('./pages/Limpieza'));
const Equipos = lazyConReintento(() => import('./pages/Equipos'));
const Paradas = lazyConReintento(() => import('./pages/Paradas'));
const Instalaciones = lazyConReintento(() => import('./pages/Instalaciones'));
const Campanas = lazyConReintento(() => import('./pages/Campanas'));
const Electricidad = lazyConReintento(() => import('./pages/Electricidad'));
const Ipam = lazyConReintento(() => import('./pages/Ipam'));
const Zonas = lazyConReintento(() => import('./pages/Zonas'));
const Cobertura = lazyConReintento(() => import('./pages/Cobertura'));
const MiCuenta = lazyConReintento(() => import('./pages/MiCuenta'));
const Indicadores = lazyConReintento(() => import('./pages/Indicadores'));
const Avisos = lazyConReintento(() => import('./pages/Avisos'));
const Incidents = lazyConReintento(() => import('./pages/Incidents'));
const Maintenance = lazyConReintento(() => import('./pages/Maintenance'));
const Preventive = lazyConReintento(() => import('./pages/Preventive'));
const Corrective = lazyConReintento(() => import('./pages/Corrective'));
const Predictive = lazyConReintento(() => import('./pages/Predictive'));
const Improvements = lazyConReintento(() => import('./pages/Improvements'));
const Cabinets = lazyConReintento(() => import('./pages/Cabinets'));
const Locations = lazyConReintento(() => import('./pages/Locations'));
const Access = lazyConReintento(() => import('./pages/Access'));
const AssetScan = lazyConReintento(() => import('./pages/AssetScan'));
const CabinetScan = lazyConReintento(() => import('./pages/CabinetScan'));
const Inventory = lazyConReintento(() => import('./pages/Inventory'));
const Audit = lazyConReintento(() => import('./pages/Audit'));
const Users = lazyConReintento(() => import('./pages/Users'));
const Roles = lazyConReintento(() => import('./pages/Roles'));

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
          <Route path="/topologia" element={<Topologia />} />
          <Route path="/riesgo" element={<Riesgo />} />
          <Route path="/mis-camaras" element={<MisCamaras />} />
          <Route path="/rotulado" element={<Rotulado />} />
          <Route path="/monitoreo" element={<Monitoreo />} />
          <Route path="/grabadores" element={<Grabadores />} />
          <Route path="/exportar" element={<Exportar />} />
          <Route path="/conexiones" element={<Conexiones />} />
          <Route path="/gruas" element={<Gruas />} />
          <Route path="/documentos" element={<Documentos />} />
          <Route path="/limpieza" element={<Limpieza />} />
          <Route path="/equipos" element={<Equipos />} />
          <Route path="/paradas" element={<Paradas />} />
          <Route path="/instalaciones" element={<Instalaciones />} />
          <Route path="/campanas" element={<Campanas />} />
          <Route path="/electricidad" element={<Electricidad />} />
          <Route path="/ipam" element={<Ipam />} />
          <Route path="/zonas" element={<Zonas />} />
          <Route path="/cobertura" element={<Cobertura />} />
          <Route path="/mi-cuenta" element={<MiCuenta />} />
          <Route path="/indicadores" element={<Indicadores />} />
          <Route path="/avisos" element={<Avisos />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/preventive" element={<Preventive />} />
          <Route path="/corrective" element={<Corrective />} />
          <Route path="/predictive" element={<Predictive />} />
          <Route path="/improvements" element={<Improvements />} />
          <Route path="/cabinets" element={<Cabinets />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/access" element={<Access />} />
          {/* Destino de los QR pegados en planta. Rutas CORTAS a propósito:
              se teclean a mano cuando la cámara del celular no enfoca bien,
              con guantes y con prisa. /a/ activo · /g/ gabinete. */}
          <Route path="/a/:id" element={<AssetScan />} />
          <Route path="/g/:id" element={<CabinetScan />} />
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
