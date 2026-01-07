/**
 * Test helpers for filling lab forms
 * Provides reusable functions to interact with lab form fields
 */
import { fireEvent, screen, within, waitFor } from '@testing-library/react';

/**
 * Fills all required fields in the Full Setup lab form
 *
 * @param {Object} labData - Complete lab data object
 * @returns {Promise<void>}
 */
export const fillFullSetupForm = async (labData) => {
  // Basic Information
  const nameInput = screen.getByPlaceholderText(/lab name/i);
  const categoryInput = screen.getByTestId('category-multiselect');
  const keywordsInput = screen.getByPlaceholderText(/keywords/i);
  const descriptionTextarea = screen.getByPlaceholderText(/description/i);
  const priceInput = screen.getByPlaceholderText(/price/i);

  fireEvent.change(nameInput, { target: { value: labData.name } });
  // For multi-select, we need to simulate clicks on the dropdown and select options
  fireEvent.click(categoryInput);
  // Wait for dropdown to open and select categories
  await waitFor(() => {
    const dropdown = screen.getByRole('listbox');
    expect(dropdown).toBeInTheDocument();
  });
  
  // Select categories from the dropdown
  if (Array.isArray(labData.category)) {
    const dropdown = screen.getByRole('listbox');
    for (const category of labData.category) {
      const categoryOption = within(dropdown).getByText(category);
      fireEvent.click(categoryOption);
    }
  }
  
  fireEvent.change(keywordsInput, {
    target: { value: labData.keywords.join(',') }
  });
  fireEvent.change(descriptionTextarea, {
    target: { value: labData.description }
  });
  fireEvent.change(priceInput, { target: { value: labData.price } });

  // Access Configuration
  const accessURIInput = screen.getByPlaceholderText(/access uri/i);
  const accessKeyInput = screen.getByPlaceholderText(/access key/i);

  fireEvent.change(accessURIInput, { target: { value: labData.accessURI } });
  fireEvent.change(accessKeyInput, { target: { value: labData.accessKey } });

  // Dates - Using mock DatePicker (type="date")
  try {
    const dateInputs = screen.queryAllByTestId('mock-date-picker');
    if (dateInputs.length >= 2) {
      fireEvent.change(dateInputs[0], { target: { value: labData.opens } });
      fireEvent.change(dateInputs[1], { target: { value: labData.closes } });
    }
  } catch (e) {
    console.warn('Could not fill date inputs:', e.message);
  }

  // Time Slots
  const timeSlotsInput = screen.getByPlaceholderText(/15, 30, 60/i);
  fireEvent.change(timeSlotsInput, {
    target: { value: labData.timeSlots.join(', ') }
  });

  // Available Days - Click buttons for each day
  labData.availableDays.forEach((day) => {
    const dayAbbrev = day.substring(0, 3); // MON, TUE, etc.
    const dayButton = screen.getByRole('button', {
      name: new RegExp(dayAbbrev, 'i')
    });
    fireEvent.click(dayButton);
  });

  // Available Hours
  const timeInputs = document.querySelectorAll('input[type="time"]');
  if (timeInputs.length >= 2) {
    fireEvent.change(timeInputs[0], {
      target: { value: labData.availableHours.start }
    });
    fireEvent.change(timeInputs[1], {
      target: { value: labData.availableHours.end }
    });
  }

  // Max Concurrent Users
  const maxUsersInput = screen.getByPlaceholderText(/concurrent users/i);
  fireEvent.change(maxUsersInput, {
    target: { value: labData.maxConcurrentUsers.toString() }
  });

  // Terms of Use
  if (labData.termsOfUse?.url) {
    const termsUrlInput = screen.getByPlaceholderText(/terms url/i);
    fireEvent.change(termsUrlInput, {
      target: { value: labData.termsOfUse.url }
    });
  }
};

/**
 * Fills required fields in the Quick Setup lab form
 *
 * @param {Object} labData - Quick setup lab data
 * @returns {Promise<void>}
 */
export const fillQuickSetupForm = async (labData) => {
  const priceInput = screen.getByPlaceholderText(/price/i);
  const accessURIInput = screen.getByPlaceholderText(/access uri/i);
  const accessKeyInput = screen.getByPlaceholderText(/access key/i);
  const uriInput = screen.getByPlaceholderText(/lab data url/i);

  fireEvent.change(priceInput, { target: { value: labData.price } });
  fireEvent.change(accessURIInput, { target: { value: labData.accessURI } });
  fireEvent.change(accessKeyInput, { target: { value: labData.accessKey } });
  fireEvent.change(uriInput, { target: { value: labData.uri } });
};

/**
 * Submits the lab form
 *
 * @returns {Promise<void>}
 */
export const submitLabForm = async () => {
  const submitButton = screen.getByRole('button', { name: /add lab|save|update/i });
  fireEvent.click(submitButton);
};
