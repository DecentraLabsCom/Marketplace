# Lab requirements

To be eligible for listing on DecentraLabs, a laboratory must meet the following minimum requirements. These criteria ensure that users can interact with the lab reliably, securely, and without the need for on-site support:

1. **Fully Automated Operation**\
   The lab must be entirely controllable via software, allowing users to carry out all experimentation tasks remotely without the need for physical intervention or assistance from on-site staff. Some typical hardware and software solutions that can enable your lab to be fully automated are: robotics ([DOBOT](https://www.dobot.com), [Universal Robots](https://www.universal-robots.com/), [Kuka](https://www.kuka.com/), [Fanuc](https://www.fanuc.com/)...), general lab control software ([LabVIEW](https://www.ni.com/en/shop/labview.html), [MATLAB](https://www.mathworks.com/products/matlab.html)...), specialized lab automation software (such as [IvoryOS](https://gitlab.com/heingroup/ivoryos) for chemistry experimentation), industrial automation solutions ([TIA Portal](https://www.siemens.com/global/en/products/automation/industry-software/automation-software/tia-portal.html), [ABB Automation Builder](https://new.abb.com/plc/automationbuilder), [CX-Programmer](https://industrial.omron.eu/en/products/cx-programmer)...), or smart power strips for automated powering solutions ([APC PDU](https://www.se.com/ca/en/product-range/61799-apc-netshelter-switched-rack-pdus/?parent-subcategory-id=7410\&filter=business-3-critical-power-cooling-and-racks#products), [Netio PowerPDU](https://www.netio-products.com/), [ControlByWeb Relays](https://controlbyweb.com/relays/)...)
2. **Autonomous Initialization**\
   The lab must be capable of initializing itself regardless of its prior state at the time a user connects. It should always be ready to begin a new session automatically.
3. **Resilient Final State**\
   The lab should tolerate being left in any end state by the user. Optionally, a self-recovery mechanism can be implemented to reset the system to a predefined initial state after the user disconnects.
4. **Reliable Visual Feedback**\
   If live video or visual monitoring is required for the experiment, the lab must have consistent and sufficient lighting at all times (or automatically enable proper illumination upon remote access) to ensure users can clearly observe the experiment.
5. **Lab Gateway**\
   A Linux OS is recommended, but is not required. The most critical requirement is that a proxy system is needed to enable secure remote access, connecting public and private networks while managing routing.
6. **Lab Computer(s)**\
   A Windows 10 or Windows 11 OS is required. Each lab computer must control just one lab setup.
