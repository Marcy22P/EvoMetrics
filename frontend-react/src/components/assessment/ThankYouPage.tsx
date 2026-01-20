import React from 'react';

// Icona SVG di successo
const SuccessIcon = () => (
  <svg 
    width="64" 
    height="64" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="#008060" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

interface ThankYouPageProps {
  visible: boolean;
}

const ThankYouPage: React.FC<ThankYouPageProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="thank-you-page">
      <div className="thank-you-content">
        <div className="success-icon">
          <SuccessIcon />
        </div>
        <h2 className="thank-you-title">Questionario Inviato!</h2>
        <p className="thank-you-message">
          Grazie mille per aver compilato il questionario, seguiranno aggiornamenti.
        </p>
      </div>
    </div>
  );
};

export default ThankYouPage;
