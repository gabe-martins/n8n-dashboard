import './App.css';
import 'react-toastify/dist/ReactToastify.css';
// Eagerly import every page's CSS (even though the *components* below are
// lazy-loaded). Several pages reuse classes defined in another page's CSS
// file (e.g. Monitoring's and Users' history/user tables reuse
// `.executions-table`/`.banner`/`.pill` from Executions.css/Dashboard.css).
// If CSS were left to code-split alongside each JS chunk, opening
// Monitoring or Users before ever opening Executions would leave those
// shared table styles unloaded, rendering an unstyled table. Importing the
// CSS here keeps it all in the main bundle (small, ~a few KB total) while
// the JS chunks themselves still load lazily.
import './pages/Dashboard/Dashboard.css';
import './pages/Executions/Executions.css';
import './pages/Monitoring/Monitoring.css';
import './pages/Users/Users.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import { backendUrl } from './services/api';
import Login from './pages/Login';
import ThemeToggle from './components/ThemeToggle';

// Lazy-loaded: these screens aren't needed until after login, so splitting
// them into separate JS chunks keeps the initial bundle (login screen)
// smaller. Their CSS is imported eagerly above (see comment there).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Executions = lazy(() => import('./pages/Executions'));
const Monitoring = lazy(() => import('./pages/Monitoring'));
const Users = lazy(() => import('./pages/Users'));

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  // Check existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      verifyToken(token);
    } else {
      setAuthLoading(false);
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      const response = await fetch(`${backendUrl}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        localStorage.removeItem('token');
      }
    } catch (err) {
      localStorage.removeItem('token');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (login, password) => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login, password }),
      });

      const rawBody = await response.text();
      let data = null;
      if (rawBody) {
        try {
          data = JSON.parse(rawBody);
        } catch (parseError) {
          data = null;
        }
      }

      if (!response.ok) {
        throw new Error(data?.message || rawBody || 'Falha no login');
      }

      if (!data?.token || !data?.user) {
        throw new Error('Resposta do servidor invalida no login');
      }

      localStorage.setItem('token', data.token);
      setUser(data.user);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setSelectedWorkflow(null);
    setShowMonitoring(false);
    setShowUsers(false);
  };

  // Show loading while checking auth
  let content;
  if (authLoading) {
    content = (
      <div className="app">
        <div className="loading-screen">
          <p>Carregando...</p>
        </div>
      </div>
    );
  } else if (!user) {
    // Show login if not authenticated
    content = <Login onLogin={handleLogin} error={authError} loading={authLoading} />;
  } else if (selectedWorkflow) {
    // Show executions if a workflow is selected
    content = (
      <Executions
        workflow={selectedWorkflow}
        onBack={() => setSelectedWorkflow(null)}
      />
    );
  } else if (showMonitoring) {
    // Admin-only monitoring screen (access is also enforced server-side).
    content = <Monitoring onBack={() => setShowMonitoring(false)} />;
  } else if (showUsers) {
    // Admin-only user management screen (access is also enforced server-side).
    content = <Users currentUser={user} onBack={() => setShowUsers(false)} />;
  } else {
    // Show dashboard for authenticated users
    content = (
      <Dashboard
        user={user}
        onLogout={handleLogout}
        onSelectWorkflow={setSelectedWorkflow}
        onOpenMonitoring={() => setShowMonitoring(true)}
        onOpenUsers={() => setShowUsers(true)}
      />
    );
  }

  return (
    <>
      <ThemeToggle />
      <Suspense
        fallback={
          <div className="app">
            <div className="loading-screen" role="status" aria-live="polite">
              <p>Carregando...</p>
            </div>
          </div>
        }
      >
        {content}
      </Suspense>
      <ToastContainer
        position="top-right"
        autoClose={4000}
        newestOnTop
        theme="colored"
      />
    </>
  );
}

export default App;
