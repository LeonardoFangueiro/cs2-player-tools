import { useLocation } from "react-router-dom";
import { Clock } from "lucide-react";

export default function Placeholder() {
  const location = useLocation();
  const name = location.pathname.slice(1).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Clock size={40} className="text-text-muted/30 mb-3" />
      <h2 className="text-lg font-bold text-text-muted/50">{name}</h2>
      <p className="text-xs text-text-muted/30 mt-1">Coming soon</p>
    </div>
  );
}
