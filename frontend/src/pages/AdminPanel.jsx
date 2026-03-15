import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getRoleName } from "../utils/roles";

function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data.users || []);
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to load users");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const updateRole = async (userId, newRole) => {
    setMessage("");

    try {
      await api.patch(`/users/${userId}/role`, {
        role: Number(newRole),
      });

      setMessage("User role updated successfully");
      fetchUsers();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to update role");
    }
  };

  if (!user || user.role < 3) {
    return (
      <div className="page-shell">
        <div className="page-content">
          <div className="card" style={{ padding: "20px" }}>
            <h2>Access Denied</h2>
            <p className="page-subtitle">Only SuperAdmin can access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>Admin Panel</h1>
            <p className="page-subtitle">
              Manage user roles and platform access.
            </p>
          </div>
        </div>

        {message && <p className="info-text">{message}</p>}

        <div className="table-card">
          <div className="table-list">
            <div className="table-row table-head">
              <div>User</div>
              <div>Current Role</div>
              <div>Change Role</div>
            </div>

            {users.map((u) => {
              const id = u._id || u.id;
              const isSelf = user.id === id;

              return (
                <div className="table-row" key={id}>
                  <div>
                    <div className="table-cell-title">{u.username}</div>
                    <div className="table-cell-sub">{u.email}</div>
                  </div>

                  <div>
                    <span className="status-pill">{getRoleName(u.role)}</span>
                  </div>

                  <div className="admin-actions">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(id, e.target.value)}
                      disabled={isSelf}
                    >
                      <option value={1}>Member</option>
                      <option value={2}>Moderator</option>
                      <option value={3}>SuperAdmin</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
