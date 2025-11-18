/**
 * Mock for react-datepicker that makes it testeable
 * Replaces the complex DatePicker component with a simple input
 * that still maintains the same onChange behavior
 */
import React from 'react';

const MockDatePicker = ({
  selected,
  onChange,
  placeholderText,
  disabled,
  minDate,
  maxDate,
  dateFormat,
  showTimeSelect,
  className,
  name,
  ...props
}) => {
  const handleChange = (e) => {
    const value = e.target.value;
    if (!value) {
      onChange(null);
      return;
    }

    // Convert string to Date object
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      onChange(date);
    }
  };

  // Convert selected Date to input value format (YYYY-MM-DD for date inputs)
  const inputValue = selected instanceof Date && !isNaN(selected.getTime())
    ? selected.toISOString().split('T')[0]
    : '';

  return (
    <input
      type="date"
      value={inputValue}
      onChange={handleChange}
      placeholder={placeholderText}
      disabled={disabled}
      className={className}
      name={name}
      data-testid="mock-date-picker"
      {...props}
    />
  );
};

export default MockDatePicker;
