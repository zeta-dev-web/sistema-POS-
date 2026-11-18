export type Unit = "UNIT" | "KG";

export type LowStockItem = {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  unit: Unit;
};

export type ProductDTO = {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  unit: Unit;
  price: number;
  stock: number;
};

export type TenantDTO = {
  name: string;
  cvu: string | null;
  alias: string | null;
  holderName: string | null;
};

export type CartLine = {
  productId: string;
  name: string;
  unit: Unit;
  price: number;
  quantity: number;
};

export type PaymentMethod = "CASH" | "TRANSFER";

export type SalePayload = {
  clientId: string;
  /**
   * Momento exacto en que se cobró (ISO). Viaja con la venta a la cola, así
   * una venta cobrada sin internet se asienta con su hora real y no con la
   * hora en que se sincronizó.
   */
  paidAt: string;
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; quantity: number }>;
  /** Total calculado en pantalla. El servidor lo recalcula y avisa si no coincide. */
  expectedTotal: number;
  cashReceived: number | null;
  changeGiven: number | null;
  transferRef: string | null;
};

export type SaleResult =
  | {
      ok: true;
      queued?: false;
      saleId: string;
      number: number;
      total: number;
      paidAt: string;
      alreadyExisted: boolean;
      /** true si esta venta abrió el turno de caja. */
      sessionOpened: boolean;
    }
  | { ok: false; queued: true; error: string }
  | { ok: false; queued?: false; error: string; serverTotal?: number };

export type FormState = {
  error?: string;
  ok?: boolean;
};
