import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { formatMessageTime } from "../utils/time";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const API_BASE = "http://localhost:5000";

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function ChatPanel({
  user,
  selectedChat,
  messages,
  setMessages,
  text,
  sendMessage,
  handleTypingChange,
  typingUsers,
  pendingFiles,
  setPendingFiles,
  uploading,
  announcement,
}) {
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers, selectedChat]);

if (!selectedChat) {
  return (
    <div className="workspace-chat empty-chat">
      <div className="empty-state">
        <svg
          className="empty-state-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h2>Select a conversation</h2>
        <p>
          Choose a room or direct message from the sidebar to start collaborating.
        </p>
      </div>
    </div>
  );
}



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
      let res;

      if (selectedChat.type === "room") {
        res = await api.patch(`/rooms/messages/${editingMessageId}`, {
          content: editText,
        });
      } else {
        res = await api.patch(`/direct-message-actions/${editingMessageId}`, {
          content: editText,
        });
      }

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
      let res;

      if (selectedChat.type === "room") {
        res = await api.delete(`/rooms/messages/${messageId}`);
      } else {
        res = await api.delete(`/direct-message-actions/${messageId}`);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? res.data.deletedMessage : msg
        )
      );
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete message");
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setPendingFiles((prev) => [...prev, ...files]);
    }
    e.target.value = "";
  };

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderAttachment = (att) => {
    const isImage = IMAGE_TYPES.includes(att.type);
    const fileUrl = att.url.startsWith("http") ? att.url : `${API_BASE}${att.url}`;

    if (isImage) {
      return (
        <div key={att.url} className="attachment-image">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <img src={fileUrl} alt={att.name} />
          </a>
        </div>
      );
    }

    return (
      <div key={att.url} className="attachment-file">
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" download>
          <span className="attachment-icon">📎</span>
          <span className="attachment-name">{att.name}</span>
          {att.size && (
            <span className="attachment-size">{formatFileSize(att.size)}</span>
          )}
        </a>
      </div>
    );
  };

  const isArchived =
    selectedChat?.type === "room" && selectedChat?.data?.isArchived;
  const isBroadcast =
    selectedChat?.type === "room" && selectedChat?.data?.roomType === "broadcast";
  const canSend =
    !isArchived &&
    (!isBroadcast || (user && user.role >= 2));

  return (
    <div className="workspace-chat">
      <div className="chat-topbar">
        <h2>
          {selectedChat.type === "room" ? "# " : "@ "}
          {selectedChat.data.name || selectedChat.data.username}
          {isBroadcast && <span className="room-type-badge broadcast">Broadcast</span>}
          {isArchived && <span className="room-type-badge archived">Archived</span>}
        </h2>
        <p className="workspace-subtext">
          {selectedChat.type === "room" ? "Room conversation" : "Direct message"}
        </p>
      </div>

      {announcement?.text && selectedChat?.type === "room" && (
        <div className="announcement-banner">
          <strong>Announcement:</strong> {announcement.text}
        </div>
      )}

      <div className="workspace-messages" ref={messagesContainerRef}>
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
                      {msg.content && <div>{msg.content}</div>}

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="message-attachments">
                          {msg.attachments.map(renderAttachment)}
                        </div>
                      )}

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

        <div ref={messagesEndRef} />
      </div>

      {selectedChat.type === "room" && typingUsers.length > 0 && (
        <p className="typing-text">{typingUsers.join(", ")} typing...</p>
      )}

      {pendingFiles && pendingFiles.length > 0 && (
        <div className="pending-files">
          {pendingFiles.map((file, index) => (
            <div key={index} className="pending-file">
              <span className="pending-file-name">
                {IMAGE_TYPES.includes(file.type) ? "🖼️" : "📎"} {file.name}
              </span>
              <span className="pending-file-size">
                {formatFileSize(file.size)}
              </span>
              <button
                className="pending-file-remove"
                onClick={() => removePendingFile(index)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="workspace-input">
        {!canSend ? (
          <p className="workspace-subtext" style={{ padding: "0.5rem", margin: 0, textAlign: "center", width: "100%" }}>
            {isArchived
              ? "This room is archived and read-only."
              : "Only moderators and admins can send messages in broadcast rooms."}
          </p>
        ) : (
          <>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: "none" }}
              multiple
            />
            <button
              className="btn attachment-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              disabled={uploading}
            >
              📎
            </button>
            <input
              type="text"
              value={text}
              placeholder={
                selectedChat.type === "room"
                  ? "Type message or command like /help"
                  : "Type direct message"
              }
              onChange={(e) => handleTypingChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="btn primary"
              onClick={sendMessage}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Send"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ChatPanel;
