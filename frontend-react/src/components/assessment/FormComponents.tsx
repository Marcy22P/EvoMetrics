import React from 'react';

interface FieldProps {
  children: React.ReactNode;
  conditional?: string;
  id?: string;
}

export const Field: React.FC<FieldProps> = ({ children, conditional, id }) => {
  const className = conditional ? 'field conditional' : 'field';
  const props: any = {
    className,
    id
  };
  
  if (conditional) {
    props['data-condition'] = conditional;
    props['aria-hidden'] = true;
  }

  return (
    <div {...props}>
      {children}
    </div>
  );
};

interface NullWrapperProps {
  name: string;
}

export const NullWrapper: React.FC<NullWrapperProps> = ({ name }) => (
  <div className="null-wrapper ultra-modern-null">
    <label className="null-checkbox-container">
      <input type="checkbox" name={`${name}_null`} value="null" className="null-checkbox-input" />
      <div className="null-checkbox-visual">
        <div className="null-checkbox-glow"></div>
        <div className="null-checkbox-box">
          <svg viewBox="0 0 24 24" className="null-checkbox-icon">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </div>
      </div>
      <span className="null-checkbox-label">
        <svg viewBox="0 0 24 24" className="null-info-icon">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        Non ho i dati a disposizione per poter rispondere
      </span>
    </label>
  </div>
);

interface HintProps {
  children: React.ReactNode;
}

export const Hint: React.FC<HintProps> = ({ children }) => (
  <div className="hint">{children}</div>
);

interface RadioGroupProps {
  name: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ name, options }) => (
  <div className="radio-group ultra-modern">
    {options.map((option) => (
      <label key={option.value} className="radio-container ultra-modern-radio">
        <input type="radio" name={name} value={option.value} className="radio-input" />
        <div className="radio-visual">
          <div className="radio-glow"></div>
          <div className="radio-dot"></div>
        </div>
        <span className="radio-label">{option.label}</span>
      </label>
    ))}
  </div>
);

interface CheckboxGroupProps {
  name: string;
  options: Array<{ value: string; label: string }>;
}

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({ name, options }) => (
  <div className="checkbox-group ultra-modern">
    {options.map((option) => (
      <label key={option.value} className="checkbox-container ultra-modern-checkbox">
        <input type="checkbox" name={name} value={option.value} className="checkbox-input" />
        <div className="checkbox-visual">
          <div className="checkbox-glow"></div>
          <div className="checkbox-checkmark">
            <svg viewBox="0 0 24 24" className="checkbox-icon">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
        </div>
        <span className="checkbox-label">{option.label}</span>
      </label>
    ))}
  </div>
);

interface SelectProps {
  id: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}

export const Select: React.FC<SelectProps> = ({ id, name, options }) => (
  <select id={id} name={name}>
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

interface TextInputProps {
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  label?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ 
  name, 
  placeholder, 
  type = "text", 
  required = false,
  label 
}) => (
  <div className="input-container ultra-modern-input">
    <div className="input-wrapper">
      <input 
        type={type} 
        name={name} 
        className="ultra-input" 
        placeholder=" "
        required={required}
        id={name}
      />
      <label className="floating-label" htmlFor={name}>
        {label || placeholder}
        {required && <span className="required-star">*</span>}
      </label>
      <div className="input-glow"></div>
      <div className="input-border"></div>
    </div>
  </div>
);

interface TextAreaProps {
  name: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  label?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ 
  name, 
  placeholder, 
  rows = 4, 
  required = false,
  label 
}) => (
  <div className="input-container ultra-modern-textarea">
    <div className="textarea-wrapper">
      <textarea 
        name={name} 
        rows={rows}
        className="ultra-textarea" 
        placeholder=" "
        required={required}
        id={name}
      />
      <label className="floating-label" htmlFor={name}>
        {label || placeholder}
        {required && <span className="required-star">*</span>}
      </label>
      <div className="input-glow"></div>
      <div className="input-border"></div>
    </div>
  </div>
);
