import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get("/users");
        setUsers(res.data.users || []);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load users");
      }
    };

    fetchUsers();
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h2>Users</h2>

        {error && <p className="error-text">{error}</p>}

        {users.length === 0 ? (
          <p>No users found</p>
        ) : (
          <div className="list">
            {users.map((user) => (
              <div className="list-item" key={user._id}>
                <div>
                  <h3>{user.username}</h3>
                  <p>{user.email}</p>
                </div>

                <Link to={`/dm/${user._id}`} className="btn primary small">
                  Message
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Users;
