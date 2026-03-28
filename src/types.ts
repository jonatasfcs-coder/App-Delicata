export type PaymentType = 'dinheiro' | 'pix' | 'debito' | 'credito_vista' | 'credito_parcelado';

export interface SaleItem {
  product: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Sale {
  id?: number;
  customerName: string;
  items: SaleItem[];
  totalValue: number;
  discount?: number;
  paymentType: PaymentType;
  installments?: number;
  timestamp: number;
}

export interface Backup {
  id?: number;
  date: string;
  timestamp: number;
  content: string;
}

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito_vista: 'Crédito à Vista',
  credito_parcelado: 'Crédito Parcelado',
};
