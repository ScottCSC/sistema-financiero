import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import Inicio from "./pages/Inicio.jsx";
import FlujoCaja from "./pages/FlujoCaja.jsx";
import Configuracion from "./pages/Configuracion.jsx";
import Ayuda from "./pages/Ayuda.jsx";
import "./App.css";

function App() {
  return (
    <div className="app-shell">
      <nav className="main-nav" aria-label="Navegación principal">
        <NavLink to="/" end className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}>
          Libro Banco
        </NavLink>
        <NavLink
          to="/flujo-caja"
          className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}
        >
          Flujo de Caja
        </NavLink>
        <NavLink
          to="/configuracion"
          className={({ isActive }) => `nav-tab${isActive ? " active" : ""}`}
        >
          Ajustes
        </NavLink>
        <NavLink
          to="/ayuda"
          className={({ isActive }) => `nav-tab nav-tab-ayuda${isActive ? " active" : ""}`}
        >
          <HelpCircle size={18} aria-hidden="true" />
          Ayuda
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/flujo-caja" element={<FlujoCaja />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/ayuda" element={<Ayuda />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
