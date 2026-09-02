# Enable your lab for online access

Marketplace publication is the last step of an operational path. Before
listing a laboratory, the provider must have a working access plane, an
institutional control plane and, for physical laboratories, a prepared Windows
lab station.

The [Lab Gateway documentation guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/README.md)
is the source of truth for installation and configuration. This page gives the
provider-oriented route through it.

## Choose the deployment mode

| Mode | Use it when | What it provides |
| --- | --- | --- |
| **Full Gateway** | The Gateway's embedded `blockchain-services` is the institutional control plane. | Credential issuance, provider administration, on-chain operations and access services for the local labs. |
| **Lite Gateway** | Another Full Gateway or standalone `blockchain-services` is the control plane. | The local access plane while trusting credentials and provider operations from the configured remote issuer. |

The control plane and access plane are separate concepts. `ISSUER` selects the
credential authority; the laboratory's on-chain `accessURI` selects the public
Gateway that serves the laboratory. Do not publish an `accessURI` until that
relationship and its trust configuration have been tested.

Read [deployment architectures](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/deployment-architectures.md)
before choosing Full or Lite. A Lite deployment still needs its own public
origin, trust configuration and protected connection to the remote control
plane.

## Provider setup checklist

### 1. Install the Gateway

Choose one of the supported installation paths:

- [Setup script](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/install/install-setup-script.md);
- [Manual Docker Compose](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/install/install-manual-compose.md); or
- [NixOS](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/install/install-nixos.md).

Apply the [configuration reference](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/reference/configuration.md)
and keep secrets, certificates and backend credentials in the deployment
environment. Do not put them in Marketplace metadata.

### 2. Connect the laboratory

Plan the public Gateway and private laboratory network using the
[laboratory connectivity guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/workflows/laboratory-connectivity.md).
Configure the remote desktop connection with the
[Guacamole connection guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/configuring-lab-connections/guacamole-connections.md).

For a physical laboratory, prepare one Windows 10/11 Lab Station per setup
and follow the [Gateway and Lab Station operations guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/workflows/gateway-lab-station-operations.md).
The Station is an execution component; it is not a public Marketplace API.

For an FMU, provision the `.fmu` artifact in the Gateway/Station environment
and follow the [FMI/FMU guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/fmi-fmu-support.md).
Marketplace only stores and displays the descriptive metadata.

### 3. Verify health and a complete session

Before publishing:

1. Check the Gateway using the [operations and health guide](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/reference/operations-and-health.md).
2. Confirm that the institutional backend can authorize the provider and resolve
   the lab configuration.
3. Run the [first lab session tutorial](https://github.com/DecentraLabsCom/Lab-Gateway/blob/main/docs/tutorials/tutorial-first-lab-session.md)
   from institutional login through the remote session.
4. Confirm that the public `accessURI` points to the tested access plane and that
   its TLS certificate, DNS and reverse proxy configuration are valid.
5. Only then continue with [provider registration](register-as-a-provider.md)
   and [lab publication](tokenize-and-list-your-lab.md).

## What the Gateway must enforce

The provider setup must deliver:

- a time-limited remote session for the reservation window;
- institutional authorization before access is issued;
- routing only to the configured laboratory resource;
- isolation between user sessions; and
- automatic cleanup or closure when the access window ends.

VPN access alone is not Marketplace authentication. The Gateway, institutional
backend and reservation state must participate in the access flow.

## Common readiness failures

- **Gateway is reachable but access is denied:** check the issuer/control-plane
  relationship, registered origin and provider backend configuration.
- **The station is online but the application does not start:** check the
  Station operations and WinRM/power configuration in Lab Gateway.
- **The listing is visible but access fails:** listing is catalogue visibility,
  not a health check; return to Gateway health and first-session verification.
- **FMU metadata cannot be loaded:** check the provisioned filename, Gateway
  access configuration and the provider-describe flow. Do not upload the FMU to
  Marketplace.

Last reviewed: 2026-09-02
