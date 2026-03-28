import Dexie, { type Table } from 'dexie';
import { Sale, Backup } from './types';

export class DelicataDatabase extends Dexie {
  sales!: Table<Sale>;
  backups!: Table<Backup>;

  constructor() {
    super('DelicataDB');
    this.version(2).stores({
      sales: '++id, paymentType, timestamp',
      backups: '++id, date, timestamp'
    });
  }
}

export const db = new DelicataDatabase();
