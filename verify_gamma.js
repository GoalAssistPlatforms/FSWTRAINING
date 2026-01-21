import { createPresentation } from './src/api/gamma.js';

const testGamma = async () => {
    try {
        console.log("Testing Gamma API...");
        // Log formatted key for debugging (first 4 chars)
        const key = (typeof process !== 'undefined' && process.env.VITE_GAMMA_API_KEY) || "MISSING";
        console.log("Key present:", key.substring(0, 10) + "...");

        const url = await createPresentation("History of FIFA World Cup", "A brief overview of the history of the FIFA World Cup, starting from 1930 to the present day. Key moments include Brazil's dominance, Maradona's goal, and the expansion of the tournament.");
        console.log("Success! Gamma URL:", url);
    } catch (error) {
        console.error("Gamma Test Failed:", error);
    }
};

testGamma();
