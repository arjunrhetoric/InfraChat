import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getRoleName } from "../utils/roles";

function Sidebar({
  user,
  rooms,
  users,
  selectedChat,
  roomForm,
  setRoomForm,
  handleCreateRoom,
  handleJoinRoom,
  handleLeaveRoom,
  isRoomMember,
  openRoom,
  openDm,
  message,
  roomUnread,
  dmUnread,
}) {
  const canCreateRoom = user && user.role >= 2;

  const [roomSearch, setRoomSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) =>
      room.name?.toLowerCase().includes(roomSearch.toLowerCase())
    );
  }, [rooms, roomSearch]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      u.username?.toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [users, userSearch]);

  return (
    <div className="workspace-sidebar">
      <div className="sidebar-section">
        <h2>InfraChat</h2>

        {user && (
          <p className="workspace-user">
            {user.username} ({getRoleName(user.role)})
          </p>
        )}
    <br />
        {user?.role === 3 && (
          <Link to="/admin" className="btn primary small sidebar-admin-btn">
            Open Admin Panel
          </Link>
        )}

        {message && <p className="info-text">{message}</p>}
      </div>

      {canCreateRoom && (
        <div className="sidebar-section">
          <h3>Create Room</h3>
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
              Private
            </label>
            {user?.role === 3 && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={roomForm.roomType === "broadcast"}
                  onChange={(e) =>
                    setRoomForm({
                      ...roomForm,
                      roomType: e.target.checked ? "broadcast" : "public",
                      isPrivate: e.target.checked ? false : roomForm.isPrivate,
                    })
                  }
                />
                Broadcast (only mods can send)
              </label>
            )}
            <button className="btn primary" type="submit">
              Create
            </button>
          </form>
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-header-row">
          <h3>Rooms</h3>
        </div>

        <input
          type="text"
          placeholder="Search rooms..."
          value={roomSearch}
          onChange={(e) => setRoomSearch(e.target.value)}
          className="sidebar-search"
        />

        <div className="workspace-list">
          {filteredRooms.length === 0 ? (
            <p className="empty-sidebar-text">No matching rooms</p>
          ) : (
            filteredRooms.map((room) => {
              const joined = isRoomMember(room);
              const selected =
                selectedChat?.type === "room" &&
                selectedChat?.data?._id === room._id;

              return (
                <div
                  key={room._id}
                  className={`workspace-item ${selected ? "active-item" : ""}`}
                >
                  <div
                    className="workspace-item-main"
                    onClick={() => joined && openRoom(room)}
                  >
                    <div className="workspace-row">
                      <strong>{room.name}</strong>
                      {roomUnread?.[room._id] > 0 && (
                        <span className="unread-badge">
                          {roomUnread[room._id]}
                        </span>
                      )}
                    </div>

                    <span className="workspace-subtext">
                      {room.roomType === "broadcast"
                        ? "Broadcast"
                        : room.isPrivate
                        ? "Private"
                        : "Public"}
                      {room.isArchived ? " (Archived)" : ""}
                    </span>
                  </div>

                  <div className="workspace-actions">
                    {joined ? (
                      <>
                        <button
                          className="btn primary small"
                          onClick={() => openRoom(room)}
                        >
                          Open
                        </button>
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
                        Join
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header-row">
          <h3>Users</h3>
        </div>

        <input
          type="text"
          placeholder="Search users..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="sidebar-search"
        />

        <div className="workspace-list">
          {filteredUsers.length === 0 ? (
            <p className="empty-sidebar-text">No matching users</p>
          ) : (
            filteredUsers.map((u) => {
              const selected =
                selectedChat?.type === "dm" &&
                selectedChat?.data?._id === u._id;

              return (
                <div
                  key={u._id}
                  className={`workspace-item clickable ${
                    selected ? "active-item" : ""
                  }`}
                  onClick={() => openDm(u)}
                >
                  <div className="workspace-item-main">
                    <div className="workspace-row">
                      <strong>{u.username}</strong>
                      {dmUnread?.[u._id] > 0 && (
                        <span className="unread-badge">{dmUnread[u._id]}</span>
                      )}
                    </div>

                    <span className="workspace-subtext">
                      {getRoleName(u.role)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
