# Authentication & authorization

Once your lab app is reachable through a secure remote desktop session, the next step is to integrate a control layer that decides who is allowed to access it, when, and to which specific lab. This is where DecentraLabs' authentication and authorization system comes into play.

To ensure secure, automated, and verifiable access management, DecentraLabs provides an auth-service, available as open source at [DecentraLabsCom/auth-service](https://github.com/DecentraLabsCom/auth-service). This component acts as the bridge between:

* ✅ the lab gateway's reverse proxy managing incoming remote desktop sessions, and
* 🔗 the blockchain smart contracts that govern lab reservations and permissions.

#### What does it do?

When a user connects to a lab through the marketplace and initiates a session, the auth-service performs two critical tasks:

1. **Authentication**\
   It verifies the identity of the user via their Web3 wallet or federated login (e.g., through eduGAIN or RedIRIS).
2. **Authorization**\
   It checks whether the user has a valid reservation for a specific lab (based on the smart contracts on-chain) and determines:
   * If access should be granted
   * Which lab instance should be routed
   * When the access period starts and ends

Once validated, the `auth-service` issues a signed **JWT token** containing all the necessary information (lab ID, user ID, time window, etc.), which is used by the reverse lab gateway to allow or deny access accordingly. This architecture ensures that only authorized users can access specific labs, within their allocated time slots, all with full auditability.

The `auth-service` can be used in two different ways:

* **Via DecentraLabs' public instance**, already deployed and available at [`https://sarlab.dia.uned.es/auth2`](https://sarlab.dia.uned.es/auth2). This option allows you to get started quickly without deploying your own backend.
* **Self-hosted**, if you prefer full control or do not wish to rely on a third-party service. In this case, you can deploy your own private instance of the `auth-service` using the open-source code available at [DecentraLabsCom/auth-service](https://github.com/DecentraLabsCom/auth-service).

Both approaches are fully compatible with the DecentraLabs ecosystem. Choose the one that best fits your trust model and operational preferences.

#### Summary of the Flow

1. A user reserves a lab through the DecentraLabs marketplace and the booking gets recorded onchain.
2. At the scheduled time, they request access.
3. The `auth-service` validates their identity and booking on-chain.
4. If valid, it issues a signed JWT.
5. The lab gateway receives the JWT, validates it, and opens the remote desktop session for the corresponding lab.
