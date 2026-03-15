import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import NetworkDiag from "./pages/NetworkDiag";
import WinOptimizer from "./pages/WinOptimizer";
import SmartVPN from "./pages/SmartVPN";
import ServerPicker from "./pages/ServerPicker";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/network" element={<NetworkDiag />} />
        <Route path="/optimizer" element={<WinOptimizer />} />
        <Route path="/vpn" element={<SmartVPN />} />
        <Route path="/servers" element={<ServerPicker />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
