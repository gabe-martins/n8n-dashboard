import useThemePreference from '../hooks/useThemePreference';
import './ThemeToggle.css';

const LABELS = {
  system: 'Automático',
  light: 'Claro',
  dark: 'Escuro',
};

const ICONS = {
  system: '🖥️',
  light: '☀️',
  dark: '🌙',
};

// Floating toggle rendered once at the top level of the app so it stays
// visible across every page (login, dashboard, executions, monitoring,
// users) without each page needing to know about theming. Clicking cycles
// system -> light -> dark -> system.
function ThemeToggle() {
  const { preference, effectiveTheme, cyclePreference } = useThemePreference();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cyclePreference}
      title={`Tema: ${LABELS[preference]} (aplicado: ${effectiveTheme === 'dark' ? 'Dark' : 'Light'})`}
      aria-label="Alternar tema"
    >
      <span className="theme-toggle-icon">{ICONS[preference]}</span>
      <span className="theme-toggle-label">{LABELS[preference]}</span>
    </button>
  );
}

export default ThemeToggle;
