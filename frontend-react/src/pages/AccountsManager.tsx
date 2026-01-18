import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { 
  DashboardIcon, 
  RefreshIcon, 
  CheckmarkIcon, 
  MoneyBagIcon, 
  DocumentIcon, 
  DollarIcon 
} from '../components/Icons/AssessmentIcons';
import usersApi, { type User as UserType } from '../services/usersApi';
import { showToast } from '../utils/toast';
import './AccountsManager.css';

const AccountsManager: React.FC = () => {
  const { user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const [newPassword, setNewPassword] = useState('');

  // Form creazione utente
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'user',
  });

  // Form modifica ruolo
  const [newRole, setNewRole] = useState('user');

  // Carica utenti - memoizzato per evitare re-render
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Errore nel caricamento utenti');
      showToast('Errore nel caricamento utenti', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && hasPermission('users:read')) {
      loadUsers();
    }
  }, [currentUser]);

  // Crea nuovo utente - memoizzato per evitare re-render
  const handleCreateUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Se password vuota, passa undefined invece di stringa vuota
      const userData = {
        ...newUser,
        password: newUser.password.trim() || undefined,
      };
      await usersApi.createUser(userData);
      showToast(
        userData.password 
          ? 'Utente creato con successo. Potrà accedere sia con username/password che con Google OAuth.' 
          : 'Utente creato con successo. Potrà accedere solo tramite Google OAuth.',
        'success'
      );
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', role: 'user' });
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nella creazione utente', 'error');
    }
  }, [newUser, loadUsers]);

  // Aggiorna ruolo
  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.updateUser(selectedUser.id, { role: newRole });
      showToast('Ruolo aggiornato con successo', 'success');
      setShowRoleModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nell\'aggiornamento ruolo', 'error');
    }
  };

  // Aggiorna password
  const handleUpdatePassword = async () => {
    if (!selectedUser || !newPassword) return;
    
    // Validazione password
    if (newPassword.length < 8) {
      showToast('La password deve essere di almeno 8 caratteri', 'error');
      return;
    }
    
    try {
      await usersApi.updateUserPassword(selectedUser.id, newPassword);
      showToast('Password aggiornata con successo', 'success');
      setShowPasswordModal(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Errore nell\'aggiornamento password', 'error');
    }
  };

  // Aggiorna stato (attivo/non attivo)
  const handleToggleStatus = async (userId: number, currentStatus: boolean) => {
    try {
      await usersApi.updateUser(userId, { is_active: !currentStatus });
      showToast(`Utente ${!currentStatus ? 'attivato' : 'disattivato'}`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nell\'aggiornamento stato', 'error');
    }
  };

  // Carica permessi utente
  const handleLoadPermissions = async (user: UserType) => {
    try {
      const perms = await usersApi.getUserPermissions(user.id);
      setUserPermissions(perms.permissions || {});
      setSelectedUser(user);
      setShowPermissionsModal(true);
    } catch (err: any) {
      showToast(err.message || 'Errore nel caricamento permessi', 'error');
    }
  };

  // Aggiorna permessi
  const handleUpdatePermissions = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.updateUserPermissions(selectedUser.id, userPermissions);
      showToast('Permessi aggiornati con successo', 'success');
      setShowPermissionsModal(false);
      setSelectedUser(null);
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Errore nell\'aggiornamento permessi');
      showToast(errorMessage, 'error');
    }
  };

  // Elimina utente
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.deleteUser(selectedUser.id);
      showToast(`Utente ${selectedUser.username} eliminato con successo`, 'success');
      setShowDeleteModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nell\'eliminazione utente', 'error');
    }
  };

  // Apri modale eliminazione
  const handleOpenDeleteModal = (user: UserType) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  // Approva utente
  const handleApproveUser = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.approveUser(selectedUser.id);
      showToast(`Utente ${selectedUser.username} approvato con successo`, 'success');
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nell\'approvazione utente', 'error');
    }
  };

  // Rifiuta utente
  const handleRejectUser = async () => {
    if (!selectedUser) return;
    try {
      await usersApi.rejectUser(selectedUser.id, rejectionReason || undefined);
      showToast(`Utente ${selectedUser.username} rifiutato`, 'success');
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message || 'Errore nel rifiuto utente', 'error');
    }
  };

  // Apri modale rifiuto
  const handleOpenRejectModal = (user: UserType) => {
    setSelectedUser(user);
    setRejectionReason('');
    setShowRejectModal(true);
  };
  
  // Separare utenti in pending e normali
  const pendingUsers = users.filter(u => u.pending_approval === true);
  const activeUsers = users.filter(u => u.pending_approval !== true);

  // Modale modifica ruolo
  const RoleModal: React.FC = () => {
    if (!showRoleModal || !selectedUser) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowRoleModal(false)}>
        <div className="modal-content accounts-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Modifica Ruolo - {selectedUser.username}</h2>
            <button className="modal-close" onClick={() => setShowRoleModal(false)}>×</button>
          </div>
          <div className="form-group">
            <label>Nuovo Ruolo</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowRoleModal(false)}>
              Annulla
            </button>
            <button type="button" className="btn-primary" onClick={handleUpdateRole}>
              Aggiorna Ruolo
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Ref per preservare la posizione di scroll nella modale permessi
  const permissionsContentRef = React.useRef<HTMLDivElement>(null);

  // Modale permessi
  const PermissionsModal: React.FC = () => {
    if (!showPermissionsModal || !selectedUser) return null;

    // Permessi frontend modificabili (Dashboard, Contratti, Preventivi, Pagamenti, Gradimento)
    // I permessi backend (assessments, users, debug) sono solo per admin/superadmin
    const permissionGroups = [
      {
        title: 'Dashboard',
        description: 'Accesso alla dashboard principale e visualizzazione delle statistiche',
        perms: ['dashboard:read'],
        icon: DashboardIcon,
      },
      {
        title: 'Gradimento',
        description: 'Accesso al form di gradimento e visualizzazione delle proprie risposte',
        perms: ['gradimento:write', 'gradimento:read'],
        icon: CheckmarkIcon,
        note: 'gradimento:write = compilare il form, gradimento:read = vedere tutte le risposte (admin)',
      },
      {
        title: 'Gestore Preventivi',
        description: 'Visualizza, crea, modifica ed elimina preventivi',
        perms: ['preventivi:read', 'preventivi:write', 'preventivi:delete'],
        icon: MoneyBagIcon,
      },
      {
        title: 'Gestore Contratti',
        description: 'Visualizza, crea, modifica ed elimina contratti',
        perms: ['contratti:read', 'contratti:write', 'contratti:delete'],
        icon: DocumentIcon,
      },
      {
        title: 'Gestore Pagamenti',
        description: 'Visualizza e gestisci pagamenti',
        perms: ['pagamenti:read', 'pagamenti:write'],
        icon: DollarIcon,
      },
    ];

    return (
      <div className="modal-overlay" onClick={() => setShowPermissionsModal(false)}>
        <div className="modal-content accounts-modal permissions-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Gestisci Permessi - {selectedUser.username}</h2>
            <button className="modal-close" onClick={() => setShowPermissionsModal(false)}>×</button>
          </div>
          <div className="permissions-content" ref={permissionsContentRef}>
            {permissionGroups.map((group) => {
              const IconComponent = group.icon;
              return (
                <div key={group.title} className="permission-group detailed-permission-group">
                  <div className="permission-group-header">
                    <div className="permission-group-icon-wrapper">
                      <IconComponent size="medium" />
                    </div>
                    <div className="permission-group-title-section">
                      <h3>{group.title}</h3>
                      {group.description && <p className="permission-group-description">{group.description}</p>}
                      {group.note && <p className="permission-group-note">{group.note}</p>}
                    </div>
                  </div>
                  <div className="permissions-grid detailed-permissions-grid">
                    {group.perms.map((perm) => {
                      const permLabel = perm.split(':')[1];
                      const permLabels: Record<string, string> = {
                        'read': 'Visualizza',
                        'write': 'Modifica/Crea',
                        'delete': 'Elimina',
                      };
                      const permDescriptions: Record<string, string> = {
                        'dashboard:read': 'Accedi alla dashboard e visualizza statistiche',
                        'gradimento:write': 'Compila il form di gradimento settimanale',
                        'gradimento:read': 'Visualizza tutte le risposte al gradimento (solo admin)',
                        'preventivi:read': 'Visualizza preventivi esistenti',
                        'preventivi:write': 'Crea e modifica preventivi',
                        'preventivi:delete': 'Elimina preventivi',
                        'contratti:read': 'Visualizza contratti esistenti',
                        'contratti:write': 'Crea e modifica contratti',
                        'contratti:delete': 'Elimina contratti',
                        'pagamenti:read': 'Visualizza pagamenti',
                        'pagamenti:write': 'Gestisci e modifica pagamenti',
                      };
                      return (
                        <div
                          key={perm}
                          className="permission-checkbox detailed-permission-checkbox"
                          onClick={(e) => {
                            // Previeni qualsiasi comportamento di default
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Toggle del valore senza causare scroll
                            setUserPermissions({
                              ...userPermissions,
                              [perm]: !userPermissions[perm],
                            });
                          }}
                          role="checkbox"
                          aria-checked={userPermissions[perm] || false}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            // Permetti toggle con spazio o enter
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              setUserPermissions({
                                ...userPermissions,
                                [perm]: !userPermissions[perm],
                              });
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={userPermissions[perm] || false}
                            onChange={(e) => {
                              // Previeni comportamento di default
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              // Previeni qualsiasi comportamento di default
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onFocus={(e) => {
                              // Previeni lo scroll quando l'elemento riceve focus
                              e.preventDefault();
                              e.target.blur();
                            }}
                            tabIndex={-1}
                            aria-hidden="true"
                            style={{ pointerEvents: 'none' }}
                          />
                          <div className="permission-label-content">
                            <span className="permission-label-main">{permLabels[permLabel] || permLabel}</span>
                            {permDescriptions[perm] && (
                              <span className="permission-label-desc">{permDescriptions[perm]}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowPermissionsModal(false)}>
              Annulla
            </button>
            <button type="button" className="btn-primary" onClick={handleUpdatePermissions}>
              Salva Permessi
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPermission('users:read')) {
    return <Navigate to="/dashboard" replace />;
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('it-IT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'role-badge superadmin';
      case 'admin':
        return 'role-badge admin';
      default:
        return 'role-badge user';
    }
  };

  return (
    <div className="accounts-manager-container">
      <div className="accounts-header">
        <div className="header-left">
          <Link to="/dashboard" className="back-link">
            <DashboardIcon /> Dashboard
          </Link>
          <h1>Gestione Utenti</h1>
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={loadUsers} title="Aggiorna">
            <RefreshIcon />
          </button>
          {hasPermission('users:create') && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              + Nuovo Utente
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Caricamento utenti...</p>
        </div>
      ) : (
        <>
          {/* Sezione Richieste in Attesa */}
          {pendingUsers.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div className="accounts-header">
                <h2 style={{ color: 'var(--warning-color)' }}>Richieste in Attesa ({pendingUsers.length})</h2>
              </div>
              <div className="users-grid">
                {pendingUsers.map((user) => (
                  <div key={user.id} className="user-card" style={{ borderLeft: '4px solid var(--warning-color)' }}>
                    <div className="user-card-header">
                      <div className="user-info">
                        <h3>{user.username}</h3>
                        <span className={getRoleBadgeClass(user.role)}>{user.role}</span>
                      </div>
                      <span className="status-badge" style={{ backgroundColor: 'var(--warning-color)', color: '#000' }}>
                        In Attesa
                      </span>
                    </div>
                    <div className="user-card-body">
                      <div className="user-detail">
                        <span className="label">Email:</span>
                        <span className="value">{user.google_email || 'N/A'}</span>
                      </div>
                      <div className="user-detail">
                        <span className="label">Creato:</span>
                        <span className="value">{formatDate(user.created_at)}</span>
                      </div>
                    </div>
                    <div className="user-card-actions">
                      {hasPermission('users:update') && (
                        <>
                          <button
                            className="btn-action success"
                            onClick={() => {
                              setSelectedUser(user);
                              handleApproveUser();
                            }}
                          >
                            Approva
                          </button>
                          <button
                            className="btn-action danger"
                            onClick={() => handleOpenRejectModal(user)}
                          >
                            Rifiuta
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sezione Utenti Normali */}
          {activeUsers.length === 0 && pendingUsers.length === 0 ? (
            <div className="empty-state">
              <p>Nessun utente trovato</p>
              {hasPermission('users:create') && (
                <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                  Crea Primo Utente
                </button>
              )}
            </div>
          ) : activeUsers.length > 0 && (
            <div>
              <div className="accounts-header">
                <h2>Utenti Attivi ({activeUsers.length})</h2>
              </div>
              <div className="users-grid">
                {activeUsers.map((user) => (
            <div key={user.id} className={`user-card ${!user.is_active ? 'inactive' : ''}`}>
              <div className="user-card-header">
                <div className="user-info">
                  <h3>{user.username}</h3>
                  <span className={getRoleBadgeClass(user.role)}>{user.role}</span>
                </div>
                <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                  {user.is_active ? 'Attivo' : 'Disattivato'}
                </span>
              </div>
              <div className="user-card-body">
                <div className="user-detail">
                  <span className="label">ID:</span>
                  <span className="value">{user.id}</span>
                </div>
                <div className="user-detail">
                  <span className="label">Creato:</span>
                  <span className="value">{formatDate(user.created_at)}</span>
                </div>
              </div>
              <div className="user-card-actions">
                {hasPermission('users:update') && (
                  <>
                    {currentUser?.role === 'superadmin' && (
                      <button
                        className="btn-action"
                        onClick={() => {
                          setSelectedUser(user);
                          setNewRole(user.role);
                          setShowRoleModal(true);
                        }}
                      >
                        Modifica Ruolo
                      </button>
                    )}
                    <button
                      className="btn-action"
                      onClick={() => handleLoadPermissions(user)}
                    >
                      Permessi
                    </button>
                    {/* Mostra "Imposta Password" solo se:
                        - Superadmin può modificare tutti
                        - Admin può modificare solo user (non admin/superadmin) */}
                    {(currentUser?.role === 'superadmin' || 
                      (currentUser?.role === 'admin' && user.role === 'user')) && (
                      <button
                        className="btn-action"
                        onClick={() => {
                          setSelectedUser(user);
                          setNewPassword('');
                          setShowPasswordModal(true);
                        }}
                      >
                        Imposta Password
                      </button>
                    )}
                    <button
                      className={`btn-action ${user.is_active ? 'danger' : 'success'}`}
                      onClick={() => handleToggleStatus(user.id, user.is_active)}
                    >
                      {user.is_active ? 'Disattiva' : 'Attiva'}
                    </button>
                    {currentUser?.id !== user.id && (
                      <button
                        className="btn-action danger"
                        onClick={() => handleOpenDeleteModal(user)}
                        title="Elimina utente"
                      >
                        Elimina
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modale Rifiuto Utente */}
      {showRejectModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content accounts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Rifiuta Richiesta</h2>
              <button className="modal-close" onClick={() => setShowRejectModal(false)}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
                Sei sicuro di voler rifiutare la richiesta di <strong>{selectedUser.username}</strong>?
              </p>
              <div className="form-group">
                <label>Motivo del rifiuto (opzionale)</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Inserisci un motivo opzionale per il rifiuto..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowRejectModal(false)}>
                Annulla
              </button>
              <button type="button" className="btn-primary" style={{ backgroundColor: 'var(--danger-color)' }} onClick={handleRejectUser}>
                Rifiuta Richiesta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale creazione utente - renderizzato direttamente per evitare problemi di focus */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content accounts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Crea Nuovo Utente</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Username</label>
                <input
                  key="create-user-username"
                  type="text"
                  value={newUser.username}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewUser(prev => ({ ...prev, username: value }));
                  }}
                  required
                  minLength={3}
                  maxLength={50}
                  pattern="[A-Za-z0-9_.-]+"
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>Password (Opzionale)</label>
                <input
                  key="create-user-password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewUser(prev => ({ ...prev, password: value }));
                  }}
                  minLength={8}
                  autoComplete="new-password"
                />
                <small>
                  {newUser.password ? (
                    'Minimo 8 caratteri, lettere e numeri'
                  ) : (
                    'Lascia vuoto per creare un utente solo Google OAuth. Se imposti una password, l\'utente potrà accedere sia con username/password che con Google OAuth.'
                  )}
                </small>
              </div>
              <div className="form-group">
                <label>Ruolo</label>
                <select
                  key="create-user-role"
                  value={newUser.role}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewUser(prev => ({ ...prev, role: value }));
                  }}
                  disabled={currentUser?.role !== 'superadmin'}
                >
                  <option value="user">User</option>
                  {currentUser?.role === 'superadmin' && (
                    <>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </>
                  )}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Annulla
                </button>
                <button type="submit" className="btn-primary">
                  Crea Utente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale eliminazione utente */}
      {showDeleteModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content accounts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Conferma Eliminazione</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
                Sei sicuro di voler eliminare l'utente <strong>{selectedUser.username}</strong>?
              </p>
              <p style={{ marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                Questa azione è <strong style={{ color: 'var(--danger-color)' }}>irreversibile</strong>. 
                L'utente e tutti i suoi dati associati verranno eliminati definitivamente.
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Annulla
              </button>
              <button type="button" className="btn-primary" style={{ backgroundColor: 'var(--danger-color)' }} onClick={handleDeleteUser}>
                Elimina Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Imposta Password */}
      {showPasswordModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content accounts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Imposta Password - {selectedUser.username}</h2>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              <div className="form-group">
                <label>Nuova Password</label>
                <input
                  key="update-user-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Inserisci nuova password"
                  minLength={8}
                  autoComplete="new-password"
                />
                <small>
                  Minimo 8 caratteri. 
                  {selectedUser.google_id && (
                    <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                      Se imposti una password, l'utente potrà accedere sia con username/password che con Google OAuth.
                    </span>
                  )}
                  {!selectedUser.google_id && (
                    <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                      L'utente potrà accedere con username/password.
                    </span>
                  )}
                </small>
              </div>
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => {
                  setShowPasswordModal(false);
                  setNewPassword('');
                  setSelectedUser(null);
                }}
              >
                Annulla
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleUpdatePassword}
                disabled={!newPassword || newPassword.length < 8}
              >
                Imposta Password
              </button>
            </div>
          </div>
        </div>
      )}

      <RoleModal />
      <PermissionsModal />
    </div>
  );
};

export default AccountsManager;
