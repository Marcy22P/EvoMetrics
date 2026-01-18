import React from 'react';

interface FieldProps {
  children: React.ReactNode;
  conditional?: string;
}

export const Field: React.FC<FieldProps> = ({ children, conditional }) => {
  return (
    <div className="form-field" data-conditional={conditional}>
      {children}
    </div>
  );
};

interface HintProps {
  children: React.ReactNode;
}

export const Hint: React.FC<HintProps> = ({ children }) => {
  return <small className="field-hint">{children}</small>;
};

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  id: string;
  name: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
}

export const Select: React.FC<SelectProps> = ({ id, name, options, onChange }) => {
  return (
    <select 
      id={id} 
      name={name}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

interface RadioGroupProps {
  name: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  ariaLabel?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ name, options, onChange, ariaLabel }) => {
  return (
    <div className="radio-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map(opt => (
        <label key={opt.value} className="radio-option">
          <input 
            type="radio" 
            name={name} 
            value={opt.value}
            onChange={(e) => onChange?.(e.target.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
};

interface CheckboxGroupProps {
  name: string;
  options: SelectOption[];
  onChange?: (values: string[]) => void;
}

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({ name, options, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const form = e.target.form;
    if (!form || !onChange) return;
    
    const checkboxes = form.querySelectorAll(`input[name="${name}"]:checked`);
    const values = Array.from(checkboxes).map((cb: any) => cb.value);
    onChange(values);
  };

  return (
    <div className="checkbox-group">
      {options.map(opt => (
        <label key={opt.value} className="checkbox-option">
          <input 
            type="checkbox" 
            name={name} 
            value={opt.value}
            onChange={handleChange}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
};
