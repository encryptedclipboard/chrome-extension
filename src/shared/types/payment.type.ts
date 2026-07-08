import { Currency, PaymentStatus } from "../enums";

export interface IPaymentRecord {
  _id: string;
  subscriptionId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  reference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAdminPaymentRecord extends IPaymentRecord {
  userId: string;
  dodoTxnId?: string;
}
