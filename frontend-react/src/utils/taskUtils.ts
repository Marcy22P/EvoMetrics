import { 
  ClipboardIcon, 
  CameraIcon, 
  EmailIcon, 
  NoteIcon, 
  CodeIcon, 
  PaintBrushFlatIcon, 
  ChatIcon, 
  MegaphoneIcon,
  WorkIcon
} from '@shopify/polaris-icons';
import type { TaskCategory } from '../services/productivityApi';

export const TASK_ICONS_MAP: Record<string, React.FC<any>> = {
  'call': CameraIcon,
  'email': EmailIcon,
  'document': NoteIcon,
  'development': CodeIcon,
  'design': PaintBrushFlatIcon,
  'social': ChatIcon,
  'marketing': MegaphoneIcon,
  'admin': ClipboardIcon,
  'work': WorkIcon
};

export const TASK_ICONS_OPTIONS = [
    { label: 'Call', value: 'call', icon: CameraIcon },
    { label: 'Email', value: 'email', icon: EmailIcon },
    { label: 'Document', value: 'document', icon: NoteIcon },
    { label: 'Development', value: 'development', icon: CodeIcon },
    { label: 'Design', value: 'design', icon: PaintBrushFlatIcon },
    { label: 'Social', value: 'social', icon: ChatIcon },
    { label: 'Marketing', value: 'marketing', icon: MegaphoneIcon },
    { label: 'Admin', value: 'admin', icon: ClipboardIcon },
    { label: 'Work', value: 'work', icon: WorkIcon },
];

export const getTaskIcon = (iconName?: string) => {
    return (iconName && TASK_ICONS_MAP[iconName]) ? TASK_ICONS_MAP[iconName] : ClipboardIcon;
};

export interface InferredCategory {
    label: string;
    tone: string;
    type: string;
    icon?: string;  // Icona della categoria
}

export const inferTaskCategory = (
    task: { title?: string, icon?: string, extendedProps?: any, category_id?: string }, 
    categories: TaskCategory[]
): InferredCategory | null => {
    const title = (task.title || '').toLowerCase();
    const taskIcon = task.icon || task.extendedProps?.icon;
    const categoryId = task.category_id || task.extendedProps?.category_id;
    
    // Ordina categorie
    const sortedCats = [...categories].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    // 1. Priority: Explicit Category ID
    if (categoryId) {
        const found = sortedCats.find(c => c.id === categoryId);
        if (found) {
            return { label: found.label, tone: found.tone, type: found.id, icon: found.icon };
        }
    }

    for (const cat of sortedCats) {
        // Match Icon
        if (taskIcon && cat.icon === taskIcon) {
             return { label: cat.label, tone: cat.tone, type: cat.id, icon: cat.icon };
        }
        // Match Keywords
        if (cat.keywords && cat.keywords.some(k => title.includes(k.toLowerCase()))) {
             return { label: cat.label, tone: cat.tone, type: cat.id, icon: cat.icon };
        }
    }
    
    // Fallback: cerca categoria con keywords vuote (spesso usata come default 'Operativa')
    const defaultCat = sortedCats.find(c => c.keywords.length === 0);
    if (defaultCat) {
        return { label: defaultCat.label, tone: defaultCat.tone, type: defaultCat.id, icon: defaultCat.icon };
    }

    return { label: 'Generico', tone: 'base', type: 'generic', icon: 'admin' };
};

