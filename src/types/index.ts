export type PaymentRequest = {
    correlaitonId: string;
    amount: number;
}

export enum ProcessorTypes {
    default = 'default',
    fallback = 'fallback'
}

export type PaymentJob = {
  correlationId: string;
  amount: number;
}