# Graphical overview

This diagram summarizes the key steps to become a lab provider on DecentraLabs:

```mermaid
flowchart TD
    A[📋 Check lab requirements] --> B[🌐 Enable your lab for online access]
    B --> C[🔑 Set up authentication & authorization]
    C --> D["📝 Register as a provider<br/><sub>(DecentraLabs marketplace)</sub>"]

    D --> E{"🔗 Tokenize & list your lab<br/><sub>(DecentraLabs marketplace)</sub>"}

    E --> F1(⚙️ Full Setup)
    F1 --> F11[Complete web form]
    F11 --> G1[⛓️ Submit transaction & mint lab token]

    E --> F2(⚡ Quick Setup)
    F2 --> F21[Prepare JSON metadata & upload metadata file]
    F21 --> F22[Complete webform, providing metadata URL]
    F22 --> G1

    G1 --> H[✅ Lab listed & published in marketplace]
    H --> I[🛠️ Post-tokenization management]

```

The image below illustrates the architecture of the infrastructure you must have at your institution:

<figure><img src="../.gitbook/assets/provider-infrastructure.png" alt=""><figcaption></figcaption></figure>
