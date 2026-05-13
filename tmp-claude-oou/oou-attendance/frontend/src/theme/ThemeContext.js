import React, { createContext, useContext, useEffect, useMemo } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    document.documentElement.classList.add('theme-dark');
  }, []);

  const value = useMemo(
    () => ({
      theme: 'dark',
      isDark: true,
      toggleTheme: () => {},
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
