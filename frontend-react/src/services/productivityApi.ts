// Service Layer per Productivity Service
import { getServiceUrl } from '../utils/apiConfig';

const API_BASE_URL = getServiceUrl('productivity');

export interface Attachment {
    name: string;
    url: string;
    drive_file_id?: string;
    mime_type?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string; // Ora è una stringa dinamica, non più un enum fisso
  assignee_id?: string;
  role_required?: string;
  project_id?: string; // Client ID
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_minutes: number;
  due_date?: string;
  icon?: string;
  category_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  dependencies: string[]; // ID dei task bloccanti
  metadata?: Record<string, any>;
  attachments?: Attachment[];
}

export interface TaskCreate {
  title: string;
  description?: string;
  project_id?: string;
  assignee_id?: string;
  role_required?: string;
  priority?: string;
  due_date?: string;
  icon?: string;
  category_id?: string;
  attachments?: Attachment[];
}

export interface TaskUpdate {
    title?: string;
    description?: string;
    status?: string;
    assignee_id?: string;
    priority?: string;
    due_date?: string;
    icon?: string;
    category_id?: string;
    attachments?: Attachment[];
}

export interface DriveAction {
    type: 'create_folder' | 'upload_file' | 'share_folder';
    config: {
        folder_name?: string;
        parent_folder_id?: string;
        folder_id?: string;
        email?: string;
        role?: string;
    };
}

export interface TaskDefinition {
    title: string;
    role_required?: string;
    estimated_minutes?: number;
    relative_start_days?: number;
    dependencies_on_prev?: boolean;
    description?: string;
    icon?: string;
    drive_actions?: DriveAction[]; // Azioni Google Drive da eseguire
    metadata?: Record<string, any>;
}

export interface WorkflowTemplate {
    id: string;
    name: string;
    description?: string;
    trigger_type?: string; // 'manual', 'event', 'pipeline_stage'
    trigger_event?: string; // 'client_created', 'contract_signed', 'lead_stage_changed'
    entity_type?: string; // 'client' o 'lead'
    trigger_pipeline_stage?: string; // Stage della pipeline (es. 'optin', 'prima_chiamata')
    trigger_services: string[];
    tasks_definition: TaskDefinition[];
}

export interface CreateWorkflowTemplate {
    name: string;
    description?: string;
    trigger_services?: string[];
    trigger_type?: string;
    trigger_event?: string;
    entity_type?: string;
    trigger_pipeline_stage?: string;
    tasks_definition: TaskDefinition[];
}

export interface UpdateWorkflowTemplate {
    name?: string;
    description?: string;
    trigger_services?: string[];
    trigger_type?: string;
    trigger_event?: string;
    entity_type?: string;
    trigger_pipeline_stage?: string;
    tasks_definition?: TaskDefinition[];
}

export interface TaskStatus {
    id: string;
    label: string;
    color: string;
    is_default: boolean;
    position: number;
}

export interface TaskCategory {
  id: string;
  label: string;
  tone: 'critical' | 'warning' | 'success' | 'info' | 'base';
  keywords: string[];
  icon?: string;
  order_index?: number;
  is_system?: boolean;
}

export interface TaskCategoryCreate {
  label: string;
  tone: string;
  keywords: string[];
  icon?: string;
}

class ProductivityApiService {
  private async getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Token di autenticazione non trovato');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }

  // --- CATEGORIES ---
  async getTaskCategories(): Promise<TaskCategory[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/task-categories`, { headers });
    if (!response.ok) throw new Error('Errore caricamento categorie');
    return await response.json();
  }

  async createTaskCategory(cat: TaskCategoryCreate): Promise<TaskCategory> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/task-categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify(cat)
    });
    if (!response.ok) throw new Error('Errore creazione categoria');
    return await response.json();
  }

  async updateTaskCategory(id: string, cat: TaskCategoryCreate): Promise<TaskCategory> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/task-categories/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(cat)
    });
    if (!response.ok) throw new Error('Errore aggiornamento categoria');
    return await response.json();
  }

  async deleteTaskCategory(id: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/task-categories/${id}`, {
        method: 'DELETE',
        headers
    });
    if (!response.ok) throw new Error('Errore eliminazione categoria');
  }
  // --- END CATEGORIES ---

  async getTasks(filters?: { project_id?: string; assignee_id?: string; role?: string; exclude_completed?: boolean; _t?: number }): Promise<Task[]> {
    const headers = await this.getAuthHeaders();
    const queryParams = new URLSearchParams();
    if (filters?.project_id) queryParams.append('project_id', filters.project_id);
    if (filters?.assignee_id) queryParams.append('assignee_id', filters.assignee_id);
    if (filters?.role) queryParams.append('role', filters.role);
    if (filters?.exclude_completed) queryParams.append('exclude_completed', 'true');
    // Cache busting param
    queryParams.append('_t', String(filters?._t || new Date().getTime()));

    const response = await fetch(`${API_BASE_URL}/api/tasks?${queryParams.toString()}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore caricamento tasks: ${response.status}`;
      try {
        const json = JSON.parse(text);
        errorMessage = json.detail || json.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }
    return await response.json();
  }

  async createTask(task: TaskCreate): Promise<Task> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(task),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Errore creazione task: ${response.status} - ${text}`);
    }
    return await response.json();
  }

  async updateTask(taskId: string, update: TaskUpdate): Promise<Task> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(update)
      });

      if (!response.ok) {
          throw new Error(`Errore aggiornamento task: ${response.status}`);
      }
      return await response.json();
  }

  async deleteTask(taskId: string): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
          method: 'DELETE',
          headers
      });

      if (!response.ok) {
          throw new Error(`Errore eliminazione task: ${response.status}`);
      }
  }
  
  async addAttachment(taskId: string, attachment: Attachment): Promise<Task> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/attachments`, {
          method: 'POST',
          headers,
          body: JSON.stringify(attachment)
      });
      
      if (!response.ok) {
          throw new Error(`Errore aggiunta allegato: ${response.status}`);
      }
      return await response.json();
  }

  async deleteTasks(): Promise<void> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/tasks/all`, {
        method: 'DELETE',
        headers
    });
    if (!response.ok) {
        throw new Error('Errore nella pulizia dei task');
    }
  }

  async bulkDeleteTasks(taskIds: string[]): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/bulk/delete`, {
          method: 'POST',
          headers,
          body: JSON.stringify(taskIds)
      });
      if (!response.ok) {
          throw new Error('Errore cancellazione massiva');
      }
  }

  async bulkUpdateTasks(taskIds: string[], update: TaskUpdate): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/bulk/update`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
              task_ids: taskIds,
              update_data: update // Nota: backend aspetta task_ids e update_data come argomenti separati nel body se non uso modello wrapper
          })
      });
      
      if (!response.ok) {
          const text = await response.text();
          throw new Error(`Errore aggiornamento massivo: ${text}`);
      }
  }

  async getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/workflows/templates`, {
          method: 'GET',
          headers
      });
      if (!response.ok) throw new Error('Errore caricamento template');
      return await response.json();
  }

  async instantiateWorkflow(templateId: string, projectId: string, startDate?: string): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/workflows/instantiate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
              template_id: templateId,
              project_id: projectId,
              start_date: startDate
          })
      });
      if (!response.ok) throw new Error('Errore avvio workflow');
  }

  async getWorkflowTemplate(templateId: string): Promise<WorkflowTemplate> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/workflows/templates/${templateId}`, {
          method: 'GET',
          headers
      });
      if (!response.ok) throw new Error('Errore caricamento template');
      return await response.json();
  }

  async createWorkflowTemplate(template: CreateWorkflowTemplate): Promise<WorkflowTemplate> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/workflows/templates`, {
          method: 'POST',
          headers,
          body: JSON.stringify(template)
      });
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Errore creazione template');
      }
      return await response.json();
  }

  async updateWorkflowTemplate(templateId: string, update: UpdateWorkflowTemplate): Promise<WorkflowTemplate> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/workflows/templates/${templateId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(update)
      });
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Errore aggiornamento template');
      }
      return await response.json();
  }

  async deleteWorkflowTemplate(templateId: string): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/workflows/templates/${templateId}`, {
          method: 'DELETE',
          headers
      });
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Errore eliminazione template');
      }
  }

  // --- STATUS MANAGEMENT ---
  
  async getStatuses(): Promise<TaskStatus[]> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/statuses`, { method: 'GET', headers });
      if (!response.ok) throw new Error('Errore caricamento status');
      return await response.json();
  }

  async createStatus(status: {id: string, label: string, color: string}): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/statuses`, { 
          method: 'POST', 
          headers,
          body: JSON.stringify(status)
      });
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Errore creazione status');
      }
  }

  async deleteStatus(statusId: string): Promise<void> {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/statuses/${statusId}`, { method: 'DELETE', headers });
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Errore cancellazione status');
      }
  }

  calculateStats(tasks: Task[]) {
      const total = tasks.length;
      const completed = tasks.filter(t => t.status === 'done').length; // 'done' ID is conventionally used for completed
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const todo = tasks.filter(t => t.status === 'todo').length;
      
      return { total, completed, inProgress, todo };
  }
}

export const productivityApi = new ProductivityApiService();
