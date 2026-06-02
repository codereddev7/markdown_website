import React, { useState, useRef, useEffect, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import Split from 'react-split';
import { Editor as MonacoEditor } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import * as prettier from 'prettier/standalone';
import prettierPluginMarkdown from 'prettier/plugins/markdown';
import { FaBars, FaCode, FaMagic } from 'react-icons/fa';
import Mermaid from './Mermaid';

const Editor = ({ initialContent, onSave, onCancel, toggleSidebar, fileName, saveLoading }) => {
  const { activeTheme } = useContext(ThemeContext);
  const [content, setContent] = useState(initialContent);
  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [activeTab, setActiveTab] = useState('edit');
  const hasPendingChangesRef = useRef(false);
  const previewScrollTopRef = useRef(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Desktop view scroll-to-bottom on content changes
  useEffect(() => {
    if (!isMobile && previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [content, isMobile]);

  // Mobile view tab scroll preservation and scroll-to-bottom
  useEffect(() => {
    if (isMobile && previewRef.current && activeTab === 'preview') {
      const scrollTimeout = setTimeout(() => {
        if (previewRef.current) {
          if (hasPendingChangesRef.current) {
            // Scroll to bottom on changes
            previewRef.current.scrollTop = previewRef.current.scrollHeight;
            hasPendingChangesRef.current = false;
            previewScrollTopRef.current = previewRef.current.scrollTop;
          } else {
            // Restore scroll position when visiting preview with no new changes
            previewRef.current.scrollTop = previewScrollTopRef.current;
          }
        }
      }, 50);
      return () => clearTimeout(scrollTimeout);
    }
  }, [activeTab, isMobile]);

  useEffect(() => {
    const formatInitial = async () => {
      try {
        const formatted = await prettier.format(initialContent, {
          parser: 'markdown',
          plugins: [prettierPluginMarkdown],
        });
        setContent(formatted);
        hasPendingChangesRef.current = false; // Initial format shouldn't count as user changes
      } catch (e) {
        console.error("Format on load failed", e);
      }
    };
    formatInitial();
  }, [initialContent]);

  const handleEditorChange = (value) => {
    setContent(value);
    hasPendingChangesRef.current = true; // User edited content
  };

  const handleSaveAndFormat = async () => {
    let finalContent = content;
    try {
      finalContent = await prettier.format(content, {
        parser: 'markdown',
        plugins: [prettierPluginMarkdown],
      });
      setContent(finalContent);
    } catch (e) {
      console.error("Format on save failed", e);
    }
    onSave(finalContent);
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Register the Prettier formatter for markdown
    monaco.languages.registerDocumentFormattingEditProvider('markdown', {
      async provideDocumentFormattingEdits(model) {
        const text = model.getValue();
        const formatted = await prettier.format(text, {
          parser: 'markdown',
          plugins: [prettierPluginMarkdown],
        });

        return [
          {
            range: model.getFullModelRange(),
            text: formatted,
          },
        ];
      },
    });

    // Add Format command (Ctrl+Shift+F or Shift+Alt+F)
    editor.addAction({
      id: 'format-markdown',
      label: 'Format with Prettier',
      keybindings: [
        monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      ],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: function (ed) {
        ed.getAction('editor.action.formatDocument').run();
      }
    });
  };

  const handleFormat = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument').run();
      hasPendingChangesRef.current = true; // Flag formatting changes too
    }
  };

  const handlePreviewScroll = () => {
    if (previewRef.current && isMobile && activeTab === 'preview') {
      previewScrollTopRef.current = previewRef.current.scrollTop;
    }
  };

  return (
    <div className="editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
      <div className="global-header main" style={{ padding: isMobile ? '0 10px' : '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '15px', minWidth: 0, flexShrink: 1 }}>
          <button className="menu-toggle-btn" style={{ flexShrink: 0 }} onClick={toggleSidebar}>
            <FaBars />
          </button>
          <h2 style={{
            fontSize: isMobile ? '0.95rem' : '1.2rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: isMobile ? '80px' : 'none'
          }}>{fileName}</h2>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? '4px' : '10px', flexShrink: 0 }}>
          <button
            className="btn"
            style={{
              backgroundColor: '#10b981',
              borderColor: '#059669',
              padding: isMobile ? '6px 8px' : '8px 16px',
              fontSize: isMobile ? '0.85rem' : '',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={handleFormat}
            disabled={saveLoading}
          >
            {isMobile ? (
              <>
                <FaMagic style={{ fontSize: '0.8rem' }} />
                <span>Format (Alt+F)</span>
              </>
            ) : 'Format (Alt+F)'}
          </button>
          <button className="btn-secondary" style={{ padding: isMobile ? '6px 8px' : '8px 16px', fontSize: isMobile ? '0.85rem' : '' }} onClick={onCancel} disabled={saveLoading}>Cancel</button>
          <button className="btn" style={{ padding: isMobile ? '6px 8px' : '8px 16px', fontSize: isMobile ? '0.85rem' : '' }} onClick={handleSaveAndFormat} disabled={saveLoading}>{saveLoading ? 'Saving...' : (isMobile ? 'Save' : 'Save Changes')}</button>
        </div>
      </div>

      {isMobile ? (
        <div className="editor-mobile-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="editor-mobile-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <button
              className={`mobile-tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
              onClick={() => setActiveTab('edit')}
              style={{
                flex: 1,
                padding: '12px',
                background: 'none',
                border: 'none',
                color: activeTab === 'edit' ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: activeTab === 'edit' ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Edit
            </button>
            <button
              className={`mobile-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
              style={{
                flex: 1,
                padding: '12px',
                background: 'none',
                border: 'none',
                color: activeTab === 'preview' ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: activeTab === 'preview' ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Preview
            </button>
          </div>
          <div style={{ flex: 1, display: activeTab === 'edit' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}>

            {/* Editor Action Bar (Mobile Only) */}
            {/* <div className="editor-mobile-toolbar" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 12px',
              backgroundColor: 'var(--bg-hover)',
              borderBottom: '1px solid var(--border)'
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Markdown Editor</span>
              <button
                className="btn"
                style={{
                  backgroundColor: '#10b981',
                  borderColor: '#059669',
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '4px',
                  boxShadow: 'none',
                  textShadow: 'none',
                  height: '28px'
                }}
                onClick={handleFormat}
              >
                <FaMagic style={{ fontSize: '0.75rem' }} /> Format
              </button>
            </div> */}

            <div style={{ flex: 1, minHeight: 0 }}>
              <MonacoEditor
                height="100%"
                defaultLanguage="markdown"
                theme={activeTheme === 'light' ? 'light' : 'vs-dark'}
                value={content}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  padding: { top: 16 },
                  fontSize: 14,
                  formatOnType: true,
                  formatOnPaste: true,
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
          <div
            className="preview-pane markdown-body"
            ref={previewRef}
            onScroll={handlePreviewScroll}
            style={{ flex: 1, display: activeTab === 'preview' ? 'block' : 'none', padding: '15px' }}
          >
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
              {content}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <Split
          className="editor-split-view"
          sizes={[50, 50]}
          minSize={200}
          gutterSize={10}
          direction="horizontal"
        >
          <div className="editor-pane">
            <MonacoEditor
              height="100%"
              defaultLanguage="markdown"
              theme={activeTheme === 'light' ? 'light' : 'vs-dark'}
              value={content}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                padding: { top: 16 },
                fontSize: 14,
                formatOnType: true,
                formatOnPaste: true,
                automaticLayout: true,
              }}
            />
          </div>
          <div className="preview-pane markdown-body" ref={previewRef}>
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
              {content}
            </ReactMarkdown>
          </div>
        </Split>
      )}
    </div>
  );
};

export default Editor;
