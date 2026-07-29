import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Audit from './pages/Audit';
import Incidents from './pages/Incidents';
import Users from './pages/Users';
import Maintenance from './pages/Maintenance';
import Preventive from './pages/Preventive';
import Corrective from './pages/Corrective';
import Predictive from './pages/Predictive';
import TrainBoard from './pages/TrainBoard';
import Improvements from './pages/Improvements';
import Cabinets from './pages/Cabinets';
import Locations from './pages/Locations';
import Access from './pages/Access';
import AssetScan from './pages/AssetScan';
import Inventory from './pages/Inventory';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trains" element={<TrainBoard />} />
        <Route path="/assets" element={<Assets />} />
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
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
