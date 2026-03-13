import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import LabManagementActions from '../LabManagementActions';

describe('LabManagementActions', () => {
  const newLabStructure = {
    name: '',
    category: '',
    keywords: [],
    price: '',
    description: '',
    provider: '',
    auth: '',
    accessURI: '',
    accessKey: '',
    timeSlots: [],
    opens: 0,
    closes: 0,
    docs: [],
    images: [],
    uri: ''
  };

  it('renders the Add New Lab button', () => {
    const { getByText } = render(
      <LabManagementActions
        onAddNewLab={jest.fn()}
        newLabStructure={newLabStructure}
        setNewLab={jest.fn()}
        setIsModalOpen={jest.fn()}
        setSelectedLabId={jest.fn()}
      />
    );
    expect(getByText('Add New Lab')).toBeInTheDocument();
  });

  it('calls all setters and onAddNewLab when button is clicked', () => {
    const setNewLab = jest.fn();
    const setIsModalOpen = jest.fn();
    const setSelectedLabId = jest.fn();
    const onAddNewLab = jest.fn();
    const { getByText } = render(
      <LabManagementActions
        onAddNewLab={onAddNewLab}
        newLabStructure={newLabStructure}
        setNewLab={setNewLab}
        setIsModalOpen={setIsModalOpen}
        setSelectedLabId={setSelectedLabId}
      />
    );
    fireEvent.click(getByText('Add New Lab'));
    expect(setNewLab).toHaveBeenCalledWith(newLabStructure);
    expect(setIsModalOpen).toHaveBeenCalledWith(true);
    expect(setSelectedLabId).toHaveBeenCalledWith("");
    expect(onAddNewLab).toHaveBeenCalled();
  });

  it('does not throw if onAddNewLab is not provided', () => {
    const setNewLab = jest.fn();
    const setIsModalOpen = jest.fn();
    const setSelectedLabId = jest.fn();
    const { getByText } = render(
      <LabManagementActions
        newLabStructure={newLabStructure}
        setNewLab={setNewLab}
        setIsModalOpen={setIsModalOpen}
        setSelectedLabId={setSelectedLabId}
      />
    );
    expect(() => fireEvent.click(getByText('Add New Lab'))).not.toThrow();
    expect(setNewLab).toHaveBeenCalledWith(newLabStructure);
    expect(setIsModalOpen).toHaveBeenCalledWith(true);
    expect(setSelectedLabId).toHaveBeenCalledWith("");
  });
});
