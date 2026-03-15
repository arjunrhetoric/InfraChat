import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getRoleName } from "../utils/roles";

function Dashboard() {
  const { user } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [roomForm, setRoomForm] = useState({
    name: "",
    description: "",
    isPrivate: false,
    roomType: "public",
  });
  const [message, setMessage] = useState("");

  const fetchRooms = async () => {
    try {
      const res = await api.get("/rooms");
      setRooms(res.data.rooms || []);
    } catch (err) {
      console.error("Failed to fetch rooms", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data.users || []);
    } catch (err) {
      console.error("Failed to fetch users", err);
    }
  };

  useEffect(() => {
    fetchRooms();
    fetchUsers();
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      await api.post("/rooms", roomForm);
      setMessage("Room created successfully");
      setRoomForm({
        name: "",
        description: "",
        isPrivate: false,
        roomType: "public",
      });
      fetchRooms();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to create room");
    }
  };

  const handleJoinRoom = async (roomId) => {
    setMessage("");

    try {
      await api.post(`/rooms/${roomId}/join`);
      setMessage("Joined room successfully");
      fetchRooms();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to join room");
    }
  };

  const handleLeaveRoom = async (roomId) => {
    setMessage("");

    try {
      await api.post(`/rooms/${roomId}/leave`);
      setMessage("Left room successfully");
      fetchRooms();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to leave room");
    }
  };

  const isRoomMember = (room) => {
    if (!room.members || !user) return false;

    return room.members.some((member) => {
      const memberId =
        typeof member === "string" ? member : member._id || member.id;
      return memberId === user.id;
    });
  };

  const canCreateRoom = user && user.role >= 2;

  return (
    <div className="container">
      <h1>Dashboard</h1>

      {user && (
        <p className="role-banner">
          Logged in as: <strong>{getRoleName(user.role)}</strong>
        </p>
      )}

      {message && <p className="info-text">{message}</p>}

      <div className="dashboard-grid">
        {canCreateRoom && (
          <div className="card">
            <h2>Create Room</h2>
            <form onSubmit={handleCreateRoom} className="form-stack">
              <input
                type="text"
                placeholder="Room name"
                value={roomForm.name}
                onChange={(e) =>
                  setRoomForm({ ...roomForm, name: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Description"
                value={roomForm.description}
                onChange={(e) =>
                  setRoomForm({ ...roomForm, description: e.target.value })
                }
              />

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={roomForm.isPrivate}
                  onChange={(e) =>
                    setRoomForm({
                      ...roomForm,
                      isPrivate: e.target.checked,
                      roomType: e.target.checked ? "private" : "public",
                    })
                  }
                />
                Private room
              </label>

              <button className="btn primary" type="submit">
                Create Room
              </button>
            </form>
          </div>
        )}

        <div className="card">
          <h2>Rooms</h2>
          {rooms.length === 0 ? (
            <p>No rooms found</p>
          ) : (
            <div className="list">
              {rooms.map((room) => {
                const joined = isRoomMember(room);

                return (
                  <div className="list-item" key={room._id}>
                    <div>
                      <h3>{room.name}</h3>
                      <p>{room.description || "No description"}</p>
                      <p className="room-meta">
                        {room.isPrivate ? "Private" : "Public"}
                      </p>
                    </div>

                    <div className="room-actions">
                      {joined ? (
                        <>
                          <Link
                            className="btn primary small"
                            to={`/rooms/${room._id}`}
                          >
                            Open Chat
                          </Link>
                          <button
                            className="btn danger small"
                            onClick={() => handleLeaveRoom(room._id)}
                          >
                            Leave
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn primary small"
                          onClick={() => handleJoinRoom(room._id)}
                        >
                          Join Room
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Users</h2>
          {users.length === 0 ? (
            <p>No users found</p>
          ) : (
            <div className="list">
              {users.map((u) => (
                <div className="list-item" key={u._id}>
                  <div>
                    <h3>{u.username}</h3>
                    <p>{u.email}</p>
                    <p className="role-text">{getRoleName(u.role)}</p>
                  </div>

                  <Link className="btn primary small" to={`/dm/${u._id}`}>
                    Message
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
