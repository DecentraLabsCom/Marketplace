/**
 * Unit tests for ProviderLabsList component
 *
 * Tested Behaviors:
 * - Component displays loading state correctly
 * - Empty state shows helpful message when no labs
 * - Lab selector renders with all valid labs
 * - Labs with invalid IDs (NaN) are filtered out
 * - Selecting a lab calls onSelectChange handler
 * - ProviderLabItem renders when lab is selected
 * - All handlers (edit, delete, list, unlist) pass through correctly
 * - Default prop values work as expected
 * - Edge cases (undefined labs, invalid IDs) handled gracefully
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Mock ProviderLabItem component
jest.mock("@/components/dashboard/provider/ProviderLabItem", () => ({
  __esModule: true,
  default: ({ lab, onEdit, onDelete, onList, onUnlist }) => (
    <div data-testid="provider-lab-item">
      <span>Lab Item: {lab.name}</span>
      <button onClick={onEdit}>Edit Mock</button>
      <button onClick={() => onDelete(lab.id)}>Delete Mock</button>
      <button onClick={() => onList(lab.id)}>List Mock</button>
      <button onClick={() => onUnlist(lab.id)}>Unlist Mock</button>
    </div>
  ),
}));

import ProviderLabsList from "../ProviderLabsList";

// Test fixtures - represents typical labs data
const mockLabs = [
  { id: "1", name: "Physics Lab", isListed: false },
  { id: "2", name: "Chemistry Lab", isListed: true },
  { id: "3", name: "Biology Lab", isListed: false },
];

// Mock handlers - track component behavior
const mockHandlers = {
  onSelectChange: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onList: jest.fn(),
  onUnlist: jest.fn(),
};

/**
 * Helper function to render component with default props
 * Allows easy overriding of specific props for different test scenarios
 */
const renderList = (props = {}) => {
  const defaultProps = {
    ownedLabs: mockLabs,
    selectedLab: null,
    selectedLabId: "",
    isLoading: false,
    onSelectChange: mockHandlers.onSelectChange,
    onEdit: mockHandlers.onEdit,
    onDelete: mockHandlers.onDelete,
    onList: mockHandlers.onList,
    onUnlist: mockHandlers.onUnlist,
    ...props,
  };

  return render(<ProviderLabsList {...defaultProps} />);
};

describe("ProviderLabsList", () => {
  // Reset all mocks before each test to ensure test isolation
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Loading State", () => {
    test("displays loading message when isLoading is true", () => {
      renderList({ isLoading: true });

      expect(screen.getByText("Loading labs...")).toBeInTheDocument();
    });

    test("displays heading in loading state", () => {
      renderList({ isLoading: true });

      expect(
        screen.getByRole("heading", { name: /Your Labs/i })
      ).toBeInTheDocument();
    });

    test("does not render selector when loading", () => {
      renderList({ isLoading: true });

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    test("does not render lab item when loading", () => {
      renderList({ isLoading: true });

      expect(screen.queryByTestId("provider-lab-item")).not.toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    test("displays empty message when no labs exist", () => {
      renderList({ ownedLabs: [] });

      expect(
        screen.getByText(/You have no labs registered yet/)
      ).toBeInTheDocument();
    });

    test("shows helpful hint about adding new lab", () => {
      renderList({ ownedLabs: [] });

      expect(
        screen.getByText(/Press "Add New Lab" to get started/)
      ).toBeInTheDocument();
    });

    test("displays heading in empty state", () => {
      renderList({ ownedLabs: [] });

      expect(
        screen.getByRole("heading", { name: /Your Labs/i })
      ).toBeInTheDocument();
    });

    test("does not render selector when no labs", () => {
      renderList({ ownedLabs: [] });

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  describe("Lab Selector", () => {
    test("renders selector with all labs as options", () => {
      renderList();

      expect(
        screen.getByRole("option", { name: "Physics Lab" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Chemistry Lab" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Biology Lab" })
      ).toBeInTheDocument();
    });

    test("displays default placeholder option", () => {
      renderList();

      expect(
        screen.getByRole("option", { name: "Select one of your labs" })
      ).toBeInTheDocument();
    });

    test("placeholder option is disabled", () => {
      renderList();

      const placeholderOption = screen.getByRole("option", {
        name: "Select one of your labs",
      });
      expect(placeholderOption).toBeDisabled();
    });

    test("selector has correct initial value", () => {
      renderList({ selectedLabId: "2" });

      const selector = screen.getByRole("combobox");
      expect(selector).toHaveValue("2");
    });

    test("calls onSelectChange when lab is selected", async () => {
      const user = userEvent.setup();
      renderList();

      const selector = screen.getByRole("combobox");
      await user.selectOptions(selector, "2");

      expect(mockHandlers.onSelectChange).toHaveBeenCalled();
    });
  });

  describe("Lab Filtering", () => {
    test("filters out labs with NaN id", () => {
      const labsWithInvalidId = [
        { id: "1", name: "Valid Lab 1" },
        { id: NaN, name: "Invalid Lab" },
        { id: "2", name: "Valid Lab 2" },
      ];

      renderList({ ownedLabs: labsWithInvalidId });

      expect(
        screen.getByRole("option", { name: "Valid Lab 1" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Valid Lab 2" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Invalid Lab" })
      ).not.toBeInTheDocument();
    });

    test("filters out labs with string id that converts to NaN", () => {
      const labsWithInvalidId = [
        { id: "1", name: "Valid Lab" },
        { id: "not-a-number", name: "Invalid Lab" },
      ];

      renderList({ ownedLabs: labsWithInvalidId });

      expect(
        screen.getByRole("option", { name: "Valid Lab" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Invalid Lab" })
      ).not.toBeInTheDocument();
    });

    test("accepts numeric string IDs", () => {
      renderList();

      // All mockLabs have string IDs like '1', '2', '3' which are valid
      expect(
        screen.getByRole("option", { name: "Physics Lab" })
      ).toBeInTheDocument();
    });
  });

  describe("Selected Lab Display", () => {
    test("renders ProviderLabItem when lab is selected", () => {
      const selectedLab = mockLabs[0];
      renderList({ selectedLab });

      expect(screen.getByTestId("provider-lab-item")).toBeInTheDocument();
      expect(screen.getByText("Lab Item: Physics Lab")).toBeInTheDocument();
    });

    test("does not render ProviderLabItem when no lab selected", () => {
      renderList({ selectedLab: null });

      expect(screen.queryByTestId("provider-lab-item")).not.toBeInTheDocument();
    });

    test("passes correct lab prop to ProviderLabItem", () => {
      const selectedLab = mockLabs[1];
      renderList({ selectedLab });

      expect(screen.getByText("Lab Item: Chemistry Lab")).toBeInTheDocument();
    });
  });

  describe("Handler Propagation", () => {
    test("passes onEdit handler to ProviderLabItem", async () => {
      const user = userEvent.setup();
      const selectedLab = mockLabs[0];
      renderList({ selectedLab });

      await user.click(screen.getByText("Edit Mock"));

      expect(mockHandlers.onEdit).toHaveBeenCalled();
      expect(mockHandlers.onEdit).toHaveBeenCalledTimes(1);
    });

    test("passes onDelete handler to ProviderLabItem", async () => {
      const user = userEvent.setup();
      const selectedLab = mockLabs[0];
      renderList({ selectedLab });

      await user.click(screen.getByText("Delete Mock"));

      expect(mockHandlers.onDelete).toHaveBeenCalledWith("1");
      expect(mockHandlers.onDelete).toHaveBeenCalledTimes(1);
    });

    test("passes onList handler to ProviderLabItem", async () => {
      const user = userEvent.setup();
      const selectedLab = mockLabs[0];
      renderList({ selectedLab });

      await user.click(screen.getByText("List Mock"));

      expect(mockHandlers.onList).toHaveBeenCalledWith("1");
      expect(mockHandlers.onList).toHaveBeenCalledTimes(1);
    });

    test("passes onUnlist handler to ProviderLabItem", async () => {
      const user = userEvent.setup();
      const selectedLab = mockLabs[0];
      renderList({ selectedLab });

      await user.click(screen.getByText("Unlist Mock"));

      expect(mockHandlers.onUnlist).toHaveBeenCalledWith("1");
      expect(mockHandlers.onUnlist).toHaveBeenCalledTimes(1);
    });
  });

  describe("Default Props", () => {
    test("uses empty array as default for ownedLabs", () => {
      render(
        <ProviderLabsList
          onSelectChange={mockHandlers.onSelectChange}
          onEdit={mockHandlers.onEdit}
          onDelete={mockHandlers.onDelete}
          onList={mockHandlers.onList}
          onUnlist={mockHandlers.onUnlist}
        />
      );

      expect(
        screen.getByText(/You have no labs registered yet/)
      ).toBeInTheDocument();
    });

    test("uses false as default for isLoading", () => {
      render(
        <ProviderLabsList
          ownedLabs={mockLabs}
          onSelectChange={mockHandlers.onSelectChange}
          onEdit={mockHandlers.onEdit}
          onDelete={mockHandlers.onDelete}
          onList={mockHandlers.onList}
          onUnlist={mockHandlers.onUnlist}
        />
      );

      expect(screen.queryByText("Loading labs...")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    test("uses null as default for selectedLab", () => {
      render(
        <ProviderLabsList
          ownedLabs={mockLabs}
          onSelectChange={mockHandlers.onSelectChange}
          onEdit={mockHandlers.onEdit}
          onDelete={mockHandlers.onDelete}
          onList={mockHandlers.onList}
          onUnlist={mockHandlers.onUnlist}
        />
      );

      expect(screen.queryByTestId("provider-lab-item")).not.toBeInTheDocument();
    });

    test("uses empty string as default for selectedLabId", () => {
      render(
        <ProviderLabsList
          ownedLabs={mockLabs}
          onSelectChange={mockHandlers.onSelectChange}
          onEdit={mockHandlers.onEdit}
          onDelete={mockHandlers.onDelete}
          onList={mockHandlers.onList}
          onUnlist={mockHandlers.onUnlist}
        />
      );

      const selector = screen.getByRole("combobox");
      expect(selector).toHaveValue("");
    });
  });

  describe("Edge Cases", () => {
    test("handles labs with numeric IDs", () => {
      const labsWithNumericIds = [
        { id: 1, name: "Lab One" },
        { id: 2, name: "Lab Two" },
      ];

      renderList({ ownedLabs: labsWithNumericIds });

      expect(
        screen.getByRole("option", { name: "Lab One" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Lab Two" })
      ).toBeInTheDocument();
    });

    test("handles undefined ownedLabs gracefully with default", () => {
      render(
        <ProviderLabsList
          ownedLabs={undefined}
          onSelectChange={mockHandlers.onSelectChange}
          onEdit={mockHandlers.onEdit}
          onDelete={mockHandlers.onDelete}
          onList={mockHandlers.onList}
          onUnlist={mockHandlers.onUnlist}
        />
      );

      // Should use default empty array and show empty state
      expect(
        screen.getByText(/You have no labs registered yet/)
      ).toBeInTheDocument();
    });

    test("handles very long lab names without breaking layout", () => {
      const labWithLongName = {
        id: "999",
        name: "This Is A Very Long Laboratory Name That Should Not Break The Component Layout Or Cause Any Issues With The Display",
      };

      renderList({ ownedLabs: [labWithLongName] });

      expect(
        screen.getByRole("option", {
          name: /This Is A Very Long Laboratory Name/,
        })
      ).toBeInTheDocument();
    });

    test("renders correctly with single lab", () => {
      renderList({ ownedLabs: [mockLabs[0]] });

      expect(
        screen.getByRole("option", { name: "Physics Lab" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Chemistry Lab" })
      ).not.toBeInTheDocument();
    });

    test("handles mixed valid and invalid lab IDs", () => {
      const mixedLabs = [
        { id: "1", name: "Valid 1" },
        { id: NaN, name: "Invalid NaN" },
        { id: "2", name: "Valid 2" },
        { id: "abc", name: "Invalid String" },
        { id: 3, name: "Valid 3" },
      ];

      renderList({ ownedLabs: mixedLabs });

      expect(
        screen.getByRole("option", { name: "Valid 1" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Valid 2" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Valid 3" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Invalid NaN" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Invalid String" })
      ).not.toBeInTheDocument();
    });
  });
});
