import React, { useState } from 'react';
import { LegacyCard, ResourceList, ResourceItem, Text, Button, TextField, InlineStack, BlockStack, Box, Icon } from '@shopify/polaris';
import { PlusIcon, DeleteIcon, CheckCircleIcon } from '@shopify/polaris-icons';
import type { Task } from '../../services/clientiApi';

interface ClienteTasksProps {
  tasks: Task[];
  onAdd: (task: Task) => void;
  onUpdate: (taskId: string, field: keyof Task, value: any) => void;
  onRemove: (taskId: string) => void;
}

const ClienteTasks: React.FC<ClienteTasksProps> = ({ tasks, onAdd, onUpdate, onRemove }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    const newTask: Task = {
      id: Date.now().toString(),
      titolo: newTaskTitle,
      status: 'da_fare',
      data_scadenza: new Date().toISOString().split('T')[0] // Default oggi
    };
    
    onAdd(newTask);
    setNewTaskTitle('');
  };

  const toggleStatus = (task: Task) => {
    const newStatus = task.status === 'da_fare' ? 'fatto' : 'da_fare';
    onUpdate(task.id, 'status', newStatus);
  };

  return (
    <LegacyCard title="Task da fare" sectioned>
      <BlockStack gap="400">
        <InlineStack gap="200">
          <div style={{ flex: 1 }}>
            <TextField
              label="Nuovo Task"
              labelHidden
              value={newTaskTitle}
              onChange={setNewTaskTitle}
              placeholder="Aggiungi un nuovo task..."
              autoComplete="off"
              connectedRight={
                <Button icon={PlusIcon} onClick={handleAddTask}>Aggiungi</Button>
              }
            />
          </div>
        </InlineStack>

        {tasks.length > 0 ? (
          <ResourceList
            resourceName={{ singular: 'task', plural: 'tasks' }}
            items={tasks}
            renderItem={(task) => {
              const { id, titolo, status, data_scadenza } = task;
              const isDone = status === 'fatto';

              return (
                <ResourceItem
                  id={id}
                  onClick={() => toggleStatus(task)}
                  accessibilityLabel={`Segna come ${isDone ? 'da fare' : 'fatto'}`}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="400" blockAlign="center">
                      <div 
                        onClick={(e) => { e.stopPropagation(); toggleStatus(task); }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                         {isDone ? (
                           <div style={{ color: 'var(--p-color-text-success)' }}>
                             <Icon source={CheckCircleIcon} tone="success" />
                           </div>
                         ) : (
                           <div style={{ 
                             width: '20px', 
                             height: '20px', 
                             borderRadius: '50%', 
                             border: '2px solid var(--p-color-border-strong)',
                             margin: '2px' 
                            }} 
                           />
                         )}
                      </div>
                      <div style={{ textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>
                        <Text as="span" variant="bodyMd" fontWeight="bold">{titolo}</Text>
                        {data_scadenza && (
                            <Text as="p" variant="bodySm" tone="subdued">Scadenza: {data_scadenza}</Text>
                        )}
                      </div>
                    </InlineStack>
                    
                    <div onClick={(e) => e.stopPropagation()}>
                        <Button 
                            icon={DeleteIcon} 
                            variant="plain" 
                            tone="critical" 
                            onClick={() => onRemove(id)} 
                        />
                    </div>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        ) : (
          <Box padding="400" background="bg-surface-secondary" borderRadius="200">
            <Text as="p" alignment="center" tone="subdued">Nessun task presente.</Text>
          </Box>
        )}
      </BlockStack>
    </LegacyCard>
  );
};

export default ClienteTasks;
