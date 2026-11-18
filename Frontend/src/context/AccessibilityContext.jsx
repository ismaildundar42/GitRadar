import React, { createContext, useContext, useState, useEffect } from 'react';

const defaultA11y = {
  fontSize: 'normal', // 'normal' | 'large' | 'xlarge'
  highContrast: false,
  highlightLinks: false,
  readableFont: false,
  reduceMotion: false,
};

const AccessibilityContext = createContext(null);

export function AccessibilityProvider({ children }) {
  const [a11y, setA11y] = useState(() => {
    try {
      const saved = localStorage.getItem('gitradar_a11y');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultA11y, ...parsed };
      }
    } catch {
      // Fallback to defaults if parsing fails
    }
    return defaultA11y;
  });

  useEffect(() => {
    const root = document.documentElement;

    // Font Size
    root.classList.remove('a11y-font-lg', 'a11y-font-xl');
    if (a11y.fontSize === 'large') {
      root.classList.add('a11y-font-lg');
    } else if (a11y.fontSize === 'xlarge') {
      root.classList.add('a11y-font-xl');
    }

    // High Contrast
    if (a11y.highContrast) {
      root.classList.add('a11y-high-contrast');
    } else {
      root.classList.remove('a11y-high-contrast');
    }

    // Highlight Links
    if (a11y.highlightLinks) {
      root.classList.add('a11y-highlight-links');
    } else {
      root.classList.remove('a11y-highlight-links');
    }

    // Readable Font
    if (a11y.readableFont) {
      root.classList.add('a11y-readable-font');
    } else {
      root.classList.remove('a11y-readable-font');
    }

    // Reduce Motion
    if (a11y.reduceMotion) {
      root.classList.add('a11y-reduce-motion');
    } else {
      root.classList.remove('a11y-reduce-motion');
    }

    try {
      localStorage.setItem('gitradar_a11y', JSON.stringify(a11y));
    } catch {
      // Ignore write errors in restricted environments
    }
  }, [a11y]);

  const setFontSize = (size) => {
    setA11y((prev) => ({ ...prev, fontSize: size }));
  };

  const toggleHighContrast = () => {
    setA11y((prev) => ({ ...prev, highContrast: !prev.highContrast }));
  };

  const toggleHighlightLinks = () => {
    setA11y((prev) => ({ ...prev, highlightLinks: !prev.highlightLinks }));
  };

  const toggleReadableFont = () => {
    setA11y((prev) => ({ ...prev, readableFont: !prev.readableFont }));
  };

  const toggleReduceMotion = () => {
    setA11y((prev) => ({ ...prev, reduceMotion: !prev.reduceMotion }));
  };

  const resetA11y = () => {
    setA11y(defaultA11y);
  };

  return (
    <AccessibilityContext.Provider
      value={{
        ...a11y,
        setFontSize,
        toggleHighContrast,
        toggleHighlightLinks,
        toggleReadableFont,
        toggleReduceMotion,
        resetA11y,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}

