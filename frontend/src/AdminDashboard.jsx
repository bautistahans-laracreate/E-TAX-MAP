import { useState, useEffect } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { apiGet, apiPost, apiDelete, apiPatch } from './api';

// ── Create User Modal ──────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [role, setRole] = useState('citizen');
  const [idNumber, setIdNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = role === 'admin'
        ? { role: 'admin', id_number: idNumber, name, email, password }
        : { role: 'citizen', name, email, password };

      const res = await apiPost('/api/auth/users/', body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create user.'); return; }
      onCreated(data.user);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={e => e.stopPropagation()}>
        <div className="ad-modal-header">
          <h3>Create New User</h3>
          <button className="ad-modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="ad-modal-body">
          <div className="ad-form-field">
            <label>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="citizen">Citizen</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {role === 'admin' && (
            <div className="ad-form-field">
              <label>ID Number</label>
              <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="Enter ID number" required />
            </div>
          )}

          <div className="ad-form-field">
            <label>Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter full name" required />
          </div>

          <div className="ad-form-field">
            <label>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter email address" required />
          </div>

          <div className="ad-form-field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required minLength={6} />
          </div>

          {error && <div className="ad-form-error">{error}</div>}

          <div className="ad-modal-footer">
            <button type="button" className="ad-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="ad-primary-btn" disabled={loading}>
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ────────────────────────────────────────────────────────

function EditUserModal({ user, onClose, onUpdated }) {
  const [role, setRole] = useState(user.role.toLowerCase());
  const [name, setName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState(''); // Optional password update
  const [isActive, setIsActive] = useState(user.is_active);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = {
        role,
        name,
        email,
        is_active: isActive
      };
      if (password) body.password = password;

      const res = await apiPatch(`/api/auth/users/${user.id}/`, body);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update user.'); return; }
      onUpdated(data.user);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={e => e.stopPropagation()}>
        <div className="ad-modal-header">
          <h3>Edit User: {user.username}</h3>
          <button className="ad-modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="ad-modal-body">
          <div className="ad-form-field">
            <label>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="citizen">Citizen</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="ad-form-field">
            <label>Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="ad-form-field">
            <label>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="ad-form-field">
            <label>New Password (Optional)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current" minLength={6} />
          </div>

          <div className="ad-form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.625rem' }}>
            <input type="checkbox" id="is_active" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <label htmlFor="is_active" style={{ marginBottom: 0 }}>Account Active</label>
          </div>

          {error && <div className="ad-form-error">{error}</div>}

          <div className="ad-modal-footer">
            <button type="button" className="ad-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="ad-primary-btn" disabled={loading}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Admin Dashboard — User Management Only ─────────────────────────────────

export default function AdminDashboard({ username, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [viewMode, setViewMode] = useState('users'); // 'users' | 'requests'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');

  const fetchUsers = () => {
    setLoadingUsers(true);
    apiGet('/api/auth/users/')
      .then(r => r.json())
      .then(data => { setUsers(data.users || []); setLoadingUsers(false); })
      .catch(() => setLoadingUsers(false));
  };

  const fetchRequests = () => {
    setLoadingRequests(true);
    apiGet('/api/auth/password-requests/')
      .then(r => r.json())
      .then(data => { setRequests(data.requests || []); setLoadingRequests(false); })
      .catch(() => setLoadingRequests(false));
  };

  useEffect(() => {
    if (viewMode === 'users') fetchUsers();
    else fetchRequests();
  }, [viewMode]);

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    const res = await apiDelete(`/api/auth/users/${userId}/`);
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleUserCreated = (newUser) => setUsers(prev => [...prev, newUser]);
  const handleUserUpdated = (updatedUser) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  const handleRespond = async (reqId, action) => {
    const message = window.prompt(`Enter message for user (${action === 'approve' ? 'Optional' : 'Required'}):`);
    if (action !== 'approve' && message === null) return;

    try {
      const res = await apiPost(`/api/auth/password-requests/${reqId}/respond/`, { action, message: message || '' });
      if (res.ok) {
        setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: action === 'approve' ? 'approved' : 'denied' } : r));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to respond.');
      }
    } catch {
      alert('Network error.');
    }
  };

  const filteredUsers = users.filter(u => {
    if (roleFilter === 'admin') return u.role === 'Admin';
    if (roleFilter === 'citizen') return u.role === 'Citizen';
    return true;
  });

  const firstColHeader = roleFilter === 'admin' ? 'ID NUMBER' : 'USERNAME';

  return (
    <div className="um-page">
      <div className="ad-section-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.875rem', alignItems: 'center' }}>
          <h2
            className="ad-section-title"
            onClick={() => setViewMode('users')}
            style={{
              cursor: 'pointer',
              fontSize: '1.6em',
              fontWeight: '800',
              color: viewMode === 'users' ? '#0f1d35' : '#94a3b8',
              borderBottom: viewMode === 'users' ? '0.1875rem solid #1e3a5f' : '0.1875rem solid transparent',
              paddingBottom: '8px',
              transition: 'all 0.2s',
              margin: 0
            }}
          >
            User Management
          </h2>
          <h2
            className="ad-section-title"
            onClick={() => setViewMode('requests')}
            style={{
              cursor: 'pointer',
              fontSize: '1.6em',
              fontWeight: '800',
              color: viewMode === 'requests' ? '#0f1d35' : '#94a3b8',
              borderBottom: viewMode === 'requests' ? '0.1875rem solid #1e3a5f' : '0.1875rem solid transparent',
              paddingBottom: '8px',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              margin: 0
            }}
          >
            Password Requests
            {requests.filter(r => r.status === 'pending').length > 0 && (
              <span style={{
                background: '#ef4444', color: '#fff', fontSize: '0.75rem',
                borderRadius: '0.75rem', padding: '0.125rem 0.5rem', fontWeight: 'bold'
              }}>
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </h2>
        </div>

        {viewMode === 'users' && (
          <button className="ad-primary-btn" onClick={() => setShowCreateModal(true)}>
            + Create New User
          </button>
        )}
      </div>
      <div className="ad-divider" />

      {viewMode === 'users' ? (
        <>
          {/* Role filter toggle */}
          <div className="ad-role-filter">
            {[
              { key: 'all', label: 'All Users' },
              { key: 'admin', label: 'Admins' },
              { key: 'citizen', label: 'Citizens' },
            ].map(f => (
              <button
                key={f.key}
                className={`ad-role-filter-btn${roleFilter === f.key ? ' active' : ''}`}
                onClick={() => setRoleFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loadingUsers ? (
            <p className="ad-placeholder">Loading users…</p>
          ) : (
            <div className="ad-table-wrapper">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>{firstColHeader}</th>
                    <th>FULL NAME</th>
                    <th>ROLE</th>
                    <th>EMAIL</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td className="ad-cell-accent">{u.username}</td>
                      <td>{u.full_name}</td>
                      <td>{u.role}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`ad-badge ${u.is_active ? 'active' : 'inactive'}`}>
                          {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td>
                        <div className="ad-row-actions">
                          <button className="ad-icon-btn" title="Edit" onClick={() => setEditingUser(u)}><Pencil size={13} /></button>
                          <button className="ad-icon-btn" title="Delete" onClick={() => handleDelete(u.id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px 0', color: '#aaa' }}>
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {loadingRequests ? (
            <p className="ad-placeholder">Loading requests…</p>
          ) : (
            <div className="ad-table-wrapper">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>USER</th>
                    <th>ROLE</th>
                    <th>REQUEST</th>
                    <th>MESSAGE</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td className="ad-cell-accent">
                        <div>{r.full_name}</div>
                        <div style={{ fontSize: '0.6875rem', opacity: 0.7 }}>{r.username}</div>
                      </td>
                      <td>{r.role}</td>
                      <td>Password Reset</td>
                      <td title={r.message} style={{ maxWidth: '12.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.message || '-'}
                      </td>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td>
                        <span className={`ad-badge ${r.status}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {r.status === 'pending' && (
                          <div className="ad-row-actions">
                            <button className="ad-primary-btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handleRespond(r.id, 'approve')}>Approve</button>
                            <button className="ad-cancel-btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handleRespond(r.id, 'deny')}>Deny</button>
                          </div>
                        )}
                        {r.status !== 'pending' && <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>Processed</span>}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: '#aaa' }}>
                        No password requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleUserCreated}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={handleUserUpdated}
        />
      )}
    </div>
  );
}
