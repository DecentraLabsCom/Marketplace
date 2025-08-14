# Graphical overview

This diagram summarizes the key steps to become a lab provider on DecentraLabs:

```
A[📋 Check lab requirements] --> B[🌐 Enable online access for your lab]
[B] --> C[🔑 Authentication & authorization setup]
[C] --> D[📝 Register as a provider in DecentraLabs]
[D] --> E[🔗 Define metadata and access conditions to tokenize and list the lab]
[E] --> G[✅ Lab published in DecentraLabs marketplace]
```

```mermaid
graph TD
    %% Pre‑tokenization steps
    A[Check lab requirements]:::step --> B[Enable your lab for online access]:::step
    B --> C[Set up authentication & authorization]:::step
    C --> D[Register as a provider]:::step

    %% Tokenization branching
    D --> E{Tokenize & list your lab}:::decision

    %% Full setup branch
    E --> F1[Full Setup: Complete web form]:::step
    F1 --> G1[Submit transaction & mint lab token]:::step

    %% Quick setup branch
    E --> F2[Quick Setup: Prepare JSON metadata]:::step
    F2 --> G2[Upload metadata & provide its URL]:::step
    G2 --> G1  %% both branches lead to lab token minting

    %% After tokenization
    G1 --> H[Lab listed & published in marketplace]:::result
    H --> I[Post‑tokenization management]:::step

    %% Styles
    classDef step fill:#f5f5f5,stroke:#333,stroke-width:1px;
    classDef decision fill:#ffd966,stroke:#333,stroke-width:1px;
    classDef result fill:#d5e8d4,stroke:#333,stroke-width:1px;
```

The image below illustrates the architecture of the infrastructure you must have at your institution:

<figure><img src="../.gitbook/assets/provider-infrastructure.png" alt=""><figcaption></figcaption></figure>
