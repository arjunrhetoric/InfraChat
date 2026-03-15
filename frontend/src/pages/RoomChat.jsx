import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { useAuth } from "../context/AuthContext";
import { getRoleName } from "../utils/roles";
import { formatMessageTime } from "../utils/time";


function RoomChat() {
  const { id } = useParams();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/rooms/${id}/messages`);
      setMessages(res.data.messages || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load messages");
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/rooms/${id}/members`);
      setMembers(res.data.members || []);
    } catch (err) {
      console.error("Failed to load members", err);
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchMembers();

    const socket = getSocket();
    if (!socket) return;

    socket.emit("room:join", id);

    const handleNewMessage = (message) => {
      const roomId =
        typeof message.room === "string" ? message.room : message.room?._id;

      if (roomId === id) {
        setMessages((prev) => [...prev, message]);
      }
    };

    const handleOnlineUsers = (data) => {
      if (data.roomId === id) {
        setOnlineUsers(data.users || []);
      }
    };

    const handleTyping = (data) => {
      if (!data?.username) return;

      setTypingUsers((prev) => {
        if (data.isTyping) {
          if (prev.includes(data.username)) return prev;
          return [...prev, data.username];
        }
        return prev.filter((name) => name !== data.username);
      });
    };

    socket.on("message:new", handleNewMessage);
    socket.on("room:onlineUsers", handleOnlineUsers);
    socket.on("typing:update", handleTyping);

    return () => {
      socket.emit("room:leave", id);
      socket.off("message:new", handleNewMessage);
      socket.off("room:onlineUsers", handleOnlineUsers);
      socket.off("typing:update", handleTyping);
    };
  }, [id]);

  const sendMessage = () => {
    const socket = getSocket();
    if (!socket || !text.trim()) return;

    socket.emit("message:send", {
      roomId: id,
      content: text,
    });

    socket.emit("typing:stop", { roomId: id });
    setText("");
  };

  const handleTypingChange = (e) => {
    const value = e.target.value;
    setText(value);

    const socket = getSocket();
    if (!socket) return;

    if (value.trim()) {
      socket.emit("typing:start", { roomId: id });
    } else {
      socket.emit("typing:stop", { roomId: id });
    }
  };

  const startEdit = (msg) => {
    setEditingMessageId(msg._id);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText("");
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;

    try {
      const res = await api.patch(`/rooms/messages/${editingMessageId}`, {
        content: editText,
      });

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === editingMessageId ? res.data.updatedMessage : msg
        )
      );

      setEditingMessageId(null);
      setEditText("");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to edit message");
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      const res = await api.delete(`/rooms/messages/${messageId}`);

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? res.data.deletedMessage : msg
        )
      );
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete message");
    }
  };

  return (
    <div className="container">
      {error && <p className="error-text">{error}</p>}

      <div className="chat-layout">
        <div className="card sidebar">
          <h3>Members</h3>
          {members.length === 0 ? (
            <p>No members found</p>
          ) : (
            members.map((member) => (
              <div key={member._id} className="sidebar-user">
                <strong>{member.username}</strong>
               <span>Role: {getRoleName(member.role)}</span>

              </div>
            ))
          )}

          <hr className="sidebar-divider" />

          <h3>Online Users</h3>
          {onlineUsers.length === 0 ? (
            <p>No users online</p>
          ) : (
            onlineUsers.map((u) => (
              <div key={u.userId} className="sidebar-user">
                <strong>{u.username}</strong>
              </div>
            ))
          )}
        </div>

        <div className="card chat-card">
          <h2>Room Chat</h2>

          <div className="messages-box">
            {messages.length === 0 ? (
              <p>No messages yet</p>
            ) : (
              messages.map((msg) => {
                const senderId =
                  typeof msg.sender === "string" ? msg.sender : msg.sender?._id;

                const mine = senderId === user?.id;

                const isEditing = editingMessageId === msg._id;

                return (
                  <div
                    key={msg._id}
                    className={`message-row ${mine ? "mine" : "other"}`}
                  >
                    <div className={`message-bubble ${mine ? "mine" : "other"}`}>
                      <div className="message-header">
  <span className="message-sender">
    {msg.sender?.username || "System"}
  </span>
  <span className="message-time">
    {formatMessageTime(msg.createdAt)}
  </span>
</div>


                      {isEditing ? (
                        <div className="edit-box">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                          <div className="message-actions">
                            <button className="btn primary small" onClick={saveEdit}>
                              Save
                            </button>
                            <button className="btn small" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>{msg.content}</div>
                          {msg.edited && (
                            <div className="edited-label">(edited)</div>
                          )}

                          {mine && !msg.deletedForEveryone && (
                            <div className="message-actions">
                              <button
                                className="link-btn"
                                onClick={() => startEdit(msg)}
                              >
                                Edit
                              </button>
                              <button
                                className="link-btn delete"
                                onClick={() => deleteMessage(msg._id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {typingUsers.length > 0 && (
            <p className="typing-text">{typingUsers.join(", ")} typing...</p>
          )}

          <div className="chat-input-row">
            <input
              type="text"
              value={text}
              placeholder="Type message or command like /help"
              onChange={handleTypingChange}
            />
            <button className="btn primary" onClick={sendMessage}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomChat;
