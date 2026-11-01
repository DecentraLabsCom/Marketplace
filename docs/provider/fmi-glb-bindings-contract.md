# DecentraLabs FMI Bindings for glTF Nodes

**Contract version: 1.2.0**
**Status: Current**

This document is the canonical DecentraLabs contract for connecting FMI model
variables to nodes in a glTF 2.0 / GLB scene shown by the Marketplace generic
viewer. It defines the meaning of the node-level `extras.fmiBindings` array.

This is a DecentraLabs convention carried in glTF `extras`; it is not an FMI or
Khronos glTF standard. The GLB owns the geometry, materials, hierarchy and
initial node transforms. Bindings connect that authored scene to values from
the FMU.

The terms MUST and MUST NOT state requirements for conforming assets. SHOULD
marks a recommended authoring practice.

The companion [JSON Schema](./fmi-glb-bindings.schema.json) validates the
structure of `nodes[*].extras.fmiBindings`. FMU-dependent rules such as variable
existence and causality require the selected FMU metadata and are checked
separately by Lab Gateway.

## 1. Placement and shape

Place `fmiBindings` in the `extras` object of each glTF node that is controlled
by FMI values. Its value is an array. Each array item connects one FMU variable
to one scene target.

```json
{
  "nodes": [
    {
      "name": "Gate",
      "extras": {
        "fmiBindings": [
          {
            "variable": "gatePosition",
            "target": "position.x",
            "scale": 1,
            "offset": 0
          },
          {
            "variable": "gateOpen",
            "target": "visible"
          },
          {
            "variable": "gateOpen",
            "target": "material.color",
            "trueColor": "#42d392",
            "falseColor": "#62343b"
          }
        ]
      }
    }
  ]
}
```

The `variable` value MUST exactly match the FMI variable name in the selected
FMU's metadata. `position.x/y/z` remain accepted aliases for
`translation.x/y/z` so existing scenes keep their meaning. The whole-vector
targets use the same property names as glTF animation channels:

| Target | Effect |
| --- | --- |
| `position.x`, `position.y`, `position.z` | Set the node's local position component. |
| `translation.x`, `translation.y`, `translation.z` | Set the corresponding local translation component. These are the preferred scalar targets. |
| `translation` | Set all three local translation components from an FMI vector of length 3. |
| `rotation.x`, `rotation.y`, `rotation.z` | Set the node's local Euler rotation component, in radians. |
| `scale.x`, `scale.y`, `scale.z` | Set the node's local scale component. |
| `rotation` | Set the node quaternion from an FMI vector `[x, y, z, w]` of length 4. Marketplace normalizes the quaternion before applying it. |
| `scale` | Set all three local scale components from an FMI vector of length 3. |
| `weights` | Set all morph-target weights from an FMI vector, or one weight using `index`. |
| `visible` | Show or hide the node. |
| `material.color` | Set the node material color from a Boolean-like value. |

Position follows the GLB node's local coordinate system and units. Bindings do
not select nodes by name: the `extras.fmiBindings` array belongs to the node it
controls.

## 2. Mapping values to scene targets

`scale` and `offset` are optional finite JSON numbers. They default to `1` and
`0`, respectively. For scalar targets and each component of whole-vector
targets, Marketplace calculates:

```text
sceneValue = fmiValue * scale + offset
```

Use `scale: 0` when an output should set a constant scene value equal to
`offset`. For example, `scale: 0, offset: 1` holds a scale component at `1`.
Transform targets are intended for numeric FMI outputs. Boolean values are
currently converted to `1` or `0`; values that cannot be converted to a finite
number are ignored. Marketplace ignores a mapped transform value whose
absolute value is greater than `100000` local units. Dragging is likewise
limited to local coordinates within `[-100000, 100000]`.

For a rotation in degrees, convert to radians with `scale: 0.017453292519943295`
when the FMI output is degrees. The target itself is always assigned in
radians.

The glTF `rotation` target is different from the legacy Euler component
targets: it requires the complete quaternion vector in glTF `[x, y, z, w]`
order, then normalizes it. The whole `translation` and `scale` targets require
three-component FMI arrays. A vector target with an unknown or wrong runtime
shape is ignored safely.

### Arrays and morph targets

Use `indices` to map one FMI array element to a scalar target. Each entry is a
zero-based coordinate for the corresponding declared dimension. For a
multidimensional FMI array, coordinates follow FMI's row-major array ordering.
The tuple length must match the FMI variable rank, and coordinates outside a
known fixed dimension or structural-parameter maximum are invalid. At runtime,
the selected element must also exist in the current configured array.

For `weights`, omit `index` and bind a one-dimensional FMI array whose length
matches the mesh's morph-target influence count to update the complete weights
vector. Set `index` to bind one scalar FMI variable to a single zero-based
morph target. To bind one FMI array element to one morph target, provide both
`indices` (the FMI array coordinate) and `index` (the glTF morph-target index).
The bound glTF node must reference a mesh with compatible morph targets.

### Visibility

`visible` uses the FMI value's Boolean meaning: `false` hides the node and
`true` shows it. For a numeric output, an optional
`visibleWhenGreaterThanOrEqual` number replaces that rule; the node is visible
when the output value is greater than or equal to the threshold. Without a
threshold, Marketplace uses JavaScript truthiness for non-Boolean values (for
example, numeric `0` hides the node and a non-zero number shows it). Use a
Boolean output without a threshold or a numeric output with a threshold for
portable behavior.

### Material color

`material.color` uses the value's Boolean meaning to choose a color. A Boolean
output is recommended; for other values the current viewer uses JavaScript
truthiness:

- `trueColor` is selected for a true-like value; it defaults to `#ff2738`.
- `falseColor` is selected for a false-like value; it defaults to `#4f2028`.

Colors may be strings accepted by [Three.js r186 `Color.set`](https://github.com/mrdoob/three.js/blob/r186/docs/pages/Color.html)
(CSS color strings or `#RRGGBB`) or integer hexadecimal values from `0` through
`16777215`, written as decimal JSON numbers. For example, `16711680` is
`0xff0000` (red).
If the material has an emissive color, Marketplace also sets it: to `trueColor`
for a true-like value and to `#160b0d` otherwise. Nodes without a material
color are left unchanged.

`visibleWhenGreaterThanOrEqual`, `trueColor` and `falseColor` have meaning only
for their corresponding targets. Other known binding fields are ignored for a
target that does not use them. Unknown members have no defined meaning in
version 1.x; producers MUST NOT rely on them, and readers MUST ignore them.

## 3. Binding FMI outputs

An output binding MUST reference a variable with FMI causality `output`. Output
bindings can use any target listed above. For transform targets, the value must
be numeric or Boolean-convertible. `visible` and `material.color` use
Boolean-like values, with the numeric visibility threshold described above.

Avoid binding multiple outputs to the same target on one node. The current
viewer applies output bindings in array order, so the last usable binding to a
target determines its final value for that frame.

## 4. Binding writable inputs for dragging

An input binding enables dragging only when all of these conditions hold:

1. The FMI variable has causality `input` and a numeric type. Marketplace
   recognizes `Real`, `Integer`, `Float32`, `Float64`, `Int8`, `Int16`, `Int32`,
   `Int64`, `UInt8`, `UInt16`, `UInt32` and `UInt64` (case-insensitive).
2. `target` is a `position.*`, `translation.*` or `rotation.*` axis. Position
   and translation names for the same axis are aliases. An FMI array input
   must include `indices` to select the element dragged on that axis.
3. `scale` is finite and non-zero, so the value mapping can be inverted.
4. The node has no other eligible input binding using that same effective
   position or rotation axis. `position.x` and `translation.x`, for example,
   count as the same axis.
5. The active Gateway policy permits runtime writes for that variable.
6. The simulation is live in Step by step or Continuous mode, input editing is
   enabled, and input markers are shown.

The inverse mapping is:

```text
fmiValue = (sceneValue - offset) / scale
```

When FMU minimum or maximum values are available, Marketplace clamps the result
to those limits. Integer variables are rounded to the nearest integer and
clamped to the integer range represented by the FMU limits. Position targets
map to the node's local position. Rotation targets map to a local Euler angle
in radians; dragging horizontally across the canvas width corresponds to one
full turn. The whole-vector quaternion target `rotation`, scale, `visible`,
`material.color`, and FMI parameters are not draggable inputs.

An input binding translates a drag into an FMI input write; it does not bypass
the FMU or directly change the simulated state. Add an output binding to the
same node and axis when the model output should animate that transform. While
an output-driven rotation axis is being dragged, Marketplace treats the drag
as a relative change from the current input value. When both FMI min and max
are declared, a single gesture is limited to half of that range in either
direction around the starting value; the FMI limits still apply. The viewer
previews the drag and then follows the next model output.

Dragging is available during a live Step by step or Continuous session when
runtime writes are authorized and input editing and markers are enabled.
Continuous execution pauses while the pointer is dragging. On release,
Marketplace applies the changed input at the next model step and resumes
Continuous execution automatically if it was running. In Step by step mode,
release applies the change with one model step and leaves the session paused.
When the input is an array, Marketplace sends the updated complete array with
only the selected element changed.
Before the first simulation sample, an input-bound node uses the FMI variable's
start value when one is available.

If another eligible input binding on the node shares the same effective
position or rotation axis, Marketplace disables dragging for the competing
inputs and Gateway reports a `competing_input_target` finding. An output may
share an axis with an input to show the model's response to that input.
Output-to-output target conflicts are not currently reported by Gateway;
avoid them as well.

## 5. Validation and runtime behavior

The JSON Schema checks the binding array's JSON structure, required fields,
field types and target names. It cannot confirm that an FMU variable exists or
has the right causality and type.

For managed GLBs with FMU metadata, Gateway checks variable names, causality,
supported targets and the input-drag constraints described above. Findings are
reported to the provider, but a scene with findings can still be stored. A
public HTTPS GLB that Gateway cannot inspect is reported as unchecked. The
Marketplace viewer applies only bindings whose variable and target it
recognizes and whose defined fields pass runtime validation; unsupported or
unusable bindings do not affect the scene. A malformed known field produces an
`invalid_binding_field` Gateway finding and Marketplace ignores that binding.

The schema is an authoring and interoperability contract; Gateway does not
currently run a JSON Schema validator during upload. Its FMU-aware validation
is an additional check, not a replacement for validating the GLB extras against
the published schema.

## 6. Versioning

Version 1.2.0 is the version identified by this document and by the schema's
`$id` (`urn:decentralabs:glb-fmi-bindings:1.2.0`). It adds draggable input
bindings for scalar Euler rotation axes; the same target names were already
available for outputs in version 1.1.0. The binding array does not carry an
in-band version field; existing and new arrays described here use version
1.2.0. Patch releases clarify wording without changing interpretation.
Additive optional fields or targets that older readers can safely ignore
require a new minor version. Changes to existing field meaning, required
fields, or mapping behavior require a new major version and a distinct schema
identifier. The current runtime does not inspect a version marker in the GLB;
a future incompatible major version must use a new extras key or introduce an
in-band version marker before its semantics can be selected at runtime.

## 7. JSON Schema and examples

- [Version 1.2.0 JSON Schema](./fmi-glb-bindings.schema.json)
- [Simple output transform](#simple-output-transform)
- [Writable gate input](#writable-gate-input)

### Simple output transform

```json
"fmiBindings": [
  { "variable": "vehiclePosition", "target": "position.x", "scale": 0.01, "offset": -2 }
]
```

This maps an FMI position in centimeters into the GLB's local position units.

### Writable gate input

```json
"fmiBindings": [
  { "variable": "gatePosition", "target": "translation.x", "scale": 0.5, "offset": 1 }
]
```

Dragging the node to local `x = 3` sends input value `(3 - 1) / 0.5 = 4`,
subject to the FMU's input limits and the live-write conditions above.

### Writable rotation input

```json
"fmiBindings": [
  { "variable": "loadAngleCommand", "target": "rotation.x", "scale": 1, "offset": 0 }
]
```

This maps the node's local Euler angle in radians back to a numeric FMI input.
When the same node axis is also driven by an FMI output, the drag is relative
to the current input value and the resulting scene transform follows the next
FMU output.

### glTF vectors and FMI arrays

```json
"fmiBindings": [
  { "variable": "body.translation", "target": "translation" },
  { "variable": "body.orientation", "target": "rotation" },
  { "variable": "body.morphWeights", "target": "weights" },
  { "variable": "jointPositions", "indices": [1, 0], "target": "translation.x" },
  { "variable": "morphValues", "indices": [2], "index": 0, "target": "weights" }
]
```

The first three variables are FMI arrays with ranks and runtime lengths of 3,
4 and the mesh's morph-target count. The last two select one FMI element by
zero-based coordinates; the final mapping assigns that scalar to morph target
0. FMI array payloads use FMI's row-major ordering.
