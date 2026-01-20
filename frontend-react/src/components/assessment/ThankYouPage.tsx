import React from 'react';

interface ThankYouPageProps {
  visible: boolean;
}

const ThankYouPage: React.FC<ThankYouPageProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="thank-you-page">
      <div className="thank-you-content">
        <div className="success-icon">
          <svg 
            width="80" 
            height="80" 
            viewBox="0 0 80 80" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="40" cy="40" r="38" stroke="#22c55e" strokeWidth="4" fill="#dcfce7"/>
            <path 
              d="M25 42L35 52L55 28" 
              stroke="#22c55e" 
              strokeWidth="5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <h2 className="thank-you-title">Questionario Inviato!</h2>
        <p className="thank-you-message">
          Grazie mille per aver compilato il questionario. 
          <br /><br />
          Il nostro team analizzerà le tue risposte e ti contatterà presto con una proposta personalizzata.
        </p>
      </div>
    </div>
  );
};

export default ThankYouPage;
