import { useState, useEffect, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FaTimes, FaPaperPlane, FaRobot, FaChevronDown, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import api from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

const AiPanel = ({ selectedFile, fileContent, onClose }) => {
  const { isAuthenticated } = useContext(AuthContext);
  const [activeChat, setActiveChat] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const messagesEndRef = useRef(null);

  // Fetch all chat sessions for the current file
  const loadChats = async () => {
    if (!selectedFile?._id) return;
    try {
      setLoading(true);
      const res = await api.get(`/chats/item/${selectedFile._id}`);
      let sessions = res.data;

      // If no sessions, create one using default endpoint
      if (sessions.length === 0) {
        const createRes = await api.get(`/chats/${selectedFile._id}`);
        sessions = [createRes.data];
      }

      setChatSessions(sessions);

      // Default to the first (most recent) active session
      const currentActive = sessions[0];
      setActiveChat(currentActive);
      setMessages(currentActive.messages || []);
    } catch (err) {
      console.error("Failed to load chats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
    setIsDropdownOpen(false);
    setEditingSessionId(null);
  }, [selectedFile?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSelectChat = (session) => {
    setActiveChat(session);
    setMessages(session.messages || []);
    setIsDropdownOpen(false);
  };

  const handleCreateNewChat = async () => {
    try {
      setLoading(true);
      const title = `Chat ${chatSessions.length + 1}`;
      const res = await api.post('/chats', { itemId: selectedFile._id, title });
      const newSession = res.data;
      setChatSessions(prev => [newSession, ...prev]);
      setActiveChat(newSession);
      setMessages([]);
      setIsDropdownOpen(false);
    } catch (err) {
      console.error("Failed to create new chat session", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChat = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this chat session?')) return;
    try {
      setLoading(true);
      await api.delete(`/chats/session/${sessionId}`);

      const updatedSessions = chatSessions.filter(s => s._id !== sessionId);
      setChatSessions(updatedSessions);

      if (activeChat?._id === sessionId) {
        if (updatedSessions.length > 0) {
          const nextActive = updatedSessions[0];
          setActiveChat(nextActive);
          setMessages(nextActive.messages || []);
        } else {
          // If no sessions remain, trigger re-load to recreate a default session
          await loadChats();
        }
      }
    } catch (err) {
      console.error("Failed to delete chat session", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameStart = (session) => {
    setEditingSessionId(session._id);
    setRenameValue(session.title);
  };

  const handleRenameSave = async (sessionId) => {
    if (!renameValue.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      const res = await api.put(`/chats/session/${sessionId}`, { title: renameValue.trim() });
      const updatedSession = res.data;

      setChatSessions(prev => prev.map(s => s._id === sessionId ? updatedSession : s));

      if (activeChat?._id === sessionId) {
        setActiveChat(updatedSession);
      }
      setEditingSessionId(null);
    } catch (err) {
      console.error("Failed to rename chat session", err);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeChat?._id || loading) return;

    const promptText = input.trim();
    setInput('');
    setLoading(true);

    // Optimistically add user message to UI
    setMessages(prev => [...prev, { role: 'user', content: promptText, timestamp: new Date() }]);

    try {
      const res = await api.post(`/chats/session/${activeChat._id}/messages`, {
        content: promptText,
        fileContent: fileContent,
      });
      setMessages(res.data.messages || []);
      setActiveChat(res.data);
      // Also update the session list
      setChatSessions(prev => prev.map(s => s._id === activeChat._id ? res.data : s));
    } catch (err) {
      console.error("Failed to send message", err);
      // Extract server-provided error message for a user-friendly display
      const serverMsg = err.response?.data?.message || 'Failed to get a response. Please try again.';
      setMessages(prev => [...prev, {
        role: 'model',
        content: `⚠️ ${serverMsg}`,
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-panel">
      {/* Panel Header */}
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <FaRobot className="ai-logo-icon" />
          {!isMobile && <span className="ai-title-text">AI Copilot</span>}
          {!isMobile && <span className="ai-header-divider">/</span>}
          <span className="ai-file-context" title={selectedFile.name}>
            {selectedFile.name.replace(/\.md$/i, '')}
          </span>
        </div>

        {/* Chat Session Selector Dropdown */}
        <div className="ai-header-selector" style={{ position: 'relative' }}>
          <button
            type="button"
            className="ai-chat-select-btn"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span className="ai-current-chat-title">{activeChat?.title || 'Select Chat'}</span>
            <FaChevronDown className={`ai-arrow ${isDropdownOpen ? 'open' : ''}`} />
          </button>
 
          {isDropdownOpen && (
            <div className="ai-dropdown-menu">
              <div className="ai-dropdown-header">
                <span>Chat History</span>
                <button
                  type="button"
                  className="ai-new-chat-btn"
                  onClick={handleCreateNewChat}
                >
                  <FaPlus /> New
                </button>
              </div>
              <div className="ai-dropdown-list">
                {chatSessions.map((session) => (
                  <div
                    key={session._id}
                    className={`ai-dropdown-item ${activeChat?._id === session._id ? 'active' : ''}`}
                    onClick={() => handleSelectChat(session)}
                  >
                    {editingSessionId === session._id ? (
                      <input
                        type="text"
                        className="ai-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameSave(session._id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSave(session._id);
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="ai-chat-item-title">{session.title}</span>
                    )}
 
                    <div className="ai-chat-item-actions" onClick={(e) => e.stopPropagation()}>
                      {editingSessionId !== session._id && (
                        <button
                          type="button"
                          className="ai-item-action-btn"
                          onClick={() => handleRenameStart(session)}
                          title="Rename Chat"
                        >
                          <FaEdit />
                        </button>
                      )}
                      {isAuthenticated && (
                        <button
                          type="button"
                          className="ai-item-action-btn delete"
                          onClick={() => handleDeleteChat(session._id)}
                          title="Delete Chat"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="ai-close-btn"
          onClick={onClose}
          title="Close AI Copilot"
          style={{ padding: isMobile ? '6px 10px' : '8px 12px' }}
        >
          <FaTimes style={{ marginRight: isMobile ? '0' : '6px' }} /> {!isMobile && 'Close'}
        </button>
      </div>

      {/* Message History area */}
      <div className="ai-messages-container">
        {loading && messages.length === 0 ? (
          <div className="preview-loading-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '15px', color: 'var(--text-muted)' }}>
            <div className="premium-spinner"></div>
            <p>Loading chats...</p>
          </div>
        ) : messages.length === 0 && !loading ? (
          <div className="ai-welcome-state">
            <FaRobot className="ai-welcome-icon" />
            <h4>Chat with your document</h4>
            <p>Ask questions, request summaries, or explain concepts related to <strong>{selectedFile.name.replace(/\.md$/i, '')}</strong>.</p>
          </div>
        ) : (
          <div className="ai-messages-list">
            {messages.map((msg, index) => (
              <div key={msg._id || index} className={`ai-message-wrapper ${msg.role}`}>
                <div className={`ai-message ${msg.role}`}>
                  {msg.role === 'user' ? (
                    <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                  ) : (
                    <div className="markdown-body chat-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                <span className="ai-message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div className="ai-message-wrapper model">
                <div className="ai-message model loading">
                  <div className="ai-typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Centered Input Form Container */}
      <div className="ai-input-container">
        <form className="ai-input-form" onSubmit={handleSend}>
          <input
            type="text"
            className="ai-chat-input"
            placeholder="Ask AI about this file..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="ai-send-btn"
            disabled={!input.trim() || loading}
            title="Send message"
          >
            <FaPaperPlane />
          </button>
        </form>
      </div>
    </div>
  );
};

export default AiPanel;
