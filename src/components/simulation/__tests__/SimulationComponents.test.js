/**
 * Unit Tests for Simulation components
 *
 * Tests for:
 * - SimulationRunner asset routing and external FMI handoff
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
    await waitFor(() => expect(global.fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/simulations/proxy?'))).toHaveLength(contentType === 'text/html' ? 0 : 1));
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

  test("shows only the external FMI handoff when no visual asset is linked", async () => {
    renderReservedSimulationRunner();

    expect(await screen.findByRole("heading", { name: "Use this FMU in your own tool" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spring-Damper" })).toBeInTheDocument();
    expect(screen.getByText(/Import the downloaded .fmu file/i)).toBeInTheDocument();
    expect(screen.getByText(/internet connection/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run Simulation|Show History|Save state/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("digital-twin-glb")).not.toBeInTheDocument();
    expect(screen.queryByTestId("digital-twin-app")).not.toBeInTheDocument();
    const requests = global.fetch.mock.calls.map(([url]) => url);
    expect(requests).not.toContain("/api/simulations/access");
    expect(requests).not.toContain("/api/simulations/parameter-sets");
    expect(requests).not.toContain("/api/simulations/stream");
  });

  test("automatically downloads the reservation proxy once and preserves its filename", async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      expect(this.download).toBe("reservation-proxy.fmu");
    });
    const view = renderReservedSimulationRunner();
    expect(await screen.findByText(/download should have started/i)).toBeInTheDocument();
    view.rerender(<SimulationRunner lab={{ ...fmuLab }} reservationKey="0xabc" />);
    expect(global.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/simulations/proxy?"))).toHaveLength(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/simulations/proxy?labId=42&reservationKey=0xabc",
      expect.objectContaining({ credentials: "include" }),
    );
    click.mockRestore();
  });

  test("offers a download retry if the browser did not save the file", async () => {
    renderReservedSimulationRunner();
    fireEvent.click(await screen.findByRole("button", { name: "Download again" }));
    await waitFor(() => expect(global.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/simulations/proxy?"))).toHaveLength(2));
  });

  test("starts a fresh download when the reservation changes", async () => {
    const view = renderReservedSimulationRunner();
    await screen.findByText(/download should have started/i);
    view.rerender(<SimulationRunner lab={fmuLab} reservationKey="0xdef" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/simulations/proxy?labId=42&reservationKey=0xdef",
      expect.objectContaining({ credentials: "include" }),
    ));
    expect(global.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/simulations/proxy?"))).toHaveLength(2);
  });

  test("downloads only once when React replays effects in Strict Mode", async () => {
    render(<React.StrictMode><SimulationRunner lab={fmuLab} reservationKey="0xabc" /></React.StrictMode>);
    await screen.findByText(/download should have started/i);
    expect(global.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/simulations/proxy?"))).toHaveLength(1);
  });

  test.each([
    [{ details: 'Provider is offline' }, 'Provider is offline'],
    [{ details: { error: 'FMU could not be prepared' } }, 'FMU could not be prepared'],
    [{}, 'Proxy download failed (503)'],
  ])("explains a provider download error with payload %j", async (payload, expectedMessage) => {
    queueProxyResponses({ ok: false, status: 503, json: async () => payload });
    renderReservedSimulationRunner();
    expect(await screen.findByRole("alert")).toHaveTextContent(expectedMessage);
  });

  test("handles a provider error that does not contain JSON", async () => {
    queueProxyResponses({ ok: false, status: 502, json: async () => { throw new Error('Invalid JSON'); } });
    renderReservedSimulationRunner();
    expect(await screen.findByRole("alert")).toHaveTextContent('Proxy download failed (502)');
  });

  test("shows a download failure and allows retrying", async () => {
    queueProxyResponses({ ok: false, status: 503, json: async () => ({ error: "Provider temporarily unavailable" }) });
    renderReservedSimulationRunner();
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try download again" }));
    expect(await screen.findByText(/download should have started/i)).toBeInTheDocument();
  });

  test("reauthenticates once when the reservation proxy session has expired", async () => {
    queueProxyResponses({ ok: false, status: 401 }, successfulProxyResponse());
    renderReservedSimulationRunner();
    expect(await screen.findByText(/download should have started/i)).toBeInTheDocument();
    expect(authenticateLabAccessSSO).toHaveBeenCalledTimes(1);
    expect(authenticateLabAccessSSO).toHaveBeenCalledWith({ labId: "42", reservationKey: "0xabc" });
    expect(establishFmuGatewaySession).toHaveBeenCalledTimes(1);
  });

  test("explains how to recover from an expired or used proxy ticket", async () => {
    const expiredResponse = {
      ok: false,
      status: 401,
      json: async () => ({ details: JSON.stringify({ code: "SESSION_TICKET_ALREADY_USED" }) }),
    };
    queueProxyResponses(expiredResponse, expiredResponse);
    renderReservedSimulationRunner();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Re-enter the reserved laboratory/i);
  });

  test("waits for asset discovery before starting a proxy download", async () => {
    let resolveDiscovery;
    const originalFetch = global.fetch;
    global.fetch = jest.fn((url, init) => String(url).startsWith("/api/aas/shell?")
      ? new Promise((resolve) => { resolveDiscovery = resolve; })
      : originalFetch(url, init));
    renderReservedSimulationRunner();
    expect(screen.getByRole("status")).toHaveTextContent(/Preparing the simulation view/i);
    expect(global.fetch.mock.calls.some(([url]) => String(url).startsWith("/api/simulations/proxy?"))).toBe(false);
    resolveDiscovery({ ok: true, json: async () => ({ visualAssets: [] }) });
    expect(await screen.findByText(/download should have started/i)).toBeInTheDocument();
  });

  test("uses the external FMI handoff when asset discovery fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn((url, init) => String(url).startsWith("/api/aas/shell?")
      ? Promise.reject(new Error("AAS unavailable"))
      : originalFetch(url, init));
    renderReservedSimulationRunner();
    expect(await screen.findByText(/download should have started/i)).toBeInTheDocument();
  });

  test("requires a reservation before downloading a proxy", async () => {
    render(<SimulationRunner lab={fmuLab} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/active reservation is required/i);
    expect(global.fetch.mock.calls.some(([url]) => String(url).startsWith("/api/simulations/"))).toBe(false);
  });

  test("shows the missing metadata message without downloading a proxy", () => {
    const { fmuFileName, ...lab } = fmuLab;
    render(<SimulationRunner lab={lab} reservationKey="0xabc" />);
    expect(screen.getByText(/No FMU metadata/)).toBeInTheDocument();
    expect(global.fetch.mock.calls.some(([url]) => String(url).startsWith("/api/simulations/"))).toBe(false);
  });
});
