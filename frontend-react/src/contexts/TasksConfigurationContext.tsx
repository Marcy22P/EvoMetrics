import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { productivityApi, type TaskCategory } from '../services/productivityApi';
import { useAuth } from '../hooks/useAuth';

interface TasksConfigurationContextType {
  categories: TaskCategory[];
  refreshCategories: () => Promise<void>;
  loading: boolean;
}

const TasksConfigurationContext = createContext<TasksConfigurationContextType | undefined>(undefined);

export const TasksConfigurationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const refreshCategories = async () => {
    if (!user) return;
    try {
      const data = await productivityApi.getTaskCategories();
      setCategories(data);
    } catch (e) {
      console.error("Failed to load task categories", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshCategories();
  }, [user]);

  return (
    <TasksConfigurationContext.Provider value={{ categories, refreshCategories, loading }}>
      {children}
    </TasksConfigurationContext.Provider>
  );
};

export const useTasksConfiguration = () => {
  const context = useContext(TasksConfigurationContext);
  if (context === undefined) {
    throw new Error('useTasksConfiguration must be used within a TasksConfigurationProvider');
  }
  return context;
};
