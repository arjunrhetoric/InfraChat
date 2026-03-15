import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getRoleName } from "../utils/roles";
import { formatMessageTime } from "../utils/time";

function AuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get("/audit");
      setLogs(res.data.logs || []);
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (!user || user.role < 2) {
    return (
      <div className="page-shell">
        <div className="page-content">
          <div className="card" style={{ padding: "20px" }}>
            <h2>Access Denied</h2>
            <p className="page-subtitle">
              Only Moderator and SuperAdmin can access audit logs.
            </p>
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
            <h1>Audit Logs</h1>
            <p className="page-subtitle">
              Review important room and moderation activity.
            </p>
          </div>
        </div>

        {message && <p className="error-text">{message}</p>}

        <div className="table-card audit-grid">
          {loading ? (
            <div className="audit-row">
              <p>Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="audit-row">
              <p>No audit logs found.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div className="audit-row" key={log._id}>
                <div className="audit-title">{log.action}</div>
                <div className="audit-desc">
                  {log.details || "No details available"}
                </div>

                <div className="audit-meta">
                  <span>
                    <strong>By:</strong>{" "}
                    {log.performedBy?.username || "Unknown"}
                    {log.performedBy?.role
                      ? ` (${getRoleName(log.performedBy.role)})`
                      : ""}
                  </span>

                  {log.targetUser && (
                    <span>
                      <strong>Target:</strong> {log.targetUser.username}
                    </span>
                  )}

                  {log.room && (
                    <span>
                      <strong>Room:</strong> {log.room.name}
                    </span>
                  )}

                  <span>
                    <strong>Time:</strong> {formatMessageTime(log.createdAt)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AuditLogs;
