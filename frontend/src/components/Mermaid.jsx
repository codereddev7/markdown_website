import React, { useEffect, useRef, useContext } from 'react';
import mermaid from 'mermaid';
import { ThemeContext } from '../context/ThemeContext';

const Mermaid = ({ chart }) => {
  const containerRef = useRef(null);
  const { activeTheme } = useContext(ThemeContext);

  useEffect(() => {
    if (containerRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: activeTheme === 'light' ? 'default' : 'dark',
      });
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      try {
        mermaid.render(id, chart).then((result) => {
          if (containerRef.current) {
             containerRef.current.innerHTML = result.svg;
          }
        }).catch(err => {
           console.error(err);
           if (containerRef.current) {
              containerRef.current.innerHTML = `<div style="color: red;">Error rendering Mermaid diagram</div>`;
           }
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [chart, activeTheme]);

  return <div className="mermaid-container" ref={containerRef} style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }} />;
};

export default Mermaid;
