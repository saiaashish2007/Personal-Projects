export type Project = {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  github: string;
  live?: { href: string; label: string };
};

export const projects: Project[] = [
  {
    id: "deep-lob",
    name: "Deep Lob",
    eyebrow: "Markets",
    description:
      "A limit-order-book prediction engine for short-horizon mid-price movement. It trains on benchmark-style CSVs, synthetic books, or free Level 2 snapshots from the Binance and Coinbase public APIs. Features include queue imbalance, microprice, spread dynamics, and an order-flow toxicity proxy, with a DeepLOB-style temporal model and a streaming inference path. The Streamlit dashboard shows the book ladder, the up/down/stationary forecast, and can use synthetic data, an uploaded CSV, or one live Coinbase BTC-USD snapshot.",
    github: "https://github.com/saiaashish2007/Personal-Projects",
    live: {
      href: "https://personal-projects-edihazbejm4yf53jdr9nfe.streamlit.app/",
      label: "Live app",
    },
  },
  {
    id: "firstcall",
    name: "Firstcall",
    eyebrow: "Voice",
    description:
      "FirstCall answers inbound calls for a personal-injury firm and turns each conversation into a structured, qualified case file. It collects accident details, injuries and treatment, checks the statute of limitations for the caller’s state, classifies severity, screens for prior representation, and builds a follow-up queue. The voice stack is an NVIDIA pipeline — Parakeet speech-to-text, Nemotron, and Magpie text-to-speech — orchestrated by Pipecat, with Cekura scoring each call against the intake script.",
    github: "https://github.com/akhimass/firstcall",
    live: {
      href: "https://firstcalllaw.vercel.app",
      label: "Live demo",
    },
  },
  {
    id: "vetcomply",
    name: "Vetcomply",
    eyebrow: "Resolution",
    description:
      "Regulatory entity resolution for private-equity-backed veterinary roll-ups. VetComply turns messy post-acquisition rosters into canonical provider and clinic identities through an API, MCP tools, and a human review console for low-confidence matches. The project is a marketing site plus an interactive demo of roster jobs, the review queue, an entity explorer, and a developers view for API keys and request logs.",
    github: "https://github.com/saiaashish2007/Personal-Projects/tree/main/vetcomply",
    live: {
      href: "https://personal-projects-vert-ten.vercel.app/",
      label: "Live site",
    },
  },
];
