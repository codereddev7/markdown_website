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
import * as mammoth from 'mammoth';
import { renderAsync } from 'docx-preview';

const base64ToArrayBuffer = (base64) => {
  const base64String = base64.split(',')[1] || base64;
  const binaryString = window.atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const DocxPreviewer = ({ buffer }) => {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (containerRef.current && buffer) {
      containerRef.current.innerHTML = '';
      console.log("Rendering docx with buffer:", buffer, "type:", typeof buffer, "constructor:", buffer?.constructor?.name);
      renderAsync(new Blob([buffer]), containerRef.current, null, {
        className: "docx-render",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        experimental: true,
        useImgCc: false,
      }).catch(err => {
        console.error("Error rendering docx:", err);
        containerRef.current.innerHTML = `<p style="color: red; padding: 20px;">Failed to render docx file: ${err.message || err.toString()}</p>`;
      });
    }
  }, [buffer]);

  if (!buffer) {
    return <p style={{ padding: '20px' }}>Loading document preview...</p>;
  }

  return (
    <div 
      style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '20px', 
        display: 'flex', 
        justifyContent: 'center', 
        backgroundColor: 'var(--bg-secondary, #f3f4f6)',
        width: '100%',
        height: '100%'
      }}
    >
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          maxWidth: '850px',
          backgroundColor: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: '8px'
        }} 
      />
    </div>
  );
};

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
  const [docxBuffer, setDocxBuffer] = useState(null);

  useEffect(() => {
    let prevMobile = window.innerWidth <= 768;
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Only change sidebar open state if we actually crossed the mobile boundary
      if (mobile !== prevMobile) {
        setIsSidebarOpen(!mobile);
        prevMobile = mobile;
      }
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
        setDocxBuffer(null);
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

  const getFileExtension = (file) => {
    if (!file) return '';
    if (file.extension) return file.extension.toLowerCase();

    // Fallback: extract from name
    const nameParts = file.name.split('.');
    if (nameParts.length > 1) {
      return nameParts.pop().toLowerCase();
    }

    // Fallback: extract from cloudinaryUrl
    if (file.cloudinaryUrl) {
      const urlParts = file.cloudinaryUrl.split('?')[0].split('.');
      if (urlParts.length > 1) {
        return urlParts.pop().toLowerCase();
      }
    }

    return '';
  };

  const handleSelectFile = async (file) => {
    setSelectedFile(file);
    setIsEditing(false);
    setIsAiOpen(false); // Close AI panel when switching files
    setDocxBuffer(null); // Reset docx buffer

    if (isMobile) {
      setIsSidebarOpen(false);
    }

    if (!file) {
      setFileContent('');
      return;
    }

    const ext = getFileExtension(file);
    const isText = ['md', 'txt', 'xml', 'html', 'css', 'js', 'json', 'yaml', 'yml', 'ini', 'csv'].includes(ext);
    const isDocx = ext === 'docx' || ext === 'doc';

    if (!isText && !isDocx) {
      setFileContent(file.content || '');
      return;
    }

    if (isDocx) {
      try {
        setContentLoading(true);
        let arrayBuffer = null;
        if (file.cloudinaryUrl && !file.cloudinaryUrl.startsWith('https://mock.url')) {
          const res = await api.get(`/items/${file._id}/view`, {
            responseType: 'arraybuffer'
          });
          arrayBuffer = res.data;
        } else if (file.content) {
          arrayBuffer = base64ToArrayBuffer(file.content);
        }
        setDocxBuffer(arrayBuffer);
      } catch (error) {
        console.error("Failed to load docx buffer:", error);
        setDocxBuffer(null);
      } finally {
        setContentLoading(false);
      }
      return;
    }

    if (file.cloudinaryUrl && !file.cloudinaryUrl.startsWith('https://mock.url')) {
      try {
        setContentLoading(true);
        const res = await api.get(`/items/${file._id}/view`);
        setFileContent(res.data);
      } catch (error) {
        console.error("Failed to fetch file content:", error);
        setFileContent('Error loading file content.');
      } finally {
        setContentLoading(false);
      }
    } else if (file.content !== undefined && file.content !== null) {
      setFileContent(file.content);
    } else {
      setFileContent('');
    }
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    const downloadUrl = `${api.defaults.baseURL}/items/${selectedFile._id}/view?download=true`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const renderNonMdPreview = (ext) => {
    const fileUrl = `${api.defaults.baseURL}/items/${selectedFile._id}/view`;
    const isMockOrLocal = !selectedFile.cloudinaryUrl || selectedFile.cloudinaryUrl.startsWith('https://mock.url');

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <img
            src={fileUrl}
            alt={selectedFile.name}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          />
        </div>
      );
    }

    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <video
            src={fileUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          />
        </div>
      );
    }

    if (['mp3', 'wav'].includes(ext)) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <audio src={fileUrl} controls style={{ width: '100%', maxWidth: '500px' }} />
        </div>
      );
    }

    if (['txt', 'xml', 'html', 'css', 'js', 'json', 'yaml', 'yml', 'ini', 'csv'].includes(ext)) {
      return (
        <div style={{ padding: '20px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', backgroundColor: 'var(--bg-code, #1e1e1e)', color: 'var(--text-code, #d4d4d4)', borderRadius: '8px', overflowX: 'auto', flex: 1 }}>
          <code>{fileContent || 'Empty File'}</code>
        </div>
      );
    }

    if (ext === 'pdf') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
          <iframe
            src={fileUrl}
            title={selectedFile.name}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
          />
        </div>
      );
    }

    if (ext === 'docx' || ext === 'doc') {
      return <DocxPreviewer buffer={docxBuffer} />;
    }

    if (['xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
      if (isMockOrLocal) {
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>Preview not available for offline office documents ({ext ? `.${ext}` : 'unknown'}).</p>
            <button className="btn" onClick={handleDownload}>Download File</button>
          </div>
        );
      }
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
          <iframe
            src={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(selectedFile.cloudinaryUrl)}`}
            title={selectedFile.name}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
          />
        </div>
      );
    }

    // Default Fallback
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '20px' }}>
        <p style={{ color: 'var(--text-muted)' }}>Preview not available for this file type ({ext ? `.${ext}` : 'unknown'}).</p>
        <button className="btn" onClick={handleDownload}>Download File</button>
      </div>
    );
  };

  const selectedFileExt = selectedFile ? getFileExtension(selectedFile) : '';
  const isSelectedFileMd = selectedFileExt === 'md';

  return (
    <div className="app-container">
      <Sidebar
        items={items}
        fetchItems={fetchItems}
        onSelectFile={handleSelectFile}
        selectedFileId={selectedFile?._id}
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
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
              fileName={selectedFile.name.replace(/\.[^/.]+$/, '')}
              saveLoading={saveLoading}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="global-header main">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <button className="menu-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                    <FaBars />
                  </button>
                  <h2>{selectedFile.name.replace(/\.[^/.]+$/, '')}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button className="btn-secondary" onClick={handleDownload} title="Download File">
                    <FaDownload style={{ marginRight: isMobile ? '0' : '6px' }} />
                    {!isMobile && 'Download'}
                  </button>
                  {isSelectedFileMd && (
                    <>
                      <button className={`btn-secondary ${isAiOpen ? 'active' : ''}`} onClick={() => setIsAiOpen(!isAiOpen)} title="AI Copilot">
                        <FaRobot style={{ marginRight: isMobile ? '0' : '6px' }} />
                        {!isMobile && 'AI Copilot'}
                      </button>
                      {isAuthenticated && (
                        <button className="btn" onClick={() => setIsEditing(true)}>Edit</button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="markdown-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {contentLoading ? (
                  <div className="preview-loading-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '15px', color: 'var(--text-muted)' }}>
                    <div className="premium-spinner"></div>
                    <p>Loading file content...</p>
                  </div>
                ) : !isSelectedFileMd ? (
                  renderNonMdPreview(selectedFileExt)
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      code(props) {
                        const { children, className, node, ...rest } = props;
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
