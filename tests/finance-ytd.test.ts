import assert from 'node:assert/strict';
import test from 'node:test';
import { sumBusinessFinanceYtd } from '../src/lib/finance-ytd';

test('a new business report stays blank without importing the old combined balance', () => {
  assert.deepEqual(sumBusinessFinanceYtd([]), {totalRevenue:null,totalProfit:null});
  assert.deepEqual(sumBusinessFinanceYtd([{totalRevenue:null,totalProfit:null,nonPayrollExpenses:null,payrollExpenses:null}]), {totalRevenue:null,totalProfit:null});
});

test('business YTD retains zero, losses, and explicitly entered profit', () => {
  assert.deepEqual(sumBusinessFinanceYtd([
    {totalRevenue:0,totalProfit:0,nonPayrollExpenses:null,payrollExpenses:null},
    {totalRevenue:10000,totalProfit:null,nonPayrollExpenses:2000,payrollExpenses:9000},
    {totalRevenue:20000,totalProfit:5000,nonPayrollExpenses:1000,payrollExpenses:1000},
  ]), {totalRevenue:30000,totalProfit:4000});
});
