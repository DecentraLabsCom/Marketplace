/**
 * Unit Tests for LabDetail FMU metadata section
 *
 * Tested Behaviors:
 * - FMU metadata section renders when resource is FMU type
 * - FMU metadata section does NOT render for regular labs
 * - Button text changes: "Book Simulation" vs "Book Lab"
 * - Navigation target uses /reservation/[id] for both lab and FMU
 * - Model variables table renders when present
 */

import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import LabDetail from "../LabDetail";

// Mocks
jest.mock("@/hooks/lab/useLabs");
jest.mock("@/context/LabCreditContext");
jest.mock("next/navigation");
jest.mock("@/hooks/booking/useBookingAtomicQueries");

const { useLabById } = require("@/hooks/lab/useLabs");
const { useLabCredit } = require("@/context/LabCreditContext");
const { useRouter } = require("next/navigation");
const { useCheckAvailable } = require("@/hooks/booking/useBookingAtomicQueries");

// Mock UI components
jest.mock("@/components/ui", () => ({
  Container: ({ children }) => <div data-testid="container">{children}</div>,
}));
jest.mock("@/components/ui/Carrousel", () => {
  return function MockCarrousel() {
    return <div data-testid="carrousel" />;
  };
});
jest.mock("@/components/ui/DocsCarrousel", () => {
  return function MockDocsCarrousel() {
    return <div data-testid="docs-carrousel" />;
  };
});
jest.mock("@/components/skeletons", () => ({
  LabHeroSkeleton: () => <div data-testid="skeleton" />,
}));

const mockPush = jest.fn();

const baseLab = {
  id: "42",
  name: "Test Lab",
  description: "A test lab",
  provider: "0xPROVIDER",
  price: 10,
  isListed: true,
  category: "Electronics",
  keywords: ["test"],
  docs: [],
  createdAt: Math.floor(Date.now() / 1000),
  reputation: { score: 4, totalEvents: 2, ownerCancellations: 0, lastUpdated: 0 },
  providerInfo: { country: "US" },
};

const fmuLab = {
  ...baseLab,
  name: "Spring-Damper FMU",
  resourceType: "fmu",
  fmuFileName: "spring-damper.fmu",
  fmiVersion: "2.0",
  simulationType: "CoSimulation",
  modelVariables: [
    { name: "mass", causality: "input", start: 1.0, unit: "kg" },
    { name: "damping", causality: "input", start: 0.5, unit: "N.s/m" },
    { name: "position", causality: "output", unit: "m" },
  ],
  defaultStartTime: 0,
  defaultStopTime: 10,
  defaultStepSize: 0.01,
};

beforeEach(() => {
  jest.clearAllMocks();
  useLabCredit.mockReturnValue({ formatPrice: (p) => `â‚¬${p}` });
  useRouter.mockReturnValue({ push: mockPush });
  useCheckAvailable.mockReturnValue({ data: null });
});

describe("LabDetail - Regular Lab (no FMU)", () => {
  beforeEach(() => {
    useLabById.mockReturnValue({
      data: baseLab,
      isLoading: false,
      isError: false,
      error: null,
      metadataError: false,
    });
  });

  test("shows 'Book Lab' button", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByRole("button", { name: /Rent Test Lab/i })).toHaveTextContent("Book Lab");
  });

  test("navigates to /reservation/ on click", () => {
    render(<LabDetail id="42" />);
    fireEvent.click(screen.getByRole("button", { name: /Rent Test Lab/i }));
    expect(mockPush).toHaveBeenCalledWith("/reservation/42");
  });

  test("does NOT show FMU Simulation Details section", () => {
    render(<LabDetail id="42" />);
    expect(screen.queryByText("FMU Simulation Details")).toBeNull();
  });
});

describe("LabDetail - FMU Resource", () => {
  beforeEach(() => {
    useLabById.mockReturnValue({
      data: fmuLab,
      isLoading: false,
      isError: false,
      error: null,
      metadataError: false,
    });
  });

  test("shows 'Book Simulation' button", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByRole("button", { name: /Book Spring-Damper FMU simulation/i })).toHaveTextContent("Book Simulation");
  });

  test("navigates to /reservation/ on click", () => {
    render(<LabDetail id="42" />);
    fireEvent.click(screen.getByRole("button", { name: /Book Spring-Damper FMU simulation/i }));
    expect(mockPush).toHaveBeenCalledWith("/reservation/42");
  });

  test("shows FMU Simulation Details section", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByText("FMU Simulation Details")).toBeInTheDocument();
  });

  test("shows FMI version and simulation type", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByText("2.0")).toBeInTheDocument();
    expect(screen.getByText("Co-Simulation")).toBeInTheDocument();
  });

  test("uses one row only when all simulation summary items fit the panel", () => {
    const observerCallbacks = [];
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class MockResizeObserver {
      constructor(callback) {
        observerCallbacks.push(callback);
      }

      observe() {}

      disconnect() {}
    };

    try {
      render(<LabDetail id="42" />);

      const summaryGrid = screen.getByTestId("fmu-summary-grid");
      Object.defineProperty(summaryGrid, "clientWidth", { configurable: true, value: 600 });
      Object.defineProperty(summaryGrid, "scrollWidth", { configurable: true, value: 590 });

      act(() => observerCallbacks[0]());
      expect(summaryGrid).toHaveClass("md:grid-cols-[repeat(4,minmax(max-content,1fr))]");

      Object.defineProperty(summaryGrid, "scrollWidth", { configurable: true, value: 601 });
      act(() => observerCallbacks[0]());
      expect(summaryGrid).not.toHaveClass("md:grid-cols-[repeat(4,minmax(max-content,1fr))]");
      expect(summaryGrid).toHaveClass("grid-cols-2");
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  test("shows model variables table with input/output badges", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByText("Model Variables")).toBeInTheDocument();
    expect(screen.getByText("mass")).toBeInTheDocument();
    expect(screen.getByText("position")).toBeInTheDocument();
    // Check causality badges
    const inputs = screen.getAllByText("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("output")).toBeInTheDocument();
  });

  test("shows FMI type, resolved dimensions, and readable vector starts", () => {
    useLabById.mockReturnValue({
      data: {
        ...fmuLab,
        modelVariables: [
          { name: "m", type: "UInt64", causality: "structuralParameter", start: "3" },
          { name: "n", type: "UInt64", causality: "structuralParameter", start: "3" },
          { name: "r", type: "UInt64", causality: "structuralParameter", start: "3" },
          {
            name: "A",
            type: "Float64",
            causality: "parameter",
            start: "1 0 0 0 1 0 0 0 1",
            dimensions: [
              { valueReference: 2, variableName: "n" },
              { valueReference: 2, variableName: "n" },
            ],
          },
          {
            name: "x0",
            type: "Float64",
            causality: "parameter",
            start: "0 0 0",
            dimensions: [{ valueReference: 2, variableName: "n" }],
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      metadataError: false,
    });

    render(<LabDetail id="42" />);

    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Shape" })).toBeInTheDocument();
    expect(screen.getAllByText("Float64")).toHaveLength(2);
    expect(screen.getByText("n × n (3 × 3)")).toBeInTheDocument();
    expect(screen.getByText("n (3)")).toBeInTheDocument();
    expect(screen.getByText("[1, 0, 0, 0, 1, 0, 0, 0, 1]")).toBeInTheDocument();
  });

  test("shows a legend only for symbolic dimensions declared by the FMU", () => {
    useLabById.mockReturnValue({
      data: {
        ...fmuLab,
        modelVariables: [
          { name: "n", start: "3" },
          {
            name: "A",
            dimensions: [
              { valueReference: 1, variableName: "n" },
              { valueReference: 1, variableName: "n" },
            ],
          },
          {
            name: "x0",
            dimensions: [{ valueReference: 1, variableName: "n" }],
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      metadataError: false,
    });

    render(<LabDetail id="42" />);

    expect(screen.getByText("Dimension relationships")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Dimension" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Referenced by" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "A, x0" })).toBeInTheDocument();
  });

  test("keeps the variable metadata area bounded and scrolls to the dimension legend", () => {
    useLabById.mockReturnValue({
      data: {
        ...fmuLab,
        modelVariables: [
          { name: "n", start: "3" },
          {
            name: "A",
            dimensions: [
              { valueReference: 1, variableName: "n" },
              { valueReference: 1, variableName: "n" },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      metadataError: false,
    });

    render(<LabDetail id="42" />);

    const scrollRegion = screen.getByTestId("fmu-variables-scroll");
    expect(scrollRegion).toHaveClass("max-h-48", "overflow-y-auto");
    expect(scrollRegion).toContainElement(screen.getByText("Dimension relationships"));
  });

  test("shows default time range", () => {
    render(<LabDetail id="42" />);
    // "0s â€“ 10s"
    const timeText = screen.getByText(/0s/);
    expect(timeText).toBeInTheDocument();
  });
});

