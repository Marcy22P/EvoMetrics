import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  Box,
  Spinner,
  Banner,
  Button,
  InlineStack
} from '@shopify/polaris';
import { ClockIcon } from '@shopify/polaris-icons';
import { usersApi, type User } from '../services/usersApi';
import { productivityApi, type Task, type TaskStatus } from '../services/productivityApi';
import { clientiApi, type Cliente } from '../services/clientiApi';
import toast from 'react-hot-toast';

// Import Productivity Dashboard Content
import { ProductivityDashboardContent } from './ProductivityDashboard';

// --- MAIN TEAM PAGE ---
const Team: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [statuses, setStatuses] = useState<TaskStatus[]>([]);
    const [clients, setClients] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUserFilter, setSelectedUserFilter] = useState<string>('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [usersData, tasksData, statusesData, clientsData] = await Promise.all([
                usersApi.getUsers(),
                productivityApi.getTasks(),
                productivityApi.getStatuses(),
                clientiApi.getClienti()
            ]);
            setUsers(usersData);
            setTasks(tasksData);
            setStatuses(statusesData);
            setClients(clientsData);
        } catch (e: any) {
            console.error(e);
            setError(e.message);
            toast.error("Errore caricamento dati");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading && users.length === 0) {
        return (
            <Page fullWidth>
                <Box padding="800">
                    <InlineStack align="center">
                        <Spinner size="large" />
                    </InlineStack>
                </Box>
            </Page>
        );
    }

    return (
        <Page 
            title="Team" 
            subtitle="Dashboard produttività e gestione team"
            fullWidth
            primaryAction={
                <Button onClick={fetchData} icon={ClockIcon}>
                    Aggiorna Dati
                </Button>
            }
        >
            <Layout>
                {error && (
                    <Layout.Section>
                        <Banner tone="critical" onDismiss={() => setError(null)}>
                            {error}
                        </Banner>
                    </Layout.Section>
                )}
                
                <Layout.Section>
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
                    />
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default Team;
