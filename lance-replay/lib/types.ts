export const CONFIRMATION = "R-1042";
export const TARGET_GUEST = "Alex Chen";
export const TARGET_DEPART = "2026-03-17";

export const STEP_NAMES = [
  "Lookup reservation R-1042",
  "Verify guest name",
  "Update departure to 2026-03-17",
  "Add late checkout",
  "Read back and confirm",
] as const;

export type Reservation = {
  confirmation: string;
  guest: string;
  room: string;
  arrive: string;
  depart: string;
  lateCheckout: boolean;
  status: string;
};

export const SEED: Reservation = {
  confirmation: CONFIRMATION,
  guest: TARGET_GUEST,
  room: "King 412",
  arrive: "2026-03-12",
  depart: "2026-03-15",
  lateCheckout: false,
  status: "Confirmed",
};

export type StepResult = {
  name: string;
  startedAt: string;
  latencyMs: number;
  pass: boolean;
  detail: string;
};

export type Trace = {
  id: string;
  startedAt: string;
  finishedAt: string;
  breakRoom: boolean;
  passed: boolean;
  steps: StepResult[];
  before: Reservation;
  after: Reservation;
};
