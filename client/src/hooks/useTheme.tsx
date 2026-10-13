import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

type Mode = 'light' | 'dark';

/**
 * The full multi-palette theme system was reduced to a single Forest
 * palette. The `palette` value remains in the context only so consumers
 * that read it don't break — they always see 'forest'.
 *
 * The base CSS lives in index.css under `:root` and `.dark`; no
 * `[data-theme=...]` overrides are needed.
 */
export type ThemePalette = 'forest';
const ACTIVE_PALETTE: ThemePalette = 'forest';

interface ThemeContextType {
  /** Light/dark mode. */
  theme: Mode;
  /** Toggle between light and dark. */
  toggleTheme: () => void;
  /** Always 'forest'. Kept for API compatibility with components that read it. */
  palette: ThemePalette;
}

const MODE_STORAGE_KEY = 'theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  palette: ACTIVE_PALETTE,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Mode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(MODE_STORAGE_KEY) as Mode) || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(MODE_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, palette: ACTIVE_PALETTE }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
