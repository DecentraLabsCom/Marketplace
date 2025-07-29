# Lab requirements

To be eligible for listing on DecentraLabs, a laboratory must meet the following minimum requirements. These criteria ensure that users can interact with the lab reliably, securely, and without the need for on-site support:

1. **Fully Automated Operation**\
   The lab must be entirely controllable via software, allowing users to carry out all experimentation tasks remotely without the need for physical intervention or assistance from on-site staff.
2. **Autonomous Initialization**\
   The lab must be capable of initializing itself regardless of its prior state at the time a user connects. It should always be ready to begin a new session automatically.
3. **Resilient Final State**\
   The lab should tolerate being left in any end state by the user. Optionally, a self-recovery mechanism can be implemented to reset the system to a predefined initial state after the user disconnects.
4. **Reliable Visual Feedback**\
   If live video or visual monitoring is required for the experiment, the lab must have consistent and sufficient lighting at all times (or automatically enable proper illumination upon remote access) to ensure users can clearly observe the experiment.
