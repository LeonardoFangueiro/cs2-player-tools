import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import NetworkDiag from "./pages/NetworkDiag";
import WinOptimizer from "./pages/WinOptimizer";
import SmartVPN from "./pages/SmartVPN";
import ServerPicker from "./pages/ServerPicker";
import Cs2Config from "./pages/Cs2Config";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Placeholder from "./pages/Placeholder";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/network" element={<NetworkDiag />} />
        <Route path="/optimizer" element={<WinOptimizer />} />
        <Route path="/vpn" element={<SmartVPN />} />
        <Route path="/servers" element={<ServerPicker />} />
        <Route path="/cs2config" element={<Cs2Config />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/inventory" element={<Placeholder />} />
        <Route path="/gameplay-opt" element={<Placeholder />} />
        <Route path="/profile" element={<Placeholder />} />
        <Route path="/check-account" element={<Placeholder />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
