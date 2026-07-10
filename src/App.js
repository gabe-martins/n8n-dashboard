import './App.css';
import { useEffect, useState } from 'react';
import { backendUrl } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Executions from './pages/Executions';
import Monitoring from './pages/Monitoring';

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [showMonitoring, setShowMonitoring] = useState(false);

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
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login onLogin={handleLogin} error={authError} loading={authLoading} />;
  }

  // Show executions if a workflow is selected
  if (selectedWorkflow) {
    return (
      <Executions
        workflow={selectedWorkflow}
        onBack={() => setSelectedWorkflow(null)}
      />
    );
  }

  // Admin-only monitoring screen (access is also enforced server-side).
  if (showMonitoring) {
    return <Monitoring onBack={() => setShowMonitoring(false)} />;
  }

  // Show dashboard for authenticated users
  return (
    <Dashboard
      user={user}
      onLogout={handleLogout}
      onSelectWorkflow={setSelectedWorkflow}
      onOpenMonitoring={() => setShowMonitoring(true)}
    />
  );
}

export default App;
