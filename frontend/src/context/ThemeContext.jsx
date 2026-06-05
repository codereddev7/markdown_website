import React, { createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Try to load theme from local storage, default to 'system'
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('themeMode') || 'system';
  });

  const [activeTheme, setActiveTheme] = useState('dark');

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let resolvedTheme = themeMode;
      if (themeMode === 'system') {
        resolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      }
      setActiveTheme(resolvedTheme);

      root.setAttribute('data-theme', resolvedTheme);
      localStorage.setItem('themeMode', themeMode);

      // 🔥 YAHAN PAR HUMNE TOP BAR KA COLOR CHANGE KARNE KA LOGIC DAAL DIYA HAI
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        if (resolvedTheme === 'dark') {
          metaThemeColor.setAttribute('content', '#121212'); // Dark mode me ye color hoga
        } else {
          metaThemeColor.setAttribute('content', '#ffffff'); // Light mode me white ho jayega
        }
      }
    };

    applyTheme();

    // Listen for system theme changes if in system mode
    const listener = () => {
      if (themeMode === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themeMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, activeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};