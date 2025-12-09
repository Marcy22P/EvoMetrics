// Utility per gestire le notifiche toast
interface ToastOptions {
  type: 'loading' | 'success' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
  showSpinner?: boolean;
}

export class ToastManager {
  private static toasts: Map<string, HTMLElement> = new Map();

  static show(id: string, options: ToastOptions): void {
    // Rimuovi toast esistente con stesso ID
    this.remove(id);

    const toast = document.createElement('div');
    
    // Configura contenuto
    const hasMessage = options.message && options.message.length > 0;
    const spinner = options.showSpinner ? `
      <div class="toast-spinner" style="width: 20px; height: 20px; border: 2px solid #ffffff40; border-top: 2px solid #ffffff; border-radius: 50%; animation: toastSpin 1s linear infinite;"></div>
    ` : '';

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        ${spinner}
        <div>
          <div style="font-weight: bold;">${options.title}</div>
          ${hasMessage ? `<div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">${options.message}</div>` : ''}
        </div>
      </div>
      ${options.showSpinner ? `
        <style>
          @keyframes toastSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .toast-spinner {
            flex-shrink: 0;
          }
        </style>
      ` : ''}
    `;

    // Configura stile base
    const baseStyle = `
      position: fixed;
      top: 20px;
      right: 20px;
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      z-index: 9999;
      font-family: Arial, sans-serif;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
      max-width: 400px;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease-out;
    `;

    // Configura colori per tipo
    let backgroundStyle = '';
    let shadowColor = '';
    
    switch (options.type) {
      case 'loading':
        backgroundStyle = 'background: linear-gradient(135deg, #007acc, #0056b3);';
        shadowColor = 'rgba(0,122,204,0.3)';
        break;
      case 'success':
        backgroundStyle = 'background: linear-gradient(135deg, #28a745, #20c997);';
        shadowColor = 'rgba(40,167,69,0.3)';
        break;
      case 'error':
        backgroundStyle = 'background: linear-gradient(135deg, #dc3545, #c82333);';
        shadowColor = 'rgba(220,53,69,0.3)';
        break;
      case 'info':
        backgroundStyle = 'background: linear-gradient(135deg, #17a2b8, #138496);';
        shadowColor = 'rgba(23,162,184,0.3)';
        break;
    }

    toast.style.cssText = `
      ${baseStyle}
      ${backgroundStyle}
      box-shadow: 0 8px 32px ${shadowColor};
    `;

    document.body.appendChild(toast);
    this.toasts.set(id, toast);

    // Animazione di entrata
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    // Auto-remove se specificato
    if (options.duration && options.duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, options.duration);
    }
  }

  static remove(id: string): void {
    const toast = this.toasts.get(id);
    if (toast && document.body.contains(toast)) {
      // Animazione di uscita
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
      
      this.toasts.delete(id);
    }
  }

  static update(id: string, options: Partial<ToastOptions>): void {
    const toast = this.toasts.get(id);
    if (toast) {
      const currentType = toast.style.background.includes('007acc') ? 'loading' :
                          toast.style.background.includes('28a745') ? 'success' :
                          toast.style.background.includes('dc3545') ? 'error' : 'info';
      
      const newOptions: ToastOptions = {
        type: options.type || currentType,
        title: options.title || '',
        message: options.message,
        duration: options.duration,
        showSpinner: options.showSpinner
      };
      
      this.remove(id);
      this.show(id, newOptions);
    }
  }
}

// Shorthand methods
export const toast = {
  loading: (title: string, message?: string) => 
    ToastManager.show('current', { type: 'loading', title, message, showSpinner: true }),
  
  success: (title: string, message?: string, duration = 4000) => 
    ToastManager.show('current', { type: 'success', title, message, duration }),
  
  error: (title: string, message?: string, duration = 5000) => 
    ToastManager.show('current', { type: 'error', title, message, duration }),
  
  info: (title: string, message?: string, duration = 3000) => 
    ToastManager.show('current', { type: 'info', title, message, duration }),
    
  remove: () => ToastManager.remove('current'),
  
  update: (title: string, message?: string) => 
    ToastManager.update('current', { title, message })
};

// Funzione di convenienza per showToast
export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'loading' = 'info') => {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'loading':
      toast.loading(message);
      break;
    default:
      toast.info(message);
  }
};
