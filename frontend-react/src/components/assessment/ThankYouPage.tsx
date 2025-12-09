import React from 'react';

interface ThankYouPageProps {
  visible: boolean;
}

const ThankYouPage: React.FC<ThankYouPageProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="thank-you-page">
      <div className="thank-you-content">
        <div className="success-icon">✅</div>
        <h2 className="thank-you-title">Questionario Inviato!</h2>
        <p className="thank-you-message">
          Grazie mille per aver compilato il questionario, seguiranno aggiornamenti
        </p>
      </div>
    </div>
  );
};

export default ThankYouPage;
