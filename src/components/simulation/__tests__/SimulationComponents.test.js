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
jest.mock("@/context/LabCreditContext", () => ({
  useLabCredit: jest.fn(() => ({ formatPrice: (p) => `â‚¬${p}` })),
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
jest.mock("next/dynamic", () => {
  let viewerIndex = 0;
  return {
    __esModule: true,
    default: () => {
      const testId = viewerIndex++ === 0 ? "digital-twin-glb" : "digital-twin-app";
      const React = require("react");
      return (props) => React.createElement("div", {
        "data-testid": testId,
        "data-url": props.sceneUrl || props.appUrl,
        ...(testId === "digital-twin-glb" ? {
          "data-input-editing-enabled": String(props.inputEditingEnabled),
          "data-interactive-inputs": JSON.stringify((props.interactiveInputVariables || []).map(({ name }) => name)),
          "data-model-variables": JSON.stringify((props.modelVariables || []).map(({ name }) => name)),
        } : {}),
      });
    },
  };
});
jest.mock("@/utils/hooks/authMode", () => ({
  useGetIsSSO: jest.fn(() => true),
}));
jest.mock("@/utils/auth/labAuth", () => ({
  authenticateLabAccessSSO: jest.fn(async () => ({
    accessCode: "opaque-fmu-code",
    labURL: "https://gateway.example.com/fmu/",
    resourceType: "fmu",
    reservationKey: "0xabc",
  })),
}));
jest.mock("@/utils/auth/fmuAccess", () => ({
  establishFmuGatewaySession: jest.fn(async () => "https://gateway.example.com"),
}));
jest.mock("@decentralabs/digital-twin-app-protocol/fmu-client", () => ({
  connectFmuSession: jest.fn(),
}));

// â”€â”€â”€ ParameterForm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import ParameterForm from "../controls/ParameterForm";

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

  test("shows the type, shape and expected format for each variable", () => {
    const vectorVariables = [{
      name: "u",
      causality: "input",
      type: "Float64",
      start: "1 2 3",
      unit: "m/s",
      description: "Input vector",
      dimensions: [{ start: 3 }],
    }];

    render(<ParameterForm variables={vectorVariables} values={{ u: "1 2 3" }} onChange={jest.fn()} />);

    expect(screen.getByText("Float64 · vector[3]")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Input vector");
    expect(screen.getByText("Format: 3 numbers separated by spaces")).toBeInTheDocument();
    expect(screen.queryByText("Initial: 1 2 3")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Parameter u")).toHaveAttribute("type", "text");
  });

  test("uses a text input when a variable expects a boolean", () => {
    render(
      <ParameterForm
        variables={[{ name: "enabled", causality: "input", type: "Boolean", start: "false" }]}
        values={{ enabled: "false" }}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByText("Format: true or false")).toBeInTheDocument();
    expect(screen.getByLabelText("Parameter enabled")).toHaveAttribute("type", "text");
  });
});

// â”€â”€â”€ SimulationOptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import SimulationOptions from "../controls/SimulationOptions";

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

// â”€â”€â”€ ResultsTable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import ResultsTable from "../results/ResultsTable";

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

  test("renders dimensioned outputs as separate table columns", () => {
    render(
      <ResultsTable
        outputs={{ y: [[1, 2, 3], [4, 5, 6]] }}
        time={[0, 1]}
      />
    );

    expect(screen.getByText("y[0]")).toBeInTheDocument();
    expect(screen.getByText("y[1]")).toBeInTheDocument();
    expect(screen.getByText("y[2]")).toBeInTheDocument();
    expect(screen.queryByText("456")).not.toBeInTheDocument();
  });
});

// â”€â”€â”€ ResultsChart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import ResultsChart from "../results/ResultsChart";

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

  test("plots each component of a dimensioned output as a numeric series", () => {
    const { container } = render(
      <ResultsChart
        outputs={{ y: [[1, 2, 3], [4, 5, 6]] }}
        time={[0, 1]}
      />
    );

    const polylines = [...container.querySelectorAll("polyline")];
    expect(polylines).toHaveLength(3);
    expect(polylines.every((line) => !line.getAttribute("points").includes("NaN"))).toBe(true);
  });

  test("keeps non-numeric outputs out of the chart using variable metadata", () => {
    render(
      <ResultsChart
        outputs={{ y: [1, 2], status: ["ready", "done"] }}
        time={[0, 1]}
        variableMetadata={[
          { name: "y", type: "Float64", causality: "output" },
          { name: "status", type: "String", causality: "output" },
        ]}
      />
    );

    expect(document.querySelectorAll("polyline")).toHaveLength(1);
    expect(screen.getByText("y")).toBeInTheDocument();
    expect(screen.queryByText("status")).not.toBeInTheDocument();
  });

  test("allows selecting arbitrary variables for a 2D plot", () => {
    render(
      <ResultsChart
        outputs={{ position: [0, 1, 2], velocity: [3, 2, 1] }}
        time={[0, 1, 2]}
      />
    );

    fireEvent.change(screen.getByLabelText("Chart type"), { target: { value: "2d" } });
    fireEvent.change(screen.getByLabelText("X axis"), { target: { value: "velocity" } });
    fireEvent.change(screen.getByLabelText("Y axis"), { target: { value: "position" } });

    expect(screen.getByTestId("cartesian-plot")).toBeInTheDocument();
    expect(screen.getByLabelText("X axis")).toHaveValue("velocity");
    expect(screen.getByLabelText("Y axis")).toHaveValue("position");
  });

  test("renders a 3D trajectory with selectable vector components", () => {
    render(
      <ResultsChart
        outputs={{ y: [[1, 2, 3], [2, 4, 6], [3, 6, 9]] }}
        time={[0, 1, 2]}
      />
    );

    fireEvent.change(screen.getByLabelText("Chart type"), { target: { value: "3d" } });

    expect(screen.getByTestId("three-dimensional-plot")).toBeInTheDocument();
    expect(screen.getByLabelText("Z axis")).toHaveValue("y[2]");
    expect(screen.getByTestId("three-dimensional-plot").querySelectorAll("line").length).toBeGreaterThan(0);
  });

  test("offers a state-space projection mode", () => {
    render(
      <ResultsChart
        outputs={{ x: [0, 1, 0], "der(x)": [1, 0, -1] }}
        time={[0, 1, 2]}
      />
    );

    fireEvent.change(screen.getByLabelText("Chart type"), { target: { value: "state-space" } });

    expect(screen.getByText(/State-space projection/)).toBeInTheDocument();
    expect(screen.getByLabelText("X axis")).toHaveValue("x");
    expect(screen.getByLabelText("Y axis")).toHaveValue("der(x)");
  });
});

// â”€â”€â”€ DownloadButtons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import DownloadButtons from "../results/DownloadButtons";

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

// â”€â”€â”€ SimulationRunner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import SimulationRunner from "../SimulationRunner";
import { connectFmuSession } from "@decentralabs/digital-twin-app-protocol/fmu-client";
import { authenticateLabAccessSSO } from "@/utils/auth/labAuth";
import { establishFmuGatewaySession } from "@/utils/auth/fmuAccess";

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
  let gatewayResponses;
  let proxyResponses;
  let nextAccessPolicy;

  beforeEach(() => {
    gatewayResponses = [];
    proxyResponses = [];
    nextAccessPolicy = null;
    global.fetch = jest.fn((url) => {
      if (String(url).startsWith('/api/aas/shell?')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url === '/api/simulations/access') {
        return Promise.resolve({ ok: true, json: async () => nextAccessPolicy || accessPolicyForLab(fmuLab) });
      }
      if (url === '/api/simulations/parameter-sets') {
        return Promise.resolve({ ok: true, json: async () => ({ fmiLsParameterPresets: [] }) });
      }
      if (String(url).startsWith('/api/simulations/proxy?')) {
        return Promise.resolve(proxyResponses.shift() || successfulProxyResponse());
      }
      return Promise.resolve(gatewayResponses.shift() || {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Unexpected fetch in test' }),
      });
    });
    connectFmuSession.mockReset();
    authenticateLabAccessSSO.mockClear();
    establishFmuGatewaySession.mockClear();
  });

  function queueGatewayResponses(...responses) {
    gatewayResponses.push(...responses);
  }

  function queueProxyResponses(...responses) {
    proxyResponses.push(...responses);
  }

  function successfulProxyResponse() {
    return {
      ok: true,
      blob: async () => new Blob(['proxy']),
      headers: new Headers({ 'content-disposition': 'attachment; filename="reservation-proxy.fmu"' }),
    };
  }

  function accessPolicyForLab(lab) {
    const variables = Object.fromEntries((lab.modelVariables || []).map((variable) => {
      const causality = variable.causality || 'local';
      const variability = variable.variability || 'continuous';
      const writeAt = causality === 'input'
        ? ['initialization', ...(variability === 'constant' ? [] : ['runtime'])]
        : causality === 'parameter' && ['fixed', 'tunable'].includes(variability) ? ['initialization'] : [];
      return [variable.name, { read: causality !== 'local', writeAt }];
    }));
    return {
      policySource: 'fmi-default',
      policyVersion: 'test',
      variables,
      modelVariables: lab.modelVariables || [],
      ...(lab.fmiVersion ? { fmiVersion: lab.fmiVersion } : {}),
      ...(lab.simulationType ? { simulationType: lab.simulationType } : {}),
    };
  }

  function renderReservedSimulationRunner(lab = fmuLab, reservationKey = '0xabc', accessPolicy = null) {
    nextAccessPolicy = accessPolicy || accessPolicyForLab(lab);
    return render(<SimulationRunner lab={lab} reservationKey={reservationKey} />);
  }

  async function waitForStandardSimulationView() {
    await screen.findByText(/^Simulation:/);
  }

  test.each([
    {
      contentType: "model/gltf-binary",
      assetUrl: `/digital-twin-scenes/42/${"a".repeat(64)}.glb`,
      testId: "digital-twin-glb",
      otherTestId: "digital-twin-app",
      expectedUrl: `/api/aas/digital-twin-scene/42/${"a".repeat(64)}.glb`,
    },
    {
      contentType: "text/html",
      assetUrl: `/digital-twin-apps/42/${"b".repeat(64)}/index.html`,
      testId: "digital-twin-app",
      otherTestId: "digital-twin-glb",
      expectedUrl: `/api/aas/digital-twin-app/42/${"b".repeat(64)}/index.html`,
    },
  ])("selects the Marketplace viewer from AAS MIME $contentType", async ({
    contentType,
    assetUrl,
    testId,
    otherTestId,
    expectedUrl,
  }) => {
    global.fetch = jest.fn((url) => {
      if (String(url).startsWith("/api/aas/shell?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ visualAssets: [{ url: assetUrl, contentType }] }),
        });
      }
      if (url === '/api/simulations/access') {
        return Promise.resolve({ ok: true, json: async () => nextAccessPolicy || accessPolicyForLab(fmuLab) });
      }
      if (String(url).startsWith('/api/simulations/proxy?')) {
        return Promise.resolve(successfulProxyResponse());
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    renderReservedSimulationRunner();

    const viewer = await screen.findByTestId(testId);
    expect(viewer).toHaveAttribute("data-url", expectedUrl);
    expect(screen.queryByTestId(otherTestId)).not.toBeInTheDocument();
  });

  test("does not expose scene dragging for inputs the Gateway does not permit writing", async () => {
    const accessPolicy = accessPolicyForLab(fmuLab);
    accessPolicy.variables.mass.writeAt = [];
    global.fetch = jest.fn((url) => {
      if (String(url).startsWith("/api/aas/shell?")) {
        return Promise.resolve({ ok: true, json: async () => ({ visualAssets: [{
          contentType: "model/gltf-binary",
          url: `/digital-twin-scenes/42/${"a".repeat(64)}.glb`,
        }] }) });
      }
      if (url === "/api/simulations/access") {
        return Promise.resolve({ ok: true, json: async () => accessPolicy });
      }
      if (String(url).startsWith("/api/simulations/proxy?")) {
        return Promise.resolve(successfulProxyResponse());
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    renderReservedSimulationRunner(fmuLab, "0xabc", accessPolicy);
    const viewer = await screen.findByTestId("digital-twin-glb");
    await waitFor(() => expect(viewer).toHaveAttribute("data-model-variables", '["mass","position"]'));

    expect(viewer).toHaveAttribute("data-interactive-inputs", "[]");
    expect(viewer).toHaveAttribute("data-input-editing-enabled", "false");
  });

  test("starts reserved GLB twins through the interactive FMU session when step mode is selected", async () => {
    const accessPolicy = accessPolicyForLab(fmuLab);
    accessPolicy.variables.mass.writeAt = ["runtime"];
    const session = {
      capabilities: {
        inputUpdateQuota: {
          maxUpdatesPerWindow: 30,
          windowMs: 10_000,
          maxUpdateBytes: 65_536,
          maxUpdatesPerDay: 100_000,
          maxUpdateBytesPerDay: 67_108_864,
          maxScheduledEventsPerAdvance: 30,
          maxScheduleBytesPerAdvance: 262_144,
        },
      },
      close: jest.fn(),
      request: jest.fn(async (type, _expectedType, payload) => {
        if (type === "sim.getOutputs") return { simTime: 0, values: { position: 0 } };
        if (type === "sim.step") {
          return {
            simTime: payload.currentCommunicationPoint + payload.deltaT,
            values: { position: 0.5 },
          };
        }
        return {};
      }),
    };
    connectFmuSession.mockResolvedValue(session);
    global.fetch = jest.fn((url) => {
      if (String(url).startsWith("/api/aas/shell?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            visualAssets: [{
              contentType: "model/gltf-binary",
              url: `/digital-twin-scenes/42/${"a".repeat(64)}.glb`,
            }],
          }),
        });
      }
      if (url === "/api/simulations/access") {
        return Promise.resolve({ ok: true, json: async () => accessPolicy });
      }
      if (String(url).startsWith("/api/simulations/proxy?")) {
        return Promise.resolve(successfulProxyResponse());
      }
      if (url === "/api/simulations/connection") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            protocolVersion: "1.0",
            gatewayWsUrl: "wss://gateway.example.com/fmu/api/v1/fmu/sessions",
            labId: "42",
            reservationKey: "0xabc",
            sessionTicket: "one-use-ticket",
            ticketExpiresAt: 4102444800,
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    renderReservedSimulationRunner(fmuLab, "0xabc", accessPolicy);
    const viewer = await screen.findByTestId("digital-twin-glb");
    await waitFor(() => expect(viewer).toHaveAttribute("data-model-variables", '["mass","position"]'));
    expect(viewer).toHaveAttribute("data-interactive-inputs", "[]");
    expect(viewer).toHaveAttribute("data-input-editing-enabled", "false");
    fireEvent.change(await screen.findByLabelText("Execution mode"), { target: { value: "step" } });
    fireEvent.click(screen.getByRole("button", { name: "Run model" }));

    await waitFor(() => expect(connectFmuSession).toHaveBeenCalledWith(
      expect.objectContaining({ labId: "42", reservationKey: "0xabc" }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    await waitFor(() => expect(viewer).toHaveAttribute("data-interactive-inputs", '["mass"]'));
    expect(viewer).toHaveAttribute("data-input-editing-enabled", "true");
    fireEvent.click(await screen.findByRole("button", { name: "Advance one step" }));
    await waitFor(() => expect(session.request).toHaveBeenCalledWith(
      "sim.step",
      "sim.outputs",
      { currentCommunicationPoint: 0, deltaT: 0.01 },
    ));
    expect(await screen.findByText("t = 0.010 s")).toBeInTheDocument();
  });

  test("keeps the standard FMI view when AAS has no visual asset", async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).startsWith("/api/aas/shell?")) {
        return Promise.resolve({ ok: true, json: async () => ({ visualAssets: [] }) });
      }
      if (url === '/api/simulations/access') {
        return Promise.resolve({ ok: true, json: async () => nextAccessPolicy || accessPolicyForLab(fmuLab) });
      }
      if (String(url).startsWith('/api/simulations/proxy?')) {
        return Promise.resolve(successfulProxyResponse());
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    renderReservedSimulationRunner();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/aas/shell?labId=42",
      expect.objectContaining({ cache: "no-store" }),
    ));
    expect(screen.queryByTestId("digital-twin-glb")).not.toBeInTheDocument();
    expect(screen.queryByTestId("digital-twin-app")).not.toBeInTheDocument();
  });

  test("does not render readable inputs or parameters as editable without initialization write permission", async () => {
    const lab = {
      ...fmuLab,
      modelVariables: [
        { name: 'readOnlyCommand', causality: 'input', start: 1 },
        { name: 'readOnlyGain', causality: 'parameter', variability: 'tunable', start: 2 },
        { name: 'writableCommand', causality: 'input', start: 3 },
      ],
    };
    const accessPolicy = {
      policySource: 'aas',
      modelVariables: lab.modelVariables,
      variables: {
        readOnlyCommand: { read: true, writeAt: [] },
        readOnlyGain: { read: true, writeAt: [] },
        writableCommand: { read: false, writeAt: ['initialization'] },
      },
    };

    renderReservedSimulationRunner(lab, '0xabc', accessPolicy);

    expect(await screen.findByLabelText('Parameter writableCommand')).toBeInTheDocument();
    expect(screen.queryByLabelText('Parameter readOnlyCommand')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Parameter readOnlyGain')).not.toBeInTheDocument();
  });

  test("renders simulation header with lab name", async () => {
    renderReservedSimulationRunner();
    expect(await screen.findByText(/Simulation: Spring-Damper/)).toBeInTheDocument();
  });

  test("does not show the redundant compatibility label", async () => {
    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
    expect(screen.queryByText("Compatible with FMI 2.0 Co-Simulation")).not.toBeInTheDocument();
  });

  test("automatically downloads the reservation FMU and removes the manual action", async () => {
    queueProxyResponses({
      ok: true,
      blob: async () => new Blob(["proxy"]),
      headers: new Headers({
        "content-disposition": 'attachment; filename="fmu-proxy-lab-42.fmu"',
      }),
    });
    renderReservedSimulationRunner();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/simulations/proxy?"),
        expect.objectContaining({
          credentials: "include",
        })
      );
    });
    expect(await screen.findByText(/Reservation FMU downloaded automatically/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download Proxy FMU/i })).toBeNull();
  });

  test("shows an automatic-download error when the reservation proxy ticket is expired or used", async () => {
    const expiredResponse = {
      ok: false,
      status: 401,
      json: async () => ({
        error: "Gateway error (401)",
        details: JSON.stringify({ code: "SESSION_TICKET_ALREADY_USED", error: "ticket already used" }),
      }),
    };
    queueProxyResponses(expiredResponse, expiredResponse);

    render(<SimulationRunner lab={fmuLab} reservationKey="0xabc" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Re-enter the reserved laboratory/i);
    });
    expect(authenticateLabAccessSSO).toHaveBeenCalledTimes(1);
  });

  test("renders input parameter form for input variables only", async () => {
    renderReservedSimulationRunner();
    expect(await screen.findByLabelText("Parameter mass")).toBeInTheDocument();
    // output variable should not have a parameter input
    expect(screen.queryByLabelText("Parameter position")).toBeNull();
  });

  test("renders simulation options with default values", async () => {
    renderReservedSimulationRunner();
    expect(await screen.findByLabelText("Start Time (s)")).toHaveValue(0);
    expect(screen.getByLabelText("Stop Time (s)")).toHaveValue(10);
    expect(screen.getByLabelText("Step Size (s)")).toHaveValue(0.01);
  });

  test("shows 'Run Simulation' button in idle state", async () => {
    renderReservedSimulationRunner();
    expect(await screen.findByText("Run Simulation")).toBeInTheDocument();
  });

  test("calls /api/simulations/stream on button click", async () => {
    queueGatewayResponses(
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "data", chunkIndex: 0, totalChunks: 1, time: [0, 1], outputs: { position: [0, 0.5] } },
        { type: "completed", simulationTime: 0.5, outputVariables: ["position"], fmiType: "CoSimulation" },
      ])
    );

    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/simulations/stream",
        expect.objectContaining({ method: "POST", credentials: "include" })
      );
    });
    expect(authenticateLabAccessSSO).not.toHaveBeenCalled();
    expect(establishFmuGatewaySession).not.toHaveBeenCalled();
  });

  test("serializes numeric lab ids for the Gateway stream contract", async () => {
    queueGatewayResponses(
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "completed", simulationTime: 0.1, outputVariables: ["position"], fmiType: "CoSimulation" },
      ])
    );

    renderReservedSimulationRunner({ ...fmuLab, id: 1 });
    await waitForStandardSimulationView();
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/simulations/stream",
        expect.objectContaining({ method: "POST" })
      );
    });

    const [, requestInit] = global.fetch.mock.calls.find(([url]) => url === "/api/simulations/stream");
    expect(JSON.parse(requestInit.body).labId).toBe("1");
  });

  test("rejects a scalar value for a dimensioned input variable", async () => {
    queueGatewayResponses(
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "completed", simulationTime: 0.1, outputVariables: ["y"], fmiType: "CoSimulation" },
      ])
    );

    const stateSpaceLab = {
      ...fmuLab,
      fmuFileName: "StateSpace.fmu",
      fmiVersion: "3.0",
      modelVariables: [
        { name: "m", causality: "structuralParameter", type: "UInt64", start: "3", valueReference: 1 },
        {
          name: "u",
          causality: "input",
          type: "Float64",
          dimensions: [{ valueReference: 1, variableName: "m" }],
          start: "1 2 3",
        },
        { name: "y", causality: "output", type: "Float64", dimensions: [{ start: 3 }] },
      ],
    };

    renderReservedSimulationRunner(stateSpaceLab);
    fireEvent.change(await screen.findByLabelText("Parameter u"), { target: { value: "4" } });
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => expect(screen.getByText("Input u requires 3 values separated by spaces.")).toBeInTheDocument());
    expect(global.fetch.mock.calls.filter(([url]) => url === "/api/simulations/stream")).toHaveLength(0);
  });

  test("reauthenticates once with the canonical lab auth context after a 401", async () => {
    queueProxyResponses({
      ok: true,
      blob: async () => new Blob(["proxy"]),
      headers: new Headers({
        "content-disposition": 'attachment; filename="fmu-proxy-lab-42.fmu"',
      }),
    });

    render(<SimulationRunner lab={{ ...fmuLab, accessURI: "https://gateway.example.com/fmu" }} reservationKey="0xabc" />);
    await waitForStandardSimulationView();
    expect(await screen.findByText(/Reservation FMU downloaded automatically/i)).toBeInTheDocument();

    queueGatewayResponses(
      { ok: false, status: 401 },
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "completed", simulationTime: 0.1, outputVariables: [], fmiType: "CoSimulation" },
      ]),
    );

    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => expect(screen.getByText("Results")).toBeInTheDocument());
    expect(authenticateLabAccessSSO).toHaveBeenCalledTimes(1);
    expect(authenticateLabAccessSSO).toHaveBeenCalledWith({
      labId: "42",
      reservationKey: "0xabc",
    });
    expect(global.fetch.mock.calls.filter(([url]) => url === "/api/simulations/stream")).toHaveLength(2);
  });

  test("shows results after successful streaming run", async () => {
    queueGatewayResponses(
      mockNdjsonResponse([
        { type: "started", simId: "abc123" },
        { type: "data", chunkIndex: 0, totalChunks: 1, time: [0, 0.1], outputs: { position: [0, 0.5] } },
        { type: "completed", simulationTime: 0.1, outputVariables: ["position"], fmiType: "CoSimulation" },
      ])
    );

    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
    fireEvent.click(screen.getByText("Run Simulation"));

    await waitFor(() => {
      expect(screen.getByText("Results")).toBeInTheDocument();
    });
  });

  test("shows error message on failed run", async () => {
    queueGatewayResponses({
      ok: false,
      status: 500,
      json: async () => ({ error: "Simulation exploded" }),
    });

    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
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

  test("shows history toggle button", async () => {
    renderReservedSimulationRunner();
    expect(await screen.findByText("Show History")).toBeInTheDocument();
  });

  test("shows a specific message when history is not available for the active FMU backend", async () => {
    queueGatewayResponses({
      ok: false,
      status: 501,
      json: async () => ({
        error: "Gateway error (501)",
        details: JSON.stringify({ code: "NOT_IMPLEMENTED", error: "not implemented" }),
      }),
    });

    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
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

    queueGatewayResponses(
      {
        ok: true,
        json: async () => historyPayload,
      },
      {
        ok: false,
        status: 501,
        json: async () => ({
          error: "Gateway error (501)",
          details: JSON.stringify({ code: "NOT_IMPLEMENTED", error: "not implemented" }),
        }),
      },
    );

    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
    fireEvent.click(screen.getByText("Show History"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText("Historical simulation results are not available yet for this FMU backend.")).toBeInTheDocument();
    });
  });

  test("shows solver selector for ModelExchange FMUs", async () => {
    const meLab = { ...fmuLab, simulationType: "ModelExchange" };
    renderReservedSimulationRunner(meLab);
    expect(await screen.findByLabelText("ODE Solver:")).toBeInTheDocument();
  });

  test("does not show solver selector for CoSimulation FMUs", async () => {
    renderReservedSimulationRunner();
    await waitForStandardSimulationView();
    expect(screen.queryByLabelText("ODE Solver:")).toBeNull();
  });
});

