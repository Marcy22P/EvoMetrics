import React, { useEffect, useState, useMemo } from 'react';
import {
  Page,
  Card,
  Text,
  BlockStack,
  Grid,
  Box,
  InlineStack,
  Badge,
  Divider,
  Avatar,
  ProgressBar,
  Spinner,
  Banner,
  Button,
  Tooltip,
  Icon,
  Select
} from '@shopify/polaris';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CheckIcon,
  AlertCircleIcon,
  ListBulletedIcon,
  ChartVerticalIcon
} from '@shopify/polaris-icons';
import { productivityApi, type Task, type TaskStatus } from '../services/productivityApi';
import { useAuth } from '../hooks/useAuth';
import { usersApi, type User } from '../services/usersApi';
import { clientiApi, type Cliente } from '../services/clientiApi';
import { 
    format, 
    differenceInDays, 
    addDays, 
    startOfWeek, 
    isWithinInterval, 
    isPast, 
    isToday, 
    isYesterday, 
    subDays
} from 'date-fns';
import { it } from 'date-fns/locale';

// --- HELPER COMPONENTS ---

const StatusBadge = ({ status, label, color }: { status: string, label?: string, color?: string }) => {
    const toneMap: Record<string, "info" | "success" | "warning" | "critical" | "attention" | "new"> = {
        'new': 'new',
        'info': 'info',
        'success': 'success',
        'warning': 'warning',
        'critical': 'critical',
        'attention': 'attention',
        'subdued': 'info'
    };
    
    const staticColors: Record<string, string> = {
        'todo': 'new',
        'in_progress': 'info',
        'done': 'success',
        'review': 'attention',
        'blocked': 'critical'
    };

    const tone = color ? toneMap[color] || 'info' : (staticColors[status] as any || 'info');
    
    return <Badge tone={tone}>{label || status}</Badge>;
};

// KPI Cards Component - Design Migliorato
const KPICards = ({ tasks }: { tasks: Task[] }) => {
    const totalOpen = tasks.filter(t => t.status !== 'done').length;
    const completedToday = tasks.filter(t => t.status === 'done' && t.completed_at && isToday(new Date(t.completed_at))).length;
    const overdue = tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && t.status !== 'done').length;
    
    const total = tasks.length;
    const efficiency = total > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / total) * 100) : 0;

    return (
        <Grid>
            <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                <Card>
                    <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingSm" tone="subdued">Task Aperti</Text>
                            <Box background="bg-surface-secondary" padding="200" borderRadius="full">
                                <Icon source={ListBulletedIcon} tone="info" />
                            </Box>
                        </InlineStack>
                        <Text as="p" variant="heading2xl">{totalOpen}</Text>
                    </BlockStack>
                </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                <Card>
                    <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingSm" tone="subdued">Completati Oggi</Text>
                            <Box background="bg-surface-success" padding="200" borderRadius="full">
                                <Icon source={CheckIcon} tone="success" />
                            </Box>
                        </InlineStack>
                        <Text as="p" variant="heading2xl" tone="success">{completedToday}</Text>
                    </BlockStack>
                </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                <Card>
                    <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingSm" tone="subdued">Scaduti</Text>
                            <Box background="bg-surface-critical" padding="200" borderRadius="full">
                                <Icon source={AlertCircleIcon} tone="critical" />
                            </Box>
                        </InlineStack>
                        <Text as="p" variant="heading2xl" tone={overdue > 0 ? "critical" : undefined}>{overdue}</Text>
                    </BlockStack>
                </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
                <Card>
                    <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingSm" tone="subdued">Efficienza</Text>
                            <Box background="bg-surface-secondary" padding="200" borderRadius="full">
                                <Icon source={ChartVerticalIcon} tone="base" />
                            </Box>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="heading2xl">{efficiency}%</Text>
                            <div style={{ flex: 1, maxWidth: '80px' }}>
                                <ProgressBar progress={efficiency} size="small" tone="highlight" />
                            </div>
                        </InlineStack>
                    </BlockStack>
                </Card>
            </Grid.Cell>
        </Grid>
    );
};

// Collaborator Card - Design Migliorato
const CollaboratorCard: React.FC<{ user: User, stats: { done: number, total: number, overdue: number } }> = ({ user, stats }) => {
    const progress = stats.total > 0 ? (stats.done / stats.total) * 100 : 0;
    const openTasks = stats.total - stats.done;
    const isOverloaded = openTasks > 10;
    
    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack gap="400" blockAlign="center">
                    <div style={{ position: 'relative' }}>
                        <Avatar size="md" name={user.username} />
                        {stats.overdue > 0 && (
                            <div style={{ 
                                position: 'absolute', 
                                top: -4, 
                                right: -4, 
                                background: '#D72C0D', 
                                color: 'white', 
                                borderRadius: '50%', 
                                width: '20px', 
                                height: '20px', 
                                fontSize: '11px', 
                                fontWeight: 'bold',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                border: '2px solid white'
                            }}>
                                {stats.overdue}
                            </div>
                        )}
                    </div>
                    <BlockStack gap="050">
                        <Text as="h3" variant="headingSm">{user.username}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{user.job_title || user.role}</Text>
                    </BlockStack>
                </InlineStack>
                
                <Divider />
                
                <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="subdued">Completamento</Text>
                        <Text as="span" variant="bodySm" fontWeight="bold">{Math.round(progress)}%</Text>
                    </InlineStack>
                    <ProgressBar progress={progress} size="small" tone={progress === 100 ? "success" : "highlight"} />
                    
                    <InlineStack align="space-evenly">
                        <BlockStack inlineAlign="center" gap="100">
                            <Text as="p" variant="headingLg" tone="success">{stats.done}</Text>
                            <Text as="p" variant="bodyXs" tone="subdued">Completati</Text>
                        </BlockStack>
                        <div style={{ width: '1px', background: '#e1e3e5', alignSelf: 'stretch' }} />
                        <BlockStack inlineAlign="center" gap="100">
                            <Text as="p" variant="headingLg" tone={isOverloaded ? "critical" : undefined}>
                                {openTasks}
                            </Text>
                            <Text as="p" variant="bodyXs" tone="subdued">Aperti</Text>
                        </BlockStack>
                    </InlineStack>
                </BlockStack>
            </BlockStack>
        </Card>
    );
};

// Gantt Chart - Design Migliorato
const GanttChart: React.FC<{ tasks: Task[], statuses: TaskStatus[], users: User[] }> = ({ tasks, statuses, users }) => {
    const [startDate, setStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const endDate = addDays(startDate, 13);
    const days = [];
    
    for (let i = 0; i < 14; i++) {
        days.push(addDays(startDate, i));
    }

    const tasksInView = useMemo(() => {
        return tasks.filter(t => {
            if (!t.due_date) return false;
            const due = new Date(t.due_date);
            return isWithinInterval(due, { start: startDate, end: endDate });
        }).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
    }, [tasks, startDate, endDate]);

    const handlePrev = () => setStartDate(prev => subDays(prev, 7));
    const handleNext = () => setStartDate(prev => addDays(prev, 7));
    const handleToday = () => setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }));

    const getStatusColor = (statusId: string) => {
        const s = statuses.find(st => st.id === statusId);
        const map: Record<string, string> = {
            'new': '#E4E5E7',
            'info': '#B4E1FA',
            'success': '#AEE9D1',
            'warning': '#FFEA8A',
            'critical': '#FED3D1',
            'attention': '#FFD79D'
        };
        return map[s?.color || 'info'] || '#B4E1FA';
    };

    const getUserName = (id?: string) => users.find(u => String(u.id) === id)?.username || '?';

    return (
        <Card>
            <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Timeline Task</Text>
                    <InlineStack gap="200" blockAlign="center">
                        <Button icon={ChevronLeftIcon} onClick={handlePrev} variant="tertiary" size="slim" />
                        <Button onClick={handleToday} size="slim">Oggi</Button>
                        <Button icon={ChevronRightIcon} onClick={handleNext} variant="tertiary" size="slim" />
                    </InlineStack>
                </InlineStack>
                
                <Box paddingBlockStart="400">
                    <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: '900px' }}>
                            {/* Header Giorni */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '180px repeat(14, 1fr)', 
                                gap: '2px', 
                                marginBottom: '12px', 
                                borderBottom: '1px solid #E1E3E5', 
                                paddingBottom: '12px' 
                            }}>
                                <div style={{ fontWeight: '600', fontSize: '13px', color: '#6D7175', paddingLeft: '8px' }}>
                                    Task
                                </div>
                                {days.map(d => (
                                    <div key={d.toISOString()} style={{ 
                                        textAlign: 'center', 
                                        fontSize: '12px', 
                                        color: isToday(d) ? '#008060' : '#6D7175',
                                        fontWeight: isToday(d) ? '700' : '500',
                                        backgroundColor: isToday(d) ? '#F1F8F5' : 'transparent',
                                        borderRadius: '6px',
                                        padding: '6px 2px'
                                    }}>
                                        <div style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {format(d, 'EEE', { locale: it })}
                                        </div>
                                        <div style={{ fontSize: '14px', marginTop: '2px' }}>
                                            {format(d, 'dd')}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Righe Task */}
                            {tasksInView.length === 0 ? (
                                <Box padding="800">
                                    <BlockStack inlineAlign="center">
                                        <Text as="p" tone="subdued">Nessun task in scadenza in questo periodo.</Text>
                                    </BlockStack>
                                </Box>
                            ) : (
                                tasksInView.map(task => {
                                    if (!task.due_date) return null;
                                    const taskDate = new Date(task.due_date);
                                    let startCol = differenceInDays(taskDate, startDate) + 2; 
                                    if (startCol < 2) startCol = 2;
                                    if (startCol > 15) return null;

                                    return (
                                        <div key={task.id} style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: '180px repeat(14, 1fr)', 
                                            gap: '2px', 
                                            marginBottom: '6px', 
                                            alignItems: 'center', 
                                            height: '36px' 
                                        }}>
                                            <div style={{ 
                                                whiteSpace: 'nowrap', 
                                                overflow: 'hidden', 
                                                textOverflow: 'ellipsis', 
                                                paddingRight: '12px', 
                                                fontSize: '13px', 
                                                paddingLeft: '8px',
                                                color: '#202223'
                                            }} title={task.title}>
                                                {task.title}
                                            </div>
                                            <div style={{ 
                                                gridColumn: `${startCol} / span 1`, 
                                                height: '28px', 
                                                backgroundColor: getStatusColor(task.status), 
                                                borderRadius: '6px', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                                border: '1px solid rgba(0,0,0,0.04)',
                                                transition: 'transform 0.15s ease'
                                            }} title={`${task.title} - ${format(taskDate, 'dd MMM')}`}>
                                                {task.assignee_id && (
                                                    <Tooltip content={`Assegnato a ${getUserName(task.assignee_id)}`}>
                                                        <Avatar size="xs" name={getUserName(task.assignee_id)} />
                                                    </Tooltip>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </Box>
            </Box>
        </Card>
    );
};

// Recent Activity List - Design Migliorato
const RecentActivityList: React.FC<{ tasks: Task[], statuses: TaskStatus[], users: User[], clients: Cliente[] }> = ({ tasks, statuses, users, clients }) => {
    const sortedTasks = [...tasks].sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || new Date());
        const dateB = new Date(b.updated_at || b.created_at || new Date());
        return dateB.getTime() - dateA.getTime();
    }).slice(0, 10);

    const getStatusLabel = (id: string) => statuses.find(s => s.id === id)?.label || id;
    const getStatusColor = (id: string) => statuses.find(s => s.id === id)?.color;
    const getUserName = (id?: string) => users.find(u => String(u.id) === id)?.username || '?';
    const getClientName = (id?: string) => {
        if (!id) return 'Generale';
        const client = clients.find(c => c.id === id);
        return client ? client.nome_azienda : (id.length > 8 ? id.substring(0, 8) + '...' : id);
    };

    const renderTaskRow = (task: Task) => (
        <div key={task.id} style={{ 
            padding: '14px 0', 
            borderBottom: '1px solid #F1F1F1'
        }}>
            <InlineStack align="space-between" blockAlign="center" gap="400">
                <InlineStack gap="300" blockAlign="center">
                    <div style={{ 
                        width: '36px', 
                        height: '36px', 
                        borderRadius: '8px',
                        backgroundColor: task.status === 'done' ? '#F1F8F5' : '#F6F6F7',
                        display: 'flex', 
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Icon 
                            source={task.status === 'done' ? CheckIcon : ClockIcon} 
                            tone={task.status === 'done' ? 'success' : 'subdued'} 
                        />
                    </div>
                    <BlockStack gap="100">
                        <Text 
                            as="span" 
                            variant="bodyMd" 
                            fontWeight="semibold" 
                            textDecorationLine={task.status === 'done' ? 'line-through' : undefined}
                        >
                            {task.title}
                        </Text>
                        <InlineStack gap="100">
                            <Text as="span" variant="bodyXs" tone="subdued">
                                {getClientName(task.project_id)}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">•</Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                                {format(new Date(task.updated_at || task.created_at || new Date()), 'dd MMM, HH:mm', { locale: it })}
                            </Text>
                        </InlineStack>
                    </BlockStack>
                </InlineStack>
                <InlineStack gap="300" blockAlign="center">
                    {task.assignee_id && (
                        <Tooltip content={`Assegnato a ${getUserName(task.assignee_id)}`}>
                            <Avatar size="sm" name={getUserName(task.assignee_id)} />
                        </Tooltip>
                    )}
                    <StatusBadge status={task.status} label={getStatusLabel(task.status)} color={getStatusColor(task.status)} />
                </InlineStack>
            </InlineStack>
        </div>
    );

    const todayTasks = sortedTasks.filter(t => isToday(new Date(t.updated_at || t.created_at || new Date())));
    const yesterdayTasks = sortedTasks.filter(t => isYesterday(new Date(t.updated_at || t.created_at || new Date())));
    const olderTasks = sortedTasks.filter(t => !isToday(new Date(t.updated_at || t.created_at || new Date())) && !isYesterday(new Date(t.updated_at || t.created_at || new Date())));

    return (
        <Card>
            <Box padding="400">
                <Text as="h2" variant="headingMd">Attività Recenti</Text>
                <Box paddingBlockStart="400">
                    {sortedTasks.length === 0 ? (
                        <Text as="p" tone="subdued">Nessuna attività recente.</Text>
                    ) : (
                        <BlockStack gap="400">
                            {todayTasks.length > 0 && (
                                <BlockStack gap="100">
                                    <Text as="h3" variant="headingXs" tone="subdued">OGGI</Text>
                                    {todayTasks.map(renderTaskRow)}
                                </BlockStack>
                            )}
                            {yesterdayTasks.length > 0 && (
                                <BlockStack gap="100">
                                    <Text as="h3" variant="headingXs" tone="subdued">IERI</Text>
                                    {yesterdayTasks.map(renderTaskRow)}
                                </BlockStack>
                            )}
                            {olderTasks.length > 0 && (
                                <BlockStack gap="100">
                                    <Text as="h3" variant="headingXs" tone="subdued">PRECEDENTI</Text>
                                    {olderTasks.map(renderTaskRow)}
                                </BlockStack>
                            )}
                        </BlockStack>
                    )}
                </Box>
            </Box>
        </Card>
    );
};

export const ProductivityDashboardContent: React.FC<{
    tasks: Task[], 
    users: User[], 
    statuses: TaskStatus[], 
    clients: Cliente[],
    loading: boolean,
    error: string | null,
    selectedUserFilter: string,
    setSelectedUserFilter: (val: string) => void,
    setError: (val: string | null) => void,
    isAdmin?: boolean
}> = ({ tasks, users, statuses, clients, loading, error, selectedUserFilter, setSelectedUserFilter, setError, isAdmin = true }) => {
    
    const filteredTasks = useMemo(() => {
        if (!selectedUserFilter) return tasks;
        return tasks.filter(t => t.assignee_id === selectedUserFilter);
    }, [tasks, selectedUserFilter]);

    const userStats = useMemo(() => {
        const statsMap = new Map<string, { done: number, total: number, overdue: number }>();
        users.forEach(u => statsMap.set(String(u.id), { done: 0, total: 0, overdue: 0 }));
        
        tasks.forEach(t => {
            if (t.assignee_id) {
                const current = statsMap.get(t.assignee_id) || { done: 0, total: 0, overdue: 0 };
                current.total += 1;
                if (t.status === 'done') current.done += 1;
                if (t.due_date && isPast(new Date(t.due_date)) && t.status !== 'done') current.overdue += 1;
                statsMap.set(t.assignee_id, current);
            }
        });
        
        return statsMap;
    }, [tasks, users]);

    // Filtra utenti di sistema
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const lowerName = user.username.toLowerCase();
            const isSystemAccount = 
                lowerName.includes('backup') || 
                lowerName.includes('superadmin') ||
                user.role === 'superadmin';
            return !isSystemAccount;
        });
    }, [users]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', width: '100%' }}>
                <Spinner size="large" />
            </div>
        );
    }

    return (
        <BlockStack gap="500">
            {error && (
                <Banner tone="critical" onDismiss={() => setError(null)}>
                    <p>{error}</p>
                </Banner>
            )}

            {/* Filtro Utente - solo per admin */}
            {isAdmin && (
                <InlineStack align="end">
                    <div style={{ width: '280px' }}>
                        <Select
                            label="Filtra per collaboratore"
                            labelHidden
                            options={[
                                { label: 'Tutti i collaboratori', value: '' }, 
                                ...filteredUsers.map(u => ({ 
                                    label: u.username, 
                                    value: String(u.id) 
                                }))
                            ]}
                            value={selectedUserFilter}
                            onChange={setSelectedUserFilter}
                        />
                    </div>
                </InlineStack>
            )}

            {/* KPI Cards */}
            <KPICards tasks={filteredTasks} />

            {/* Collaboratori Grid */}
            <Grid>
                {filteredUsers.map(user => {
                    const stats = userStats.get(String(user.id)) || { done: 0, total: 0, overdue: 0 };
                    
                    if (selectedUserFilter && String(user.id) !== selectedUserFilter) return null;
                    if (!user.is_active && stats.total === 0) return null;
                    
                    return (
                        <Grid.Cell key={user.id} columnSpan={{ xs: 6, sm: 6, md: 4, lg: 3, xl: 3 }}>
                            <CollaboratorCard user={user} stats={stats} />
                        </Grid.Cell>
                    );
                })}
            </Grid>

            {/* Gantt Chart */}
            <GanttChart tasks={filteredTasks} statuses={statuses} users={filteredUsers} />

            {/* Recent Activity */}
            <RecentActivityList tasks={filteredTasks} statuses={statuses} users={filteredUsers} clients={clients} />
        </BlockStack>
    );
};

const ProductivityDashboard: React.FC = () => {
    const { user: currentUser, hasPermission } = useAuth();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin' || hasPermission('team:write');
    
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [clients, setClients] = useState<Cliente[]>([]);
    const [statuses, setStatuses] = useState<TaskStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Se non è admin, forza filtro su se stesso
    const [selectedUserFilter, setSelectedUserFilter] = useState<string>('');
    
    useEffect(() => {
        // Se non è admin, forza il filtro sul proprio ID
        if (!isAdmin && currentUser?.id) {
            setSelectedUserFilter(String(currentUser.id));
        }
    }, [isAdmin, currentUser?.id]);
    
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [tasksData, usersData, statusesData, clientsData] = await Promise.all([
                    productivityApi.getTasks(),
                    usersApi.getUsers(),
                    productivityApi.getStatuses(),
                    clientiApi.getClienti()
                ]);
                setTasks(tasksData);
                setUsers(usersData);
                setStatuses(statusesData);
                setClients(clientsData);
            } catch (e: any) {
                console.error(e);
                setError("Errore nel caricamento dati: " + (e.message || "Errore sconosciuto"));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <Page 
            title="Produttività Team" 
            fullWidth
            primaryAction={
                <Button variant="primary" onClick={() => window.location.reload()}>Aggiorna Dati</Button>
            }
        >
            <ProductivityDashboardContent 
                tasks={tasks}
                users={users}
                statuses={statuses}
                clients={clients}
                loading={loading}
                error={error}
                selectedUserFilter={selectedUserFilter}
                setSelectedUserFilter={setSelectedUserFilter}
                setError={setError}
                isAdmin={isAdmin}
            />
        </Page>
    );
};

export default ProductivityDashboard;
