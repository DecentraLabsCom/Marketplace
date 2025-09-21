# Graphical overview

This diagram summarizes the key steps to become a lab provider on DecentraLabs:

```mermaid
flowchart TD
    A[📋 Check lab requirements]:::step --> B[🌐 Enable your lab for online access]:::step
    B --> C[🔑 Set up authentication & authorization]:::step
    C --> D["📝 Register as a provider<br/><sub>(DecentraLabs marketplace)</sub>"]:::step

    D --> E{"🔗 Tokenize & list your lab<br/><sub>(DecentraLabs marketplace)</sub>"}:::decision

    E --> F1(⚙️ Full Setup)
    F1 --> F11[Complete web form]:::step
    F11 --> G1[⛓️ Submit transaction & mint lab token]:::step

    E --> F2(⚡ Quick Setup)
    F2 --> F21[Prepare JSON metadata & upload metadata file]:::step
    F21 --> F22[Complete webform, providing metadata URL]:::step
    F22 --> G1

    G1 --> H[✅ Lab listed & published in marketplace]:::result
    H --> I[🛠️ Post-tokenization management]:::step

    classDef step fill:#f5f5f5,stroke:#333,stroke-width:1px;
    classDef decision fill:#ffd966,stroke:#333,stroke-width:1px;
    classDef result fill:#d5e8d4,stroke:#333,stroke-width:1px;

```

The image below illustrates the architecture of the infrastructure you must have at your institution:

<figure><img src="../.gitbook/assets/image.png" alt=""><figcaption></figcaption></figure>
