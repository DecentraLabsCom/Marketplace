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
import { render, screen, fireEvent } from "@testing-library/react";
import LabDetail from "../LabDetail";

// Mocks
jest.mock("@/hooks/lab/useLabs");
jest.mock("@/context/LabTokenContext");
jest.mock("next/navigation");

const { useLabById } = require("@/hooks/lab/useLabs");
const { useLabToken } = require("@/context/LabTokenContext");
const { useRouter } = require("next/navigation");

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
  reputation: { score: 4, totalEvents: 2, ownerCancellations: 0, institutionalCancellations: 0, lastUpdated: 0 },
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
  useLabToken.mockReturnValue({ formatPrice: (p) => `€${p}` });
  useRouter.mockReturnValue({ push: mockPush });
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
    expect(screen.getByText(/Compatible with FMI 2\.0\.3 Co-Simulation/i)).toBeInTheDocument();
  });

  test("shows FMI version and simulation type", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByText("2.0")).toBeInTheDocument();
    expect(screen.getByText("CoSimulation")).toBeInTheDocument();
  });

  test("shows FMU filename", () => {
    render(<LabDetail id="42" />);
    expect(screen.getByText("spring-damper.fmu")).toBeInTheDocument();
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

  test("shows default time range", () => {
    render(<LabDetail id="42" />);
    // "0s – 10s"
    const timeText = screen.getByText(/0s/);
    expect(timeText).toBeInTheDocument();
  });
});
