/**
 * Sistema de Integración Contable
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AccountingService {
  /**
   * Generar asiento contable de venta
   */
  async createSaleEntry(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error('Pedido no encontrado');

    const entries = [];

    // Débito: Caja/Banco
    entries.push({
      account: order.paymentMethod === 'cash' ? '1.1.1.01' : '1.1.2.01',
      accountName: order.paymentMethod === 'cash' ? 'Caja' : 'Banco',
      debit: order.total,
      credit: 0,
    });

    // Crédito: Ventas
    entries.push({
      account: '4.1.1.01',
      accountName: 'Ventas',
      debit: 0,
      credit: order.subtotal,
    });

    // Crédito: IVA Débito Fiscal (si aplica)
    const iva = Math.round(order.subtotal * 0.21);
    if (iva > 0) {
      entries.push({
        account: '2.1.5.01',
        accountName: 'IVA Débito Fiscal',
        debit: 0,
        credit: iva,
      });
    }

    // Crédito: Envío (si hay)
    if (order.deliveryFee > 0) {
      entries.push({
        account: '4.1.2.01',
        accountName: 'Ingresos por Envío',
        debit: 0,
        credit: order.deliveryFee,
      });
    }

    const journalEntry = await prisma.journalEntry.create({
      data: {
        storeId: order.storeId,
        date: order.createdAt,
        description: `Venta - Pedido #${order.orderNumber}`,
        reference: order.orderNumber,
        referenceType: 'order',
        referenceId: order.id,
        entries: JSON.stringify(entries),
        totalDebit: entries.reduce((sum, e) => sum + e.debit, 0),
        totalCredit: entries.reduce((sum, e) => sum + e.credit, 0),
      },
    });

    logger.info({ journalEntryId: journalEntry.id, orderId }, 'Sale entry created');
    return journalEntry;
  }

  /**
   * Generar asiento de gasto
   */
  async createExpenseEntry(storeId, expenseData) {
    const { date, description, amount, category, paymentMethod, vendor, invoiceNumber } = expenseData;

    const entries = [];

    // Débito: Cuenta de gasto según categoría
    const expenseAccounts = {
      ingredients: { code: '5.1.1.01', name: 'Costo de Mercadería' },
      utilities: { code: '5.2.1.01', name: 'Servicios Públicos' },
      rent: { code: '5.2.2.01', name: 'Alquiler' },
      salaries: { code: '5.2.3.01', name: 'Sueldos y Jornales' },
      marketing: { code: '5.2.4.01', name: 'Publicidad y Marketing' },
      maintenance: { code: '5.2.5.01', name: 'Mantenimiento' },
      other: { code: '5.2.9.01', name: 'Otros Gastos' },
    };

    const expenseAccount = expenseAccounts[category] || expenseAccounts.other;

    entries.push({
      account: expenseAccount.code,
      accountName: expenseAccount.name,
      debit: amount,
      credit: 0,
    });

    // Crédito: Caja/Banco
    entries.push({
      account: paymentMethod === 'cash' ? '1.1.1.01' : '1.1.2.01',
      accountName: paymentMethod === 'cash' ? 'Caja' : 'Banco',
      debit: 0,
      credit: amount,
    });

    const journalEntry = await prisma.journalEntry.create({
      data: {
        storeId,
        date: new Date(date),
        description,
        reference: invoiceNumber,
        referenceType: 'expense',
        vendor,
        entries: JSON.stringify(entries),
        totalDebit: amount,
        totalCredit: amount,
      },
    });

    return journalEntry;
  }

  /**
   * Generar balance de sumas y saldos
   */
  async getTrialBalance(storeId, startDate, endDate) {
    const entries = await prisma.journalEntry.findMany({
      where: {
        storeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    });

    const accounts = {};

    entries.forEach(entry => {
      const items = JSON.parse(entry.entries);
      items.forEach(item => {
        if (!accounts[item.account]) {
          accounts[item.account] = {
            code: item.account,
            name: item.accountName,
            debit: 0,
            credit: 0,
          };
        }
        accounts[item.account].debit += item.debit;
        accounts[item.account].credit += item.credit;
      });
    });

    const accountList = Object.values(accounts).map(acc => ({
      ...acc,
      balance: acc.debit - acc.credit,
    }));

    return {
      period: { startDate, endDate },
      accounts: accountList.sort((a, b) => a.code.localeCompare(b.code)),
      totals: {
        debit: accountList.reduce((sum, a) => sum + a.debit, 0),
        credit: accountList.reduce((sum, a) => sum + a.credit, 0),
      },
    };
  }

  /**
   * Estado de resultados
   */
  async getIncomeStatement(storeId, startDate, endDate) {
    const trialBalance = await this.getTrialBalance(storeId, startDate, endDate);

    const revenue = trialBalance.accounts
      .filter(a => a.code.startsWith('4'))
      .reduce((sum, a) => sum + a.credit - a.debit, 0);

    const costOfSales = trialBalance.accounts
      .filter(a => a.code.startsWith('5.1'))
      .reduce((sum, a) => sum + a.debit - a.credit, 0);

    const operatingExpenses = trialBalance.accounts
      .filter(a => a.code.startsWith('5.2'))
      .reduce((sum, a) => sum + a.debit - a.credit, 0);

    const grossProfit = revenue - costOfSales;
    const operatingProfit = grossProfit - operatingExpenses;

    return {
      period: { startDate, endDate },
      revenue,
      costOfSales,
      grossProfit,
      grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
      operatingExpenses,
      operatingProfit,
      operatingMargin: revenue > 0 ? Math.round((operatingProfit / revenue) * 100) : 0,
    };
  }

  /**
   * Exportar a formato contable
   */
  async exportToAccountingFormat(storeId, startDate, endDate, format = 'csv') {
    const entries = await prisma.journalEntry.findMany({
      where: {
        storeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'asc' },
    });

    const rows = [];

    entries.forEach(entry => {
      const items = JSON.parse(entry.entries);
      items.forEach(item => {
        rows.push({
          date: entry.date.toISOString().split('T')[0],
          reference: entry.reference,
          description: entry.description,
          account: item.account,
          accountName: item.accountName,
          debit: item.debit,
          credit: item.credit,
        });
      });
    });

    if (format === 'csv') {
      const headers = 'Fecha,Referencia,Descripción,Cuenta,Nombre Cuenta,Debe,Haber\n';
      const csv = rows.map(r => 
        `${r.date},${r.reference},${r.description},${r.account},${r.accountName},${r.debit},${r.credit}`
      ).join('\n');
      return headers + csv;
    }

    return rows;
  }

  /**
   * Generar factura electrónica (estructura)
   */
  async generateInvoiceData(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, store: true },
    });

    if (!order) throw new Error('Pedido no encontrado');

    return {
      invoiceType: 'B', // Factura B para consumidor final
      invoiceNumber: order.orderNumber,
      date: order.createdAt,
      seller: {
        name: order.store.name,
        cuit: order.store.cuit,
        address: order.store.address,
      },
      buyer: {
        name: order.customerName,
        documentType: 'DNI',
        document: '',
      },
      items: order.items.map(item => ({
        description: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        ivaRate: 21,
        ivaAmount: Math.round(item.subtotal * 0.21 / 1.21),
      })),
      subtotal: order.subtotal,
      iva: Math.round(order.subtotal * 0.21 / 1.21),
      total: order.total,
    };
  }
}

export const accountingService = new AccountingService();
export default accountingService;

