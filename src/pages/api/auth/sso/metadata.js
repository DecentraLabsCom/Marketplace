import { sp } from "@/utils/sso";
import { ServiceProvider } from "saml2-js";

export default function handler(req, res) {
  // Generate XML metadata
  sp.create_metadata((err, metadata) => {
    if (err) {
      console.error("Error generating metadata:", err);
      return res.status(500).send("Error generating metadata");
    }

    // Return XML metadata as response
    res.setHeader("Content-Type", "application/xml");
    res.send(metadata);
  });
}