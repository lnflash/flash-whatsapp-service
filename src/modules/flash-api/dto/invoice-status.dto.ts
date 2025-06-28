export interface InvoiceStatusDto {
  paymentHash: string;
  paymentRequest: string;
  amount: number;
  currency: string;
  memo?: string;
  status: 'pending' | 'paid' | 'expired';
  paidAt?: Date;
  expiresAt: Date;
  whatsappUserId: string;
  messageId?: string;
}

export interface CheckInvoiceStatusDto {
  paymentHash: string;
}
