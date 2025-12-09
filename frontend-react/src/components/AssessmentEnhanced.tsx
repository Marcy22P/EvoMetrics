import React from 'react';

// Simple SectionHeader component
export const SectionHeader: React.FC<{ 
  title: string; 
  icon: React.ReactNode; 
  subtitle?: string;
  isCompleted?: boolean;
}> = ({ title, icon, subtitle, isCompleted = false }) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    gap: '0.5rem',
    padding: '1rem',
    background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    marginBottom: '1rem',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 0 30px rgba(255,255,255,0.1)'
  }}>
    {icon}
    <div>
      <h3 style={{ margin: 0, color: '#ffffff', fontWeight: '600' }}>{title}</h3>
      {subtitle && <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>{subtitle}</p>}
    </div>
    {isCompleted && <span style={{ color: '#ffffff' }}>✓</span>}
  </div>
);

// Simple step icon function
export const getStepIcon = (step: number, isCompleted: boolean = false) => (
  <div style={{
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: isCompleted 
      ? 'linear-gradient(145deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))'
      : 'linear-gradient(145deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    border: '1px solid rgba(255,255,255,0.2)',
    boxShadow: '0 2px 10px rgba(255,255,255,0.1)'
  }}>
    {isCompleted ? '✓' : step + 1}
  </div>
);

// Section data array - returns array of sections
export const getSectionData = () => [
  { title: 'Anagrafica', subtitle: 'Informazioni di base', icon: '👤' },
  { title: 'Presenza Online', subtitle: 'Situazione attuale digitale', icon: '🌐' },
  { title: 'Obiettivi', subtitle: 'Cosa vuoi raggiungere', icon: '🎯' },
  { title: 'Marketing', subtitle: 'Strategie di promozione', icon: '📢' },
  { title: 'Dati e Strumenti', subtitle: 'Tracciamento e analytics', icon: '📊' },
  { title: 'Budget', subtitle: 'Investimento disponibile', icon: '💰' },
  { title: 'Priorità', subtitle: 'Cosa è più importante', icon: '⭐' }
];

export default {
  SectionHeader,
  getStepIcon,
  getSectionData
};
