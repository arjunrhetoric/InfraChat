import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { getRoleName } from "../utils/roles";

function InfoPanel({
  user,
  selectedChat,
  members,
  onlineUsers,
  handleModerationAction,
  refreshSelectedRoomMembers,
  refreshRooms,
}) {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [roomMessage, setRoomMessage] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get("/users");
        setAllUsers(res.data.users || []);
      } catch (error) {
        console.error("Failed to fetch users", error);
      }
    };

    fetchUsers();
  }, []);

  const canModerate = user && user.role >= 2;

  const memberIds = useMemo(
    () => members.map((m) => m._id || m.id),
    [members]
  );

  const addableUsers = allUsers.filter(
    (u) => !memberIds.includes(u._id || u.id)
  );

  const addMember = async () => {
    if (!selectedUserId || selectedChat?.type !== "room") return;

    try {
      await api.post(`/rooms/${selectedChat.data._id}/members`, {
        userId: selectedUserId,
      });

      setRoomMessage("Member added successfully.");
      setSelectedUserId("");

      await refreshSelectedRoomMembers?.(selectedChat.data._id);
      await refreshRooms?.();
    } catch (err) {
      setRoomMessage(err.response?.data?.message || "Failed to add member");
    }
  };

  const removeMember = async (targetUserId) => {
  if (selectedChat?.type !== "room") return;

  try {
    await api.delete(`/rooms/${selectedChat.data._id}/members/${targetUserId}`);
    setRoomMessage("Member removed successfully.");

    await refreshSelectedRoomMembers?.(selectedChat.data._id);
    await refreshRooms?.();
  } catch (err) {
    setRoomMessage(err.response?.data?.message || "Failed to remove member");
  }
};


  if (!selectedChat) {
    return (
      <div className="workspace-info">
        <h3>Details</h3>
        <p>Select a chat to view details.</p>
      </div>
    );
  }

  if (selectedChat.type === "dm") {
    return (
      <div className="workspace-info">
        <div className="panel-header">
          <h3>User Info</h3>
        </div>

        <div className="info-card">
          <p><strong>Username:</strong> {selectedChat.data.username}</p>
          <p><strong>Email:</strong> {selectedChat.data.email}</p>
          <p><strong>Role:</strong> {getRoleName(selectedChat.data.role)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-info">
      <div className="panel-header">
        <h3>Room Info</h3>
      </div>

      <div className="info-card">
        <p><strong>Room:</strong> {selectedChat.data.name}</p>
        <p><strong>Type:</strong> {selectedChat.data.roomType === "broadcast" ? "Broadcast" : selectedChat.data.isPrivate ? "Private" : "Public"}</p>
        {selectedChat.data.isArchived && <p><strong>Status:</strong> Archived (read-only)</p>}
      </div>

      {roomMessage && <p className="info-text">{roomMessage}</p>}

      {canModerate && (
        <div className="info-card">
          <h4>Add Member</h4>

          {addableUsers.length === 0 ? (
            <p>No users available to add</p>
          ) : (
            <>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Select user</option>
                {addableUsers.map((u) => (
                  <option key={u._id || u.id} value={u._id || u.id}>
                    {u.username} ({getRoleName(u.role)})
                  </option>
                ))}
              </select>

              <div style={{ marginTop: "10px" }}>
                <button className="btn primary small" onClick={addMember}>
                  Add Member
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="info-card">
        <h4>Members</h4>

        {members.length === 0 ? (
          <p>No members found</p>
        ) : (
          members.map((member) => {
            const memberId = member._id || member.id;
            const isSelf = memberId === user?.id;
            const lowerRole = member.role < user?.role;

            return (
              <div key={memberId} className="info-user">
                <div>
                  <strong>{member.username}</strong>
                  <span>{getRoleName(member.role)}</span>
                </div>

                {canModerate && !isSelf && (
                  <div className="moderation-actions">
                    {lowerRole && (
                      <>
                        <button
                          className="mini-action danger-action"
                          onClick={() => handleModerationAction("kick", member.username)}
                        >
                          Kick
                        </button>

                        <button
                          className="mini-action"
                          onClick={() => handleModerationAction("mute", member.username)}
                        >
                          Mute
                        </button>

                        <button
                          className="mini-action"
                          onClick={() => handleModerationAction("unmute", member.username)}
                        >
                          Unmute
                        </button>

                        <button
                          className="mini-action danger-action"
                          onClick={() => handleModerationAction("ban", member.username)}
                        >
                          Ban
                        </button>

                        <button
                          className="mini-action"
                          onClick={() => handleModerationAction("unban", member.username)}
                        >
                          Unban
                        </button>
                      </>
                    )}

                    <button
                      className="mini-action danger-action"
                      onClick={() => removeMember(memberId)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="info-card">
        <h4>Online Users</h4>

        {onlineUsers.length === 0 ? (
          <p>No users online</p>
        ) : (
          onlineUsers.map((u) => (
            <div key={u.userId} className="info-user">
              <span className={`presence-dot ${u.status || "online"}`}></span>
              <strong>{u.username}</strong>
              <span className="workspace-subtext" style={{ marginLeft: "4px" }}>
                {u.status === "away" ? "(away)" : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default InfoPanel;
