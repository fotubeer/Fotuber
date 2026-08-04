import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminPassportPhoto from "@/pages/admin/AdminPassportPhoto";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AdminPassportPhoto />} />
          <Route path="/admin/vesikalik" element={<AdminPassportPhoto />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
