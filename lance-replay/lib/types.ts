export const CONFIRMATION = "R-1042";
export const TARGET_GUEST = "Alex Chen";
export const TARGET_DEPART = "2026-03-17";

export type Reservation = {
  confirmation: string;
  guest: string;
  room: string;
  arrive: string;
  depart: string;
  lateCheckout: boolean;
  status: string;
};

export const BOOK: Reservation[] = [
  {
    confirmation: "R-1042",
    guest: "Alex Chen",
    room: "King 412",
    arrive: "2026-03-12",
    depart: "2026-03-15",
    lateCheckout: false,
    status: "Confirmed",
  },
  {
    confirmation: "R-2201",
    guest: "Jordan Lee",
    room: "Queen 208",
    arrive: "2026-03-10",
    depart: "2026-03-14",
    lateCheckout: true,
    status: "Confirmed",
  },
  {
    confirmation: "R-3188",
    guest: "Priya Shah",
    room: "Double 115",
    arrive: "2026-03-18",
    depart: "2026-03-20",
    lateCheckout: false,
    status: "Confirmed",
  },
];

export const SEED: Reservation = BOOK[0];

export type StepResult = {
  name: string;
  startedAt: string;
  latencyMs: number;
  pass: boolean;
  detail: string;
};

export type CallRequest = {
  raw: string;
  confirmation: string | null;
  guest: string | null;
  depart: string | null;
  lateCheckout: boolean | null;
};

export type Trace = {
  id: string;
  startedAt: string;
  finishedAt: string;
  breakRoom: boolean;
  passed: boolean;
  transcript: string;
  request: CallRequest;
  steps: StepResult[];
  before: Reservation;
  after: Reservation;
};
