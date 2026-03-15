import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { useAuth } from "../context/AuthContext";
import { formatMessageTime } from "../utils/time";


function DirectMessages() {
  const { userId } = useParams();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [chatUser, setChatUser] = useState(null);
  const [error, setError] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/direct-messages/${userId}`);
      setMessages(res.data.messages || []);
      setChatUser(res.data.user || null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load messages");
    }
  };

  useEffect(() => {
    fetchMessages();

    const socket = getSocket();
    if (!socket) return;

    const handleNewDm = (message) => {
      const senderId =
        typeof message.sender === "string" ? message.sender : message.sender?._id;
      const recipientId =
        typeof message.recipient === "string"
          ? message.recipient
          : message.recipient?._id;

      if (
        (senderId === userId && recipientId === user?.id) ||
        (senderId === user?.id && recipientId === userId)
      ) {
        setMessages((prev) => [...prev, message]);
      }
    };

    socket.on("dm:new", handleNewDm);

    return () => {
      socket.off("dm:new", handleNewDm);
    };
  }, [userId, user?.id]);

  const sendDm = () => {
    const socket = getSocket();
    if (!socket || !text.trim()) return;

    socket.emit("dm:send", {
      recipientId: userId,
      content: text,
    });

    setText("");
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
      const res = await api.patch(`/direct-message-actions/${editingMessageId}`, {
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
      alert(err.response?.data?.message || "Failed to edit direct message");
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      const res = await api.delete(`/direct-message-actions/${messageId}`);

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? res.data.deletedMessage : msg
        )
      );
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete direct message");
    }
  };

  return (
    <div className="container">
      <div className="card chat-card">
        <h2>Direct Messages {chatUser ? `- ${chatUser.username}` : ""}</h2>

        {error && <p className="error-text">{error}</p>}

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
    {msg.sender?.username || "User"}
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

        <div className="chat-input-row">
          <input
            type="text"
            value={text}
            placeholder="Type direct message"
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn primary" onClick={sendDm}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default DirectMessages;
