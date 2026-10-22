# Configure and publish your lab

Once the institution has been onboarded and the provider role is available, open the **Lab Panel** and select **Add New Lab**. The normal provider flow uses institutional SSO and the institution's managed backend. It does not require a personal Web3 wallet, a network selection, a browser gas payment or a direct Marketplace transaction.

![Add New Lab dialog](../../.gitbook/assets/marketplace-add-new-lab.png)

The screenshot uses fictitious example data and shows the current provider
dialog, including the **Full Setup**/**Quick Setup** choice and the **Real Lab**
/**Simulation** resource type.

The form offers **Full Setup** and **Quick Setup**. Both flows send authorized changes through the institution's configured backend; the backend performs the on-chain operation with the managed institutional wallet.

## Full Setup

Full Setup is the guided option for entering the laboratory information in the Marketplace.

1. Sign in with institutional SSO and open the **Lab Panel**.
2. Select **Add New Lab** and choose **Full Setup**.
3. Complete the basic information, OECD-FORD category, description, availability, time zone, booking options, concurrency and access requirements.
4. Set the price and its unit. Supported display units are `minute`, `hour`, `day`, `week` and `month`. The contract stores the normalized per-second value, while the catalogue and detail page show the configured unit.
5. Add images and documentation. Apply the public-data rules in
   [Marketplace metadata integration](../provider/metadata-integration.md).
6. Review the form and submit it. Wait for the institutional backend and on-chain confirmation before treating the lab as published.

Marketplace-managed metadata is covered in
[Marketplace metadata integration](../provider/metadata-integration.md); the
field catalogue and validation rules remain in the separate
[Lab-Metadata schema](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/docs/metadata-schema.md).

## Quick Setup

Quick Setup is for providers that already maintain a metadata document at an external origin.

1. Prepare a JSON document using the [normative Lab-Metadata schema](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/docs/metadata-schema.md) and its [provider examples](https://github.com/DecentraLabsCom/Lab-Metadata/blob/main/docs/examples.md).
2. Host it at an HTTPS URL that satisfies the exact-origin rules in
   [Marketplace metadata integration](../provider/metadata-integration.md).
3. Sign in with institutional SSO, open **Add New Lab** and choose **Quick Setup**.
4. Enter the price, display unit and metadata URL, then review the listing state.
5. Submit the authorized operation and wait for backend/on-chain confirmation.

The metadata URL is public catalogue input. Keep access URLs, access keys, service credentials and institutional contact details outside the public document.

![Quick Setup form](../../.gitbook/assets/marketplace-quick-setup.png)

Quick Setup keeps the provider input small: price and unit, access endpoint,
access key and the public metadata URL. The values shown in the capture are
illustrative only.

## Listing and unlisted labs

Creating a lab and publishing it are separate states. The default public catalogue contains listed labs only. An explicit `includeUnlisted=true` request can expose an unlisted lab for discovery or administration, but an unlisted lab is not eligible for public booking. If the Marketplace cannot read the on-chain listing status, it does not treat the lab as listed.

## Unlisting versus deleting

These operations are not interchangeable:

- **Unlist** calls `unlistLab`. The on-chain lab record remains owned and editable, but
  new reservation intake stops; existing obligations remain in force.
- **Delete** calls `deleteLab`. The contract removes the on-chain lab record,
  removes it from the active catalogue and cannot be reversed on-chain. It does
  not cancel historical reservations or erase settlement history.
- **Metadata cleanup** is separate from either contract operation. Marketplace-
  managed metadata and assets are cleaned after a confirmed deletion, while
  Gateway-hosted content is hidden immediately and retained until its configured
  local purge deadline.

Use **Unlist** when the intention is only to stop new bookings. Use **Delete**
only when the on-chain lab record should be permanently removed.

## FMU and gateway files

Marketplace upload of `.fmu` files is disabled. For simulation labs, provision the FMU on the provider's **Lab Gateway/Lab Station** and register the corresponding file through the gateway configuration using its `accessKey`. The Marketplace stores and displays the descriptive metadata; it is not the authoritative FMU artifact store.

### Smart Warehouse Cell Demo

The Lab Station demo package includes the public `SmartWarehouseCell.fmu` model and its companion GLB under
`fmu-executor/fmu-data/`. Create its Marketplace listing through the normal
**Add New Lab → Simulation** flow and use `SmartWarehouseCell.fmu` as the FMU file name/access key. There is no Marketplace FMU upload step.
After the listing exists, open the provider Gateway's **Lab Manager → Digital Twins** tab and synchronize its AAS shell. Lab Manager imports the
prepared visual asset from the active FMU backend: from Gateway `fmu-data` in local development, or from Lab Station through its protected internal
endpoint in production. The demo includes both a GLB for the standard viewer
and `SmartWarehouseCell.webapp.zip` for the bundled Three.js application.
Both choices use the same FMU and simulation results; the AAS File MIME
selects the Marketplace presentation. The provider Gateway stores and serves
the selected asset; Station does not expose it publicly.

For a new provider-owned scene, prepare the GLB geometry and add
`extras.fmiBindings` to the nodes animated by FMI outputs, then upload it in the
same Lab Manager panel. The Gateway stores and serves that file from its own
read-only asset route; the AAS stores only the reference. Marketplace resolves
the lab's on-chain Gateway and proxies managed GLBs through a same-origin API,
so providers do not need to request per-Gateway Marketplace CSP or browser CORS
changes. A provider may instead package a self-contained static Three.js app
as a ZIP. Gateway validates and stores its files, then Marketplace loads its
entry page as the complete presentation in an isolated iframe and sends FMI
output samples. The app supplies its scene, input controls, run action, charts
and telemetry display; Marketplace does not wrap it in the GLB viewer or inject
Marketplace UI modules. To start a simulation, the app may send the version 1
`decentralabs:fmi-run-request` message with a `parameters` object. Marketplace
validates its names against the FMU inputs, runs the model and streams its
samples back to the app. Include every required chart, module, stylesheet,
font and other runtime asset in the ZIP using relative paths; Gateway does not
serve the app from Marketplace source files or external asset servers. The app
must acknowledge initialization with the version 1 digital-twin-ready message
after its scene has loaded. Gateway reports GLB bindings that do not match the
FMU outputs before the provider synchronizes the shell. Neither choice
requires Marketplace file permissions or Marketplace code changes.

## Post-publication management

* Metadata-only changes update the application-managed document and do not necessarily require changing the on-chain lab record.
* Changes to on-chain fields, price, availability or the metadata URI are submitted again through the institutional backend and may wait for confirmation.
* If an external metadata document changes, ensure its URL remains reachable and its origin remains trusted. For immutable content-addressed storage, publish a new document and update the metadata URI through the provider flow.
* Keep the Lab Gateway, Lab Station and institutional backend operational. A visible listing does not by itself prove that the remote lab endpoint is available.

For ongoing reservations, incidents, unlisting and settlement responsibilities,
see [Operate your laboratory](../provider/operate-your-lab.md).

Last reviewed: 2026-10-19
