import { sp } from "@/utils/sso";

export default function handler(req, res) {
    try {
        // Generate XML metadata
        if (typeof sp.create_metadata !== 'function') {
            throw new Error("sp.create_metadata is not a function");
        }

        const metadata = sp.create_metadata(); // ¡Sin callback!

        if (!metadata || typeof metadata !== 'string') {
            throw new Error("Generated metadata is empty or invalid");
        }

        // Return XML metadata as response
        res.setHeader("Content-Type", "application/xml");
        res.send(metadata);
    } catch (error) {
        res.status(500).send("Unexpected error generating metadata");
    }
}