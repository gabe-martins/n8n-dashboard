import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '../../services/api';
import './Users.css';

const EMPTY_FORM = { id: null, name: '', login: '', password: '', tag: '', activated: true };

function Users({ currentUser, onBack }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState({});
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const markBusy = (id, isBusy) => {
    setBusyIds((prev) => ({ ...prev, [id]: isBusy }));
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await requestJson('/api/users');
      setUsers(Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      setError(err?.message || 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openCreateForm = () => {
    setFormMode('create');
    setFormData(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (user) => {
    setFormMode('edit');
    setFormData({
      id: user.id,
      name: user.name,
      login: user.login,
      password: '',
      tag: user.tag || '',
      activated: user.activated,
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormData(EMPTY_FORM);
    setFormError('');
  };

  const handleFieldChange = (field) => (e) => {
    const value = field === 'activated' ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    try {
      if (formMode === 'create') {
        await requestJson('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: formData.name,
            login: formData.login,
            password: formData.password,
            tag: formData.tag,
            activated: formData.activated,
          }),
        });
        setSuccessMsg('Usuário criado com sucesso.');
      } else {
        await requestJson(`/api/users/${formData.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formData.name,
            tag: formData.tag,
            activated: formData.activated,
          }),
        });

        if (formData.password) {
          await requestJson(`/api/users/${formData.id}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password: formData.password }),
          });
        }
        setSuccessMsg('Usuário atualizado com sucesso.');
      }

      closeForm();
      await loadUsers();
    } catch (err) {
      setFormError(err?.message || 'Falha ao salvar usuário.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleActivated = async (user) => {
    markBusy(user.id, true);
    setError('');
    try {
      await requestJson(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activated: !user.activated }),
      });
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Falha ao atualizar usuário.');
    } finally {
      markBusy(user.id, false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Excluir o usuário "${user.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    markBusy(user.id, true);
    setError('');
    try {
      await requestJson(`/api/users/${user.id}`, { method: 'DELETE' });
      setSuccessMsg('Usuário excluído com sucesso.');
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Falha ao excluir usuário.');
    } finally {
      markBusy(user.id, false);
    }
  };

  return (
    <div className="app">
      <div className="app-shell">
        <header className="executions-header">
          <div className="executions-header-top">
            <button className="btn ghost" onClick={onBack}>
              ← Voltar
            </button>
            <button className="btn ghost" onClick={loadUsers} disabled={loading}>
              {loading ? 'Carregando...' : 'Atualizar'}
            </button>
          </div>
          <div className="executions-title-row">
            <div>
              <p className="eyebrow">Administração</p>
              <h1>Gerenciar usuários</h1>
              <p className="subtitle">
                Controle quem pode acessar o dashboard, defina permissões e ative ou
                desative contas.
              </p>
            </div>
            <button className="btn primary" onClick={openCreateForm}>
              Novo usuário
            </button>
          </div>
        </header>

        {error && <div className="banner error">{error}</div>}
        {successMsg && !error && <div className="banner success">{successMsg}</div>}

        {formOpen && (
          <section className="user-form-card">
            <h2 className="section-title">
              {formMode === 'create' ? 'Novo usuário' : `Editar usuário: ${formData.name}`}
            </h2>
            {formError && <div className="banner error">{formError}</div>}
            <form onSubmit={handleFormSubmit} className="user-form">
              <div className="form-group">
                <label htmlFor="user-name">Nome</label>
                <input
                  id="user-name"
                  type="text"
                  value={formData.name}
                  onChange={handleFieldChange('name')}
                  required
                  disabled={formSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-login">Email</label>
                <input
                  id="user-login"
                  type="email"
                  value={formData.login}
                  onChange={handleFieldChange('login')}
                  required
                  disabled={formSubmitting || formMode === 'edit'}
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-password">
                  {formMode === 'create' ? 'Senha' : 'Nova senha (opcional)'}
                </label>
                <input
                  id="user-password"
                  type="password"
                  value={formData.password}
                  onChange={handleFieldChange('password')}
                  placeholder={formMode === 'edit' ? 'Deixe em branco para manter a atual' : ''}
                  required={formMode === 'create'}
                  minLength={formMode === 'create' || formData.password ? 8 : undefined}
                  disabled={formSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-tag">
                  Tag <span className="field-hint">(use "admin" para acesso total)</span>
                </label>
                <input
                  id="user-tag"
                  type="text"
                  value={formData.tag}
                  onChange={handleFieldChange('tag')}
                  placeholder="ex: admin, financeiro, marketing"
                  disabled={formSubmitting}
                />
              </div>
              <div className="form-group checkbox-group">
                <label htmlFor="user-activated">
                  <input
                    id="user-activated"
                    type="checkbox"
                    checked={formData.activated}
                    onChange={handleFieldChange('activated')}
                    disabled={formSubmitting || (formMode === 'edit' && formData.id === currentUser?.id)}
                  />
                  Conta ativa
                </label>
              </div>
              <div className="user-form-actions">
                <button type="button" className="btn ghost" onClick={closeForm} disabled={formSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={formSubmitting}>
                  {formSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        )}

        {loading && users.length === 0 && (
          <div className="empty-state">Carregando usuários...</div>
        )}

        {!loading && users.length === 0 && !error && (
          <div className="empty-state">Nenhum usuário encontrado.</div>
        )}

        {users.length > 0 && (
          <div className="executions-table-wrapper">
            <table className="executions-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Tag</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isBusy = Boolean(busyIds[user.id]);
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        {user.name}
                        {isSelf && <span className="user-tag"> (você)</span>}
                      </td>
                      <td>{user.login}</td>
                      <td>{user.tag || '—'}</td>
                      <td>
                        <span className={`pill ${user.activated ? 'pill-active' : 'pill-inactive'}`}>
                          {user.activated ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <div className="user-actions">
                          <button className="btn ghost" onClick={() => openEditForm(user)} disabled={isBusy}>
                            Editar
                          </button>
                          <button
                            className="btn ghost"
                            onClick={() => handleToggleActivated(user)}
                            disabled={isBusy || isSelf}
                          >
                            {isBusy ? 'Aguarde...' : user.activated ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            className="btn ghost danger"
                            onClick={() => handleDelete(user)}
                            disabled={isBusy || isSelf}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Users;
