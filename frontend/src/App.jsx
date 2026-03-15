import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import RoomChat from "./pages/RoomChat";
import DirectMessages from "./pages/DirectMessages";
import Users from "./pages/Users";
import Workspace from "./pages/Workspace";
import "./App.css";
import AdminPanel from "./pages/AdminPanel";
import AuditLogs from "./pages/AuditLogs";


function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Workspace/>
            </ProtectedRoute>
          }
        />

          <Route
  path="/admin"
  element={
    <ProtectedRoute>
      <AdminPanel />
    </ProtectedRoute>
  }
/>

        <Route
          path="/rooms/:id"
          element={
            <ProtectedRoute>
              <RoomChat />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dm/:userId"
          element={
            <ProtectedRoute>
              <DirectMessages />
            </ProtectedRoute>
          }
        />

        <Route
  path="/users"
  element={
    <ProtectedRoute>
      <Users />
    </ProtectedRoute>
  }
/>

<Route
  path="/audit"
  element={
    <ProtectedRoute>
      <AuditLogs />
    </ProtectedRoute>
  }
/>


      </Routes>

      
    </BrowserRouter>
  );
}

export default App;
