import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaBars, FaRobot, FaDownload } from 'react-icons/fa';
import Sidebar from './Sidebar';
import Editor from './Editor';
import AiPanel from './AiPanel';
import api from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import Mermaid from './Mermaid';

const MainView = () => {
  const { isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [items, setItems] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [contentLoading, setContentLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Close sidebar by default on resize to mobile, open on desktop
      setIsSidebarOpen(!mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedFile && !isEditing) {
        setSelectedFile(null);
        setFileContent('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, isEditing]);

  const fetchItems = async () => {
    try {
      const res = await api.get('/items');
      setItems(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectFile = async (file) => {
    setSelectedFile(file);
    setIsEditing(false);
    setIsAiOpen(false); // Close AI panel when switching files
    
    if (isMobile) {
      setIsSidebarOpen(false);
    }
    
    if (file && file.cloudinaryUrl && !file.cloudinaryUrl.startsWith('https://mock.url')) {
      try {
        setContentLoading(true);
        const res = await fetch(file.cloudinaryUrl);
        const text = await res.text();
        setFileContent(text);
      } catch (error) {
        console.error("Failed to fetch markdown content:", error);
        setFileContent('# Error loading file');
      } finally {
        setContentLoading(false);
      }
    } else if (file && file.content !== undefined && file.content !== null) {
      setFileContent(file.content);
    } else {
      setFileContent('# Empty File');
    }
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    const blob = new Blob([fileContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', selectedFile.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSave = async (newContent) => {
    if (!selectedFile) return;
    try {
      setSaveLoading(true);
      await api.put(`/items/${selectedFile._id}`, { content: newContent });
      setFileContent(newContent);
      setIsEditing(false);
      fetchItems(); // Refresh to get new cloudinary url if needed
    } catch (err) {
      console.error(err);
      alert('Failed to save file');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        items={items} 
        fetchItems={fetchItems} 
        onSelectFile={handleSelectFile}
        selectedFileId={selectedFile?._id}
        isOpen={isSidebarOpen}
      />
      {isMobile && isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}
      <div className="main-content">
        {selectedFile ? (
          isAiOpen ? (
            <AiPanel 
              selectedFile={selectedFile} 
              fileContent={fileContent} 
              onClose={() => setIsAiOpen(false)} 
            />
          ) : isAuthenticated && isEditing ? (
            <Editor 
              initialContent={fileContent} 
              onSave={handleSave} 
              onCancel={() => setIsEditing(false)} 
              toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              fileName={selectedFile.name.replace(/\.md$/i, '')}
              saveLoading={saveLoading}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="global-header main">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <button className="menu-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                    <FaBars />
                  </button>
                  <h2>{selectedFile.name.replace(/\.md$/i, '')}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button className="btn-secondary" onClick={handleDownload} title="Download File">
                    <FaDownload style={{ marginRight: isMobile ? '0' : '6px' }} />
                    {!isMobile && 'Download'}
                  </button>
                  <button className={`btn-secondary ${isAiOpen ? 'active' : ''}`} onClick={() => setIsAiOpen(!isAiOpen)} title="AI Copilot">
                    <FaRobot style={{ marginRight: isMobile ? '0' : '6px' }} />
                    {!isMobile && 'AI Copilot'}
                  </button>
                  {isAuthenticated && (
                    <button className="btn" onClick={() => setIsEditing(true)}>Edit</button>
                  )}
                </div>
              </div>
              <div className="markdown-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {contentLoading ? (
                  <div className="preview-loading-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '15px', color: 'var(--text-muted)' }}>
                    <div className="premium-spinner"></div>
                    <p>Loading file content...</p>
                  </div>
                ) : (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]} 
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      code(props) {
                        const {children, className, node, ...rest} = props;
                        const match = /language-(\w+)/.exec(className || '');
                        if (match && match[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        return <code className={className} {...rest}>{children}</code>;
                      }
                    }}
                  >
                    {fileContent}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="global-header main">
              <button className="menu-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                <FaBars />
              </button>
              <h2 className="welcome-title">Welcome to Code Red Dev</h2>
              <div style={{ width: '32px' }}></div>
            </div>
            <div className="empty-state" style={{ flex: 1 }}>
              <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <h3>Select a file to view</h3>
              <p>Choose a markdown file from the sidebar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MainView;
