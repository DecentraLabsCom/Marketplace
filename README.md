---
description: >-
  World-first decentralized marketplace to list, browser and access online lab resources
---

# Marketplace dApp

### 🌍 About DecentraLabs

DecentraLabs is a community-driven initiative led by [Nebulous Systems](https://nebsyst.com/) in collaboration with international academic partners such as [UNED](https://www.uned.es/) and [Blockchain@UBC](https://blockchain.ubc.ca/). The project aims to redefine how online laboratories (OLs) are shared, accessed, and sustained across borders. By leveraging decentralized technologies (including smart contracts, token-based incentives, and federated authentication), DecentraLabs builds an open, interoperable, and sustainable infrastructure for scientific experimentation, education, and research and fosters an innovative ecosystem where knowledge is democratized and shared across global communities. All core components are open source and developed with transparency, inclusion, and public good in mind.

### 🧪 DecentraLabs Marketplace

The DecentraLabs Marketplace is a decentralized platform where educational and research institutions, as well as original lab equipment manufacturers, can list their online laboratories, manage access conditions, and receive $LAB tokens as compensation for usage. At the same time, students, teachers, and researchers around the world can discover, reserve, and interact with real lab equipment remotely, using only a crypto wallet or institutional Single Sign-On (SSO).

Each lab can be offered for free or for a fee, at the discretion of the provider. Access is controlled via smart contracts and enforced through a secure, tokenized infrastructure. This ensures transparency, verifiability, and fair rewards for contributors; all without centralized intermediaries.

DecentraLabs Marketplace aims to offer a curated catalog of online laboratories shared by leading educational and research institutions worldwide. Whether you’re looking to publish underused lab systems or access cutting-edge infrastructure for remote experiments, the DecentraLabs Marketplace is your gateway to a global, decentralized network of scientific collaboration.

#### 🔧 For Providers

Register and tokenize your online lab assets using smart contracts.

Manage availability and access conditions.

Earn $LAB tokens as users reserve and utilize your labs.

Leverage a decentralized, tamper-proof system without intermediaries.

#### 🎓 For Consumers

Explore a growing catalog of online labs, from electronics to robotics.

Authenticate using your crypto wallet or institutional SSO (e.g., eduGAIN).

Make reservations using $LAB tokens, with smart-contract-backed guarantees.

Access labs remotely, safely, and on-demand.

#### 🛠️ Powered by

Ethereum-compatible smart contracts (ERC-2535 + NFTs + $LAB token).

Federated authentication for institutional users.

Open-source architecture, promoting transparency and collaboration.

### Getting Started

This dApp is developed as a [Next.js](https://nextjs.org) project using the App Router.

First, install Next.js: https://nextjs.org/docs/app/getting-started/installation

Then, install all dependencies required by the project using package.json:

```bash
npm install package.json
```

Once the framework and the dependencies are installed, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/layout.js` or `src/app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Learn More

To learn more about DecentraLabs and how we are revolutionizing online experimentation through blockchain technologies, visit our webpage: [https://decentralabs.nebsyst.com/](https://decentralabs.nebsyst.com/)

To learn more about Next.js, take a look at the following resources:

* [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
* [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

### Deploy on Vercel

The easiest way to deploy an Next.js app like this is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template\&filter=next.js\&utm_source=create-next-app\&utm_campaign=create-next-app-readme) from the creators of Next.js.

### JWT Key Rotation & Public Key Availability

- RSA keys for JWT signing live under certificates/jwt/ (ignored from git). The public verification key is committed at public/.well-known/public-key.pem so Vercel serves it automatically at /.well-known/public-key.pem.
- The quarterly workflow .github/workflows/jwt-key-rotation.yml runs npm run rotate-jwt-keys, backs up the previous pair, pushes the new private key to Vercel env vars and **auto-syncs the regenerated public key** into public/.well-known/public-key.pem.
- For manual rotations run npm run rotate-jwt-keys --force. The script copies the freshly generated public key to the .well-known folder, so committing that file keeps the hosted endpoint aligned with whatever private key you deploy.
- After any rotation trigger a deployment (or let the workflow do it), then verify both /api/auth/test-jwt and /.well-known/public-key.pem to ensure auth-service caches the new key.
