/**
 * Unit Tests for Simulation components
 *
 * Tests for:
 * - SimulationRunner states (idle, running, completed, error)
 * - ParameterForm input rendering and changes
 * - SimulationOptions fields
 * - ResultsChart and ResultsTable data display
 * - DownloadButtons trigger
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mocks
jest.mock("@/hooks/lab/useLabs", () => ({
  useLabById: jest.fn(),
}));
jest.mock("@/context/LabTokenContext", () => ({
  useLabToken: jest.fn(() => ({ formatPrice: (p) => `€${p}` })),
}));
jest.mock("@/components/skeletons", () => ({
  LabHeroSkeleton: () => <div data-testid="skeleton" />,
}));
jest.mock("@/components/ui", () => ({
  Container: ({ children }) => <div>{children}</div>,
}));
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
}));
jest.mock("@/utils/hooks/authMode", () => ({
  useGetIsSSO: jest.fn(() => true),
}));
jest.mock("@/utils/auth/labAuth", () => ({
  authenticateLabAccessSSO: jest.fn(async () => ({ token: "test-gateway-token" })),
}));

// ─── ParameterForm ──────────────────────────────────────────────────

import ParameterForm from "../ParameterForm";

describe("ParameterForm", () => {
  const variables = [
    { name: "mass", causality: "input", start: 1.0, unit: "kg" },
    { name: "damping", causality: "input", start: 0.5, unit: "N.s/m" },
  ];

  test("renders a row for each input variable", () => {
    render(
      <ParameterForm variables={variables} values={{ mass: 1.0, damping: 0.5 }} onChange={jest.fn()} />
    );
    expect(screen.getByLabelText("Parameter mass")).toBeInTheDocument();
    expect(screen.getByLabelText("Parameter damping")).toBeInTheDocument();
  });

  test("calls onChange when value is edited", () => {
    const onChange = jest.fn();
    render(
      <ParameterForm variables={variables} values={{ mass: 1.0, damping: 0.5 }} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText("Parameter mass"), { target: { value: "2.5" } });
    expect(onChange).toHaveBeenCalledWith("mass", "2.5");
  });

  test("disables inputs when disabled prop is true", () => {
    render(
      <ParameterForm variables={variables} values={{ mass: 1.0, damping: 0.5 }} onChange={jest.fn()} disabled />
    );
    expect(screen.getByLabelText("Parameter mass")).toBeDisabled();
  });

  test("returns null for empty variables", () => {
    const { container } = render(
      <ParameterForm variables={[]} values={{}} onChange={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ─── SimulationOptions ──────────────────────────────────────────────

import SimulationOptions from "../SimulationOptions";

describe("SimulationOptions", () => {
  test("renders start time, stop time, step size inputs", () => {
    render(
      <SimulationOptions
        options={{ startTime: 0, stopTime: 10, stepSize: 0.01 }}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByLabelText("Start Time (s)")).toHaveValue(0);
    expect(screen.getByLabelText("Stop Time (s)")).toHaveValue(10);
    expect(screen.getByLabelText("Step Size (s)")).toHaveValue(0.01);
  });

  test("calls onChange with correct field name", () => {
    const onChange = jest.fn();
    render(
      <SimulationOptions options={{ startTime: 0, stopTime: 10, stepSize: 0.01 }} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText("Stop Time (s)"), { target: { value: "20" } });
    expect(onChange).toHaveBeenCalledWith("stopTime", "20");
  });

  test("disables inputs when disabled", () => {
    render(
      <SimulationOptions options={{ startTime: 0, stopTime: 10, stepSize: 0.01 }} onChange={jest.fn()} disabled />
    );
    expect(screen.getByLabelText("Start Time (s)")).toBeDisabled();
  });
});

// ─── ResultsTable ───────────────────────────────────────────────────

import ResultsTable from "../ResultsTable";

describe("ResultsTable", () => {
  test("renders column headers for each output variable", () => {
    render(
      <ResultsTable
        outputs={{ position: [0, 1, 2], velocity: [0, 0.5, 1] }}
        time={[0, 0.1, 0.2]}
      />
    );
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("position")).toBeInTheDocument();
    expect(screen.getByText("velocity")).toBeInTheDocument();
  });

  test("renders data rows", () => {
    render(
      <ResultsTable
        outputs={{ position: [0, 1] }}
        time={[0, 0.1]}
      />
    );
    // "0" appears in both time and position columns, so use getAllByText
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0.1")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("returns null for empty outputs", () => {
    const { container } = render(
      <ResultsTable outputs={{}} time={[]} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ─── ResultsChart ───────────────────────────────────────────────────

import ResultsChart from "../ResultsChart";

describe("ResultsChart", () => {
  test("renders SVG with polylines for each output series", () => {
    const { container } = render(
      <ResultsChart
        outputs={{ position: [0, 1, 2, 3], velocity: [0, 0.5, 1, 1.5] }}
        time={[0, 0.1, 0.2, 0.3]}
      />
    );
    const polylines = container.querySelectorAll("polyline");
    expect(polylines.length).toBe(2);
  });

  test("renders legend with variable names", () => {
    render(
      <ResultsChart
        outputs={{ position: [0, 1], velocity: [0, 0.5] }}
        time={[0, 0.1]}
      />
    );
    expect(screen.getByText("position")).toBeInTheDocument();
    expect(screen.getByText("velocity")).toBeInTheDocument();
  });

  test("shows message when no output data", () => {
    render(<ResultsChart outputs={{}} time={[]} />);
    expect(screen.getByText(/No output data/)).toBeInTheDocument();
  });
});

// ─── DownloadButtons ────────────────────────────────────────────────

import DownloadButtons from "../DownloadButtons";

describe("DownloadButtons", () => {
  // Mock URL.createObjectURL
  const mockCreateObjectURL = jest.fn(() => "blob:test");
  const mockRevokeObjectURL = jest.fn();
  beforeAll(() => {
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  test("renders CSV and JSON download buttons", () => {
    render(
      <DownloadButtons
        results={{ time: [0, 1], outputs: { position: [0, 1] } }}
        labName="TestFMU"
      />
    );
    expect(screen.getByText(/Download CSV/)).toBeInTheDocument();
    expect(screen.getByText(/Download JSON/)).toBeInTheDocument();
  });

  test("returns null when results is null", () => {
    const { container } = render(<DownloadButtons results={null} />);
    expect(container.firstChild).toBeNull();
  });
});

// ─── SimulationRunner ───────────────────────────────────────────────

import SimulationRunner from "../SimulationRunner";

const fmuLab = {
  id: "42",
  name: "Spring-Damper",
  resourceType: "fmu",
  accessURI: "https://gateway.example.com/auth",
  fmuFileName: "spring-damper.fmu",
  fmiVersion: "2.0",
  simulationType: "CoSimulation",
  modelVariables: [
    { name: "mass", causality: "input", start: 1.0, unit: "kg" },
    { name: "position", causality: "output", unit: "m" },
  ],
  defaultStartTime: 0,
  defaultStopTime: 10,
  defaultStepSize: 0.01,
};

/**
 * Helper to create a mock NDJSON streaming Response.
 * Uses a manual getReader() mock since ReadableStream is not available in jsdom.
 */
function mockNdjsonResponse(events) {
  const ndjson = events.map(e => JSON.stringify(e)).join("\n") + "\n";
  const encoder = new TextEncoder();
  const encoded = encoder.encode(ndjson);
  let read = false;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read() {
            if (!read) { read = true; return Promise.resolve({ done: false, value: encoded }); }
            return Promise.resolve({ done: true });
          },
        };
      },
    },
    headers: new Headers({ "content-type": "application/x-ndjson" }),
  };
}

describe("SimulationRunner", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("renders simulation header with lab name", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.getByText(/Simulation: Spring-Damper/)).toBeInTheDocument();
  });

  test("shows compatibility label from FMU metadata", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.getByText("Compatible with FMI 2.0 Co-Simulation")).toBeInTheDocument();
  });

  test("shows proxy download action only when reservation key is provided", () => {
    const { rerender } = render(<SimulationRunner lab={fmuLab} />);
    expect(screen.queryByRole("button", { name: /Download Proxy FMU/i })).toBeNull();

    rerender(<SimulationRunner lab={fmuLab} reservationKey="0xabc" />);
    expect(screen.getByRole("button", { name: /Download Proxy FMU/i })).toBeInTheDocument();
  });

  test("downloads proxy FMU for valid reservation", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(["proxy"]),
      headers: new Headers({
        "content-disposition": 'attachment; filename="fmu-proxy-lab-42.fmu"',
      }),
    });

    render(<SimulationRunner lab={fmuLab} reservationKey="0xabc" />);
    fireEvent.click(screen.getByRole("button", { name: /Download Proxy FMU/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/simulations/proxy?"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-gateway-token" }),
        })
      );
    });
    expect(screen.getByText(/Proxy FMU downloaded/i)).toBeInTheDocument();
  });

  test("shows regenerate action when proxy ticket is expired or used", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: "Gateway error (401)",
        details: JSON.stringify({ code: "SESSION_TICKET_ALREADY_USED", error: "ticket already used" }),
      }),
    });

    render(<SimulationRunner lab={fmuLab} reservationKey="0xabc" />);
    fireEvent.click(screen.getByRole("button", { name: /Download Proxy FMU/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Regenerate Proxy FMU/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/ticket expired or already used/i)).toBeInTheDocument();
  });

  test("renders input parameter form for input variables only", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.getByLabelText("Parameter mass")).toBeInTheDocument();
    // output variable should not have a parameter input
    expect(screen.queryByLabelText("Parameter position")).toBeNull();
  });

  test("renders simulation options with default values", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.getByLabelText("Start Time (s)")).toHaveValue(0);
    expect(screen.getByLabelText("Stop Time (s)")).toHaveValue(10);
    expect(screen.getByLabelText("Step Size (s)")).toHaveValue(0.01);
  });

  test("shows 'Run Simulation' button in idle state", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.getByText("Run Simulation")).toBeInTheDocument();
  });

  test("calls /api/simulations/stream on button click", async () => {
    global.fetch.mockResolvedValueOnce(
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "data", chunkIndex: 0, totalChunks: 1, time: [0, 1], outputs: { position: [0, 0.5] } },
        { type: "completed", simulationTime: 0.5, outputVariables: ["position"], fmiType: "CoSimulation" },
      ])
    );

    render(<SimulationRunner lab={fmuLab} />);
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/simulations/stream",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("shows results after successful streaming run", async () => {
    global.fetch.mockResolvedValueOnce(
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "data", chunkIndex: 0, totalChunks: 1, time: [0, 0.1], outputs: { position: [0, 0.5] } },
        { type: "completed", simulationTime: 0.1, outputVariables: ["position"], fmiType: "CoSimulation" },
      ])
    );

    render(<SimulationRunner lab={fmuLab} />);
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => {
      expect(screen.getByText("Results")).toBeInTheDocument();
    });
  });

  test("shows error message on failed run", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Simulation exploded" }),
    });

    render(<SimulationRunner lab={fmuLab} />);
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => {
      expect(screen.getByText("Simulation Error")).toBeInTheDocument();
      expect(screen.getByText("Simulation exploded")).toBeInTheDocument();
    });
  });

  test("shows 'No FMU metadata' message for non-FMU resource", () => {
    const nonFmuLab = { ...fmuLab, resourceType: "lab" };
    delete nonFmuLab.fmuFileName;
    delete nonFmuLab.fmiVersion;
    delete nonFmuLab.simulationType;
    delete nonFmuLab.modelVariables;
    render(<SimulationRunner lab={nonFmuLab} />);
    expect(screen.getByText(/No FMU metadata/)).toBeInTheDocument();
  });

  test("shows history toggle button", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.getByText("Show History")).toBeInTheDocument();
  });

  test("shows a specific message when history is not available for the active FMU backend", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 501,
      json: async () => ({
        error: "Gateway error (501)",
        details: JSON.stringify({ code: "NOT_IMPLEMENTED", error: "not implemented" }),
      }),
    });

    render(<SimulationRunner lab={fmuLab} />);
    fireEvent.click(screen.getByText("Show History"));

    await waitFor(() => {
      expect(screen.getByText("Simulation history is not available yet for this FMU backend.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Retry")).toBeNull();
  });

  test("shows a specific message when historical result loading is not available", async () => {
    const historyPayload = {
      simulations: [
        {
          id: "sim-1",
          status: "completed",
          created_at: "2026-03-07T10:00:00",
          fmi_type: "CoSimulation",
          elapsed_seconds: 1.25,
        },
      ],
    };

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => historyPayload,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => historyPayload,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 501,
        json: async () => ({
          error: "Gateway error (501)",
          details: JSON.stringify({ code: "NOT_IMPLEMENTED", error: "not implemented" }),
        }),
      });

    render(<SimulationRunner lab={fmuLab} />);
    fireEvent.click(screen.getByText("Show History"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText("Historical simulation results are not available yet for this FMU backend.")).toBeInTheDocument();
    });
  });

  test("shows solver selector for ModelExchange FMUs", () => {
    const meLab = { ...fmuLab, simulationType: "ModelExchange" };
    render(<SimulationRunner lab={meLab} />);
    expect(screen.getByLabelText("ODE Solver:")).toBeInTheDocument();
  });

  test("does not show solver selector for CoSimulation FMUs", () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(screen.queryByLabelText("ODE Solver:")).toBeNull();
  });
});
